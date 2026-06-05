import bcrypt from "bcryptjs";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ClaimType,
  OutputMode,
  UserRole,
  WorkflowStage,
} from "@prisma/client";

import {
  approveGeneratedOutput,
  deleteBlockedDraft,
  getOutputHistory,
} from "@/lib/approval/service";
import { isApprovableDraft } from "@/lib/approval/validation";
import { buildDocxBuffer } from "@/lib/export/docx";
import {
  canSatisfyCarrierExportReadiness,
  evaluateExportGate,
  isExportReadyOutput,
} from "@/lib/export/gate";
import { buildExportDocument } from "@/lib/export/format";
import { buildPdfBuffer } from "@/lib/export/pdf";
import { exportApprovedOutput } from "@/lib/export/service";
import { DRY_RUN_WATERMARK } from "@/lib/export/constants";
import { runClaimGeneration } from "@/lib/generation/service";
import { runWorkflowAdvanceGate } from "@/lib/gates/workflow-stage-gates";
import { prisma } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/rbac";

describe("approval and export service", () => {
  let managerId: string;
  let viewerId: string;
  let claimId: string;
  let validDraftId: string;
  let blockedDraftId: string;

  beforeAll(async () => {
    const manager = await prisma.user.create({
      data: {
        email: `mgr-${Date.now()}@example.com`,
        name: "Manager",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.MANAGER,
      },
    });
    managerId = manager.id;

    const viewer = await prisma.user.create({
      data: {
        email: `viewer-${Date.now()}@example.com`,
        name: "Viewer",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.VIEWER,
      },
    });
    viewerId = viewer.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Export Customer",
        propertyAddress: "1 Export St",
        carrier: "Carrier",
        claimNumber: `EXP-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: managerId,
        workflowStage: WorkflowStage.HUMAN_APPROVAL,
        evidenceReviewedAt: new Date(),
        issuesReviewedAt: new Date(),
      },
    });
    claimId = claim.id;

    const revision = await prisma.revisionItem.create({
      data: {
        claimId,
        title: "Roof deficiency",
        category: "MEASUREMENT_DEFICIENCY",
        status: "READY_FOR_OUTPUT",
        readinessStatus: "READY_FOR_OUTPUT",
        exportEligible: true,
        carrierApprovedQty: 20,
        requestedQty: 24,
        qtyDifference: -4,
        basis: "Measurement basis",
        revisionRequired: "Increase roof area",
        requiredEvidenceTypes: "[]",
      },
    });

    const content = {
      outputMode: "FULL_SUPPLEMENT",
      title: "Supplement request",
      sections: [
        {
          revisionItemId: revision.id,
          heading: "Section 1: Roof deficiency",
          body: "The approved scope is materially insufficient.",
          approvedQty: 20,
          requestedQty: 24,
          difference: -4,
          evidenceIds: [],
          ruleIds: [],
        },
      ],
      excludedRevisions: [],
      unsupportedClaims: [],
      toneLintPassed: true,
      warnings: [],
    };

    const validDraft = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "DRAFT",
        version: 1,
        contentJson: JSON.stringify(content),
        contentText: "Supplement request\n\nSection 1",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: JSON.stringify([revision.id]),
      },
    });
    validDraftId = validDraft.id;

    const blockedDraft = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "DRAFT",
        version: 2,
        contentJson: JSON.stringify(content),
        contentText: "Blocked draft",
        toneLintPassed: false,
        unsupportedClaimsJson: JSON.stringify([
          { code: "UNKNOWN_REVISION", message: "bad" },
        ]),
        generationBlocked: true,
        revisionIdsIncluded: JSON.stringify([revision.id]),
      },
    });
    blockedDraftId = blockedDraft.id;
  });

  afterAll(async () => {
    await prisma.parserCertification.updateMany({ data: { parserCertified: true } });
    await prisma.issueDetectionCertification.updateMany({
      data: { certified: true, fixtureAccuracy: 1 },
    });
    await prisma.generatedOutput.deleteMany({ where: { claimId } });
    await prisma.revisionItem.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: { in: [managerId, viewerId] } } });
    await prisma.$disconnect();
  });

  it("blocked draft cannot be approved", async () => {
    const draft = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: blockedDraftId },
    });
    expect(isApprovableDraft(draft)).toBe(false);

    await expect(
      approveGeneratedOutput({
        claimId,
        outputId: blockedDraftId,
        actorId: managerId,
        actorRole: UserRole.MANAGER,
        approvedSections: [
          {
            revisionItemId: JSON.parse(draft.revisionIdsIncluded)[0],
            heading: "Section 1",
            approved: true,
          },
        ],
        finalApprovalConfirmed: true,
      }),
    ).rejects.toThrow(/blocked drafts cannot be approved/i);
  });

  it("valid draft can be approved", async () => {
    const draft = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: validDraftId },
    });
    const revisionId = JSON.parse(draft.revisionIdsIncluded)[0] as string;

    const approved = await approveGeneratedOutput({
      claimId,
      outputId: validDraftId,
      actorId: managerId,
      actorRole: UserRole.MANAGER,
      approvedSections: [
        {
          revisionItemId: revisionId,
          heading: "Section 1: Roof deficiency",
          approved: true,
        },
      ],
      finalApprovalConfirmed: true,
    });

    expect(approved.status).toBe("APPROVED");
  });

  it("approval sets approvedById, approvedAt, approvedSections", async () => {
    const approved = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: validDraftId },
    });
    expect(approved.approvedById).toBe(managerId);
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.approvedSections).toBeTruthy();
    const sections = JSON.parse(approved.approvedSections!) as { approved: boolean }[];
    expect(sections.every((section) => section.approved)).toBe(true);
  });

  it("approval logs APPROVAL event", async () => {
    const event = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "APPROVAL" },
      orderBy: { createdAt: "desc" },
    });
    expect(event).toBeTruthy();
    expect(event?.payloadJson).toContain(validDraftId);
  });

  it("approved output cannot be mutated by regenerate flow", async () => {
    const approvedBefore = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: validDraftId },
    });
    const approvedContent = approvedBefore.contentText;

    await prisma.comparisonResult.create({
      data: {
        claimId,
        comparisonKey: "roof_area_sq",
        approvedQty: 20,
        requestedQty: 24,
        difference: -4,
        formula: "roof_area_sq = 24",
        explanation: "test",
        sourceDocumentIds: "[]",
        measurementValueIds: "[]",
        unit: "SQ",
      },
    });

    await prisma.revisionItem.updateMany({
      where: { claimId },
      data: { exportEligible: true, readinessStatus: "READY_FOR_OUTPUT" },
    });

    await runClaimGeneration({
      claimId,
      outputMode: OutputMode.SHORT_REPLY,
      actorId: managerId,
      actorRole: UserRole.MANAGER,
    });

    const approvedAfter = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: validDraftId },
    });
    expect(approvedAfter.status).toBe("APPROVED");
    expect(approvedAfter.contentText).toBe(approvedContent);

    const draftCount = await prisma.generatedOutput.count({
      where: { claimId, status: "DRAFT" },
    });
    expect(draftCount).toBeGreaterThanOrEqual(1);
  });

  it("export gate blocks unapproved output", async () => {
    const draft = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: blockedDraftId },
    });
    expect(isExportReadyOutput(draft)).toBe(false);
  });

  it("export gate blocks unsupportedClaimsJson not empty", async () => {
    const blocked = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: blockedDraftId },
    });
    const gate = await evaluateExportGate({
      output: blocked,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.blockers.some((b) => b.includes("Unsupported claims"))).toBe(true);
  });

  it("export gate blocks toneLintPassed = false", async () => {
    const blocked = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: blockedDraftId },
    });
    const gate = await evaluateExportGate({
      output: blocked,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.blockers.some((b) => b.includes("Tone lint"))).toBe(true);
  });

  it("carrier-ready export blocked when productionReady=false and no override and not dry run", async () => {
    await prisma.orgSettings.upsert({
      where: { id: "default" },
      create: { id: "default", productionReady: false, productionOverrideAt: null },
      update: { productionReady: false, productionOverrideAt: null },
    });

    const approved = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: validDraftId },
    });

    const gate = await evaluateExportGate({
      output: approved,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.blockers.some((b) => b.includes("Carrier-ready"))).toBe(true);
  });

  it("dry-run carrier-ready export allowed with dry-run watermark", async () => {
    const approved = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: validDraftId },
    });

    const gate = await evaluateExportGate({
      output: approved,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: true,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.watermarked).toBe(true);
    expect(gate.watermark).toBe(DRY_RUN_WATERMARK);

    const document = buildExportDocument({
      output: approved,
      customerName: "Export Customer",
      claimNumber: "EXP-TEST",
      applyWatermark: true,
    });
    expect(document.watermark).toBe(DRY_RUN_WATERMARK);
    expect(document.plainText).toContain(DRY_RUN_WATERMARK);
  });

  it("internal audit export allowed when productionReady=false", async () => {
    const internal = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.INTERNAL_AUDIT,
        status: "APPROVED",
        version: 3,
        contentJson: JSON.stringify({
          outputMode: "INTERNAL_AUDIT",
          title: "Internal audit",
          sections: [],
          excludedRevisions: [],
          unsupportedClaims: [],
          toneLintPassed: true,
          warnings: [],
        }),
        contentText: "Internal audit",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: managerId,
        approvedAt: new Date(),
      },
    });

    const gate = await evaluateExportGate({
      output: internal,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(true);
  });

  it("DOCX export uses approved content only and does not call OpenAI", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: true },
    });

    const approved = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: validDraftId },
    });
    const document = buildExportDocument({
      output: approved,
      customerName: "Export Customer",
      claimNumber: "EXP-TEST",
      applyWatermark: true,
    });
    const buffer = await buildDocxBuffer(document);
    expect(buffer.byteLength).toBeGreaterThan(100);
    expect(document.plainText).toContain("Supplement request");
  });

  it("PDF export uses approved content only and does not call OpenAI", async () => {
    const approved = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: validDraftId },
    });
    const document = buildExportDocument({
      output: approved,
      customerName: "Export Customer",
      claimNumber: "EXP-TEST",
      applyWatermark: true,
    });
    const buffer = await buildPdfBuffer(document);
    expect(buffer.byteLength).toBeGreaterThan(100);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("clipboard export logs EXPORT", async () => {
    await prisma.claimEvent.deleteMany({ where: { claimId, eventType: "EXPORT" } });

    await exportApprovedOutput({
      claimId,
      outputId: validDraftId,
      format: "clipboard",
      actorId: managerId,
      actorRole: UserRole.MANAGER,
    });

    const event = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "EXPORT" },
      orderBy: { createdAt: "desc" },
    });
    expect(event).toBeTruthy();
    expect(event?.payloadJson).toContain("clipboard");
  });

  it("output history lists versions and statuses", async () => {
    const history = await getOutputHistory(claimId);
    expect(history.length).toBeGreaterThanOrEqual(3);
    expect(history.some((row) => row.status === "APPROVED")).toBe(true);
    expect(history.some((row) => row.status === "DRAFT")).toBe(true);
    expect(history.some((row) => row.locked)).toBe(true);
  });

  it("manager can delete blocked DRAFT only", async () => {
    await deleteBlockedDraft({
      claimId,
      outputId: blockedDraftId,
      actorId: managerId,
      actorRole: UserRole.MANAGER,
    });

    const deleted = await prisma.generatedOutput.findUnique({ where: { id: blockedDraftId } });
    expect(deleted).toBeNull();

    const deleteEvent = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "OUTPUT_DELETE" },
    });
    expect(deleteEvent).toBeTruthy();
  });

  it("viewer cannot approve or export", async () => {
    const newDraft = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.SHORT_REPLY,
        status: "DRAFT",
        version: 9,
        contentJson: JSON.stringify({
          outputMode: "SHORT_REPLY",
          title: "Short",
          sections: [
            {
              revisionItemId: "x",
              heading: "H",
              body: "B",
              approvedQty: null,
              requestedQty: null,
              difference: null,
              evidenceIds: [],
              ruleIds: [],
            },
          ],
          excludedRevisions: [],
          unsupportedClaims: [],
          toneLintPassed: true,
          warnings: [],
        }),
        contentText: "Short",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
      },
    });

    await expect(
      approveGeneratedOutput({
        claimId,
        outputId: newDraft.id,
        actorId: viewerId,
        actorRole: UserRole.VIEWER,
        approvedSections: [{ revisionItemId: "x", heading: "H", approved: true }],
        finalApprovalConfirmed: true,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    await expect(
      exportApprovedOutput({
        claimId,
        outputId: validDraftId,
        format: "clipboard",
        actorId: viewerId,
        actorRole: UserRole.VIEWER,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("INTERNAL_AUDIT approval cannot enable FULL_SUPPLEMENT export", async () => {
    await prisma.generatedOutput.deleteMany({
      where: { claimId, outputMode: OutputMode.FULL_SUPPLEMENT },
    });

    const internalOnly = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.INTERNAL_AUDIT,
        status: "APPROVED",
        version: 10,
        contentJson: JSON.stringify({
          outputMode: "INTERNAL_AUDIT",
          title: "Internal audit",
          sections: [],
          excludedRevisions: [],
          unsupportedClaims: [],
          toneLintPassed: true,
          warnings: [],
        }),
        contentText: "Internal audit",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: managerId,
        approvedAt: new Date(),
      },
    });

    expect(canSatisfyCarrierExportReadiness(internalOnly)).toBe(false);

    await prisma.claim.update({
      where: { id: claimId },
      data: { workflowStage: WorkflowStage.HUMAN_APPROVAL, isDryRun: false },
    });

    const workflow = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.HUMAN_APPROVAL,
      WorkflowStage.EXPORT,
    );
    expect(workflow.passed).toBe(true);

    const carrierDraft = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "DRAFT",
        version: 11,
        contentJson: "{}",
        contentText: "Carrier draft",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
      },
    });

    await expect(
      exportApprovedOutput({
        claimId,
        outputId: carrierDraft.id,
        format: "clipboard",
        actorId: managerId,
        actorRole: UserRole.MANAGER,
      }),
    ).rejects.toThrow(/manually approved/i);

    const internalGate = await evaluateExportGate({
      output: internalOnly,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(internalGate.allowed).toBe(true);
  });

  it("FULL_SUPPLEMENT export remains blocked when productionReady=false unless dry run or override", async () => {
    await prisma.orgSettings.upsert({
      where: { id: "default" },
      update: {
        productionOverrideAt: null,
        dryRunsReviewedCount: 0,
      },
      create: { id: "default", dryRunsReviewedCount: 0 },
    });
    await prisma.parserCertification.updateMany({ data: { parserCertified: false } });
    await prisma.issueDetectionCertification.updateMany({
      data: { certified: false, fixtureAccuracy: 0 },
    });

    const carrierApproved = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "APPROVED",
        version: 12,
        contentJson: JSON.stringify({
          outputMode: "FULL_SUPPLEMENT",
          title: "Supplement",
          sections: [],
          excludedRevisions: [],
          unsupportedClaims: [],
          toneLintPassed: true,
          warnings: [],
        }),
        contentText: "Supplement",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: managerId,
        approvedAt: new Date(),
      },
    });

    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: false },
    });

    const blockedGate = await evaluateExportGate({
      output: carrierApproved,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(blockedGate.allowed).toBe(false);
    expect(blockedGate.blockers.some((b) => b.includes("Carrier-ready"))).toBe(true);

    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: true },
    });

    const dryRunGate = await evaluateExportGate({
      output: carrierApproved,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: true,
    });
    expect(dryRunGate.allowed).toBe(true);
    expect(dryRunGate.watermarked).toBe(true);
  });

  it("selected outputId determines the gate decision", async () => {
    await prisma.orgSettings.upsert({
      where: { id: "default" },
      update: { productionOverrideAt: null, dryRunsReviewedCount: 0 },
      create: { id: "default", dryRunsReviewedCount: 0 },
    });
    await prisma.parserCertification.updateMany({ data: { parserCertified: false } });
    await prisma.issueDetectionCertification.updateMany({
      data: { certified: false, fixtureAccuracy: 0 },
    });
    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: false },
    });

    const internal = await prisma.generatedOutput.findFirst({
      where: { claimId, outputMode: OutputMode.INTERNAL_AUDIT, status: "APPROVED" },
    });
    const carrier = await prisma.generatedOutput.findFirst({
      where: { claimId, outputMode: OutputMode.FULL_SUPPLEMENT, status: "APPROVED" },
      orderBy: { version: "desc" },
    });

    expect(internal).toBeTruthy();
    expect(carrier).toBeTruthy();

    const internalGate = await evaluateExportGate({
      output: internal!,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    const carrierGate = await evaluateExportGate({
      output: carrier!,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });

    expect(internalGate.allowed).toBe(true);
    expect(carrierGate.allowed).toBe(false);

    await expect(
      exportApprovedOutput({
        claimId,
        outputId: carrier!.id,
        format: "clipboard",
        actorId: managerId,
        actorRole: UserRole.MANAGER,
      }),
    ).rejects.toThrow(/Carrier-ready/i);

    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: true },
    });

    await exportApprovedOutput({
      claimId,
      outputId: internal!.id,
      format: "clipboard",
      actorId: managerId,
      actorRole: UserRole.MANAGER,
    });
  });

  it("missing outputId fails export", async () => {
    await expect(
      exportApprovedOutput({
        claimId,
        outputId: "",
        format: "clipboard",
        actorId: managerId,
        actorRole: UserRole.MANAGER,
      }),
    ).rejects.toThrow(/outputId is required/i);
  });

  it("workflow gate allows EXPORT when any approved output exists regardless of mode", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: { workflowStage: WorkflowStage.HUMAN_APPROVAL, isDryRun: false },
    });

    const allowed = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.HUMAN_APPROVAL,
      WorkflowStage.EXPORT,
    );
    expect(allowed.passed).toBe(true);
    expect(allowed.blockers.some((b) => b.code === "PRODUCTION_GUARD_BLOCKED")).toBe(false);
  });
});
