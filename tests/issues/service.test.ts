import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType, UserRole, WorkflowStage } from "@prisma/client";

import { prisma } from "@/lib/db";
import { COMPARISON_KEYS } from "@/lib/comparison/keys";
import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import {
  reviewClaimIssues,
  runClaimIssueDetection,
  updateRevisionItem,
} from "@/lib/issues/service";
import { runWorkflowAdvanceGate } from "@/lib/gates/workflow-stage-gates";

describe("issue detection service", () => {
  let userId: string;
  let claimId: string;
  let carrierDocId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `issue-${Date.now()}@example.com`,
        name: "Issue User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Issue Customer",
        propertyAddress: "1 Issue St",
        carrier: "Carrier",
        claimNumber: `ISS-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
        manufacturerSystem: "Owens Corning",
        workflowStage: WorkflowStage.RULE_ISSUE_DETECTION,
      },
    });
    claimId = claim.id;

    const carrierDoc = await prisma.document.create({
      data: {
        claimId,
        type: "CARRIER_ESTIMATE",
        fileName: "carrier.pdf",
        mimeType: "application/pdf",
        storageKey: "claims/test/carrier.pdf",
        fileSize: 100,
        uploadedById: userId,
      },
    });
    carrierDocId = carrierDoc.id;

    await prisma.estimateLineItem.create({
      data: {
        claimId,
        documentId: carrierDocId,
        description: "R&R Laminated comp shingle",
        quantity: 20,
        unit: "SQ",
        reviewStatus: "ACCEPTED",
      },
    });

    await prisma.estimateLineItem.create({
      data: {
        claimId,
        documentId: carrierDocId,
        description: "Rejected shingle",
        quantity: 99,
        unit: "SQ",
        reviewStatus: "REJECTED",
      },
    });

    await prisma.estimateLineItem.create({
      data: {
        claimId,
        documentId: carrierDocId,
        description: "15 lb felt underlayment",
        quantity: 20,
        unit: "SQ",
        reviewStatus: "ACCEPTED",
      },
    });

    const measurementDoc = await prisma.document.create({
      data: {
        claimId,
        type: "EAGLEVIEW",
        fileName: "eagleview.pdf",
        mimeType: "application/pdf",
        storageKey: "claims/test/eagleview.pdf",
        fileSize: 100,
        uploadedById: userId,
      },
    });

    const report = await prisma.measurementReport.create({
      data: {
        claimId,
        documentId: measurementDoc.id,
        vendor: "EAGLEVIEW",
        reportName: "EV",
      },
    });

    await prisma.measurementValue.create({
      data: {
        reportId: report.id,
        claimId,
        key: MEASUREMENT_KEYS.ROOF_AREA_SQ,
        value: 24.33,
        unit: "SQ",
        reviewStatus: "ACCEPTED",
      },
    });

    await prisma.measurementValue.create({
      data: {
        reportId: report.id,
        claimId,
        key: MEASUREMENT_KEYS.EAVE_LF,
        value: 156,
        unit: "LF",
        reviewStatus: "ACCEPTED",
      },
    });

    await prisma.comparisonResult.create({
      data: {
        claimId,
        comparisonKey: COMPARISON_KEYS.ROOF_AREA_SQ,
        approvedQty: 20,
        requestedQty: 24.33,
        difference: -4.33,
        pctDifference: -17.8,
        formula: "roof_area_sq = 24.33",
        physicallySufficient: false,
        explanation: "Carrier 20 SQ vs measurement 24.33 SQ",
        sourceDocumentIds: JSON.stringify([carrierDocId, measurementDoc.id]),
        measurementValueIds: "[]",
        unit: "SQ",
      },
    });

    await prisma.comparisonResult.create({
      data: {
        claimId,
        comparisonKey: COMPARISON_KEYS.STARTER_EAVE_LF,
        approvedQty: 0,
        requestedQty: 156,
        difference: -156,
        formula: "starter_eave_lf = eave_lf (156)",
        physicallySufficient: false,
        explanation: "No starter line",
        sourceDocumentIds: "[]",
        measurementValueIds: "[]",
        unit: "LF",
        isWarning: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.ruleEvaluation.deleteMany({ where: { claimId } });
    await prisma.revisionItem.deleteMany({ where: { claimId } });
    await prisma.comparisonResult.deleteMany({ where: { claimId } });
    await prisma.measurementValue.deleteMany({ where: { claimId } });
    await prisma.measurementReport.deleteMany({ where: { claimId } });
    await prisma.estimateLineItem.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.document.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("blocks issue detection until comparisonReviewedAt exists", async () => {
    await expect(
      runClaimIssueDetection({
        claimId,
        actorId: userId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toThrow(/comparison must be reviewed/i);
  });

  it("creates RevisionItems from reviewed comparisons only", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: { comparisonReviewedAt: new Date() },
    });

    const first = await runClaimIssueDetection({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    expect(first.revisions.length).toBeGreaterThan(0);
    expect(first.revisions.some((r) => r.category === "MEASUREMENT_DEFICIENCY")).toBe(true);
    expect(first.revisions.some((r) => r.detectionKey === "hard:starter_omitted_eave")).toBe(true);
    expect(first.revisions.some((r) => r.detectionKey === "hard:oc_felt_synthetic_review")).toBe(
      true,
    );

    const rejectedBased = first.revisions.find((r) =>
      r.carrierApprovedLineItem?.includes("Rejected"),
    );
    expect(rejectedBased).toBeUndefined();
  });

  it("re-run detection replaces draft items without duplication", async () => {
    const countBefore = await prisma.revisionItem.count({ where: { claimId } });
    await runClaimIssueDetection({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });
    const countAfter = await prisma.revisionItem.count({ where: { claimId } });
    expect(countAfter).toBe(countBefore);

    const keys = await prisma.revisionItem.findMany({
      where: { claimId },
      select: { detectionKey: true },
    });
    const unique = new Set(keys.map((k) => k.detectionKey));
    expect(unique.size).toBe(keys.length);
  });

  it("manual edit logs MANUAL_EDIT and exclude sets exportEligible false", async () => {
    const revision = await prisma.revisionItem.findFirst({ where: { claimId } });
    expect(revision).toBeTruthy();

    await updateRevisionItem({
      claimId,
      revisionId: revision!.id,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
      action: "edit",
      title: "Edited title",
    });

    const editEvent = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "MANUAL_EDIT" },
    });
    expect(editEvent).toBeTruthy();

    const excluded = await updateRevisionItem({
      claimId,
      revisionId: revision!.id,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
      action: "exclude",
      excludedReason: "Not pursuing",
    });
    expect(excluded.exportEligible).toBe(false);
    expect(excluded.status).toBe("EXCLUDED");
  });

  it("issue review sets issuesReviewedAt", async () => {
    const updated = await reviewClaimIssues({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });
    expect(updated.issuesReviewedAt).toBeTruthy();
  });

  it("zero issues requires explicit NO_ISSUES_FOUND audit event", async () => {
    const emptyClaim = await prisma.claim.create({
      data: {
        customerName: "Empty Issues",
        propertyAddress: "2 Issue St",
        carrier: "Carrier",
        claimNumber: `EMPTY-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
        comparisonReviewedAt: new Date(),
      },
    });

    await prisma.comparisonResult.create({
      data: {
        claimId: emptyClaim.id,
        comparisonKey: "roof_area_sq",
        approvedQty: 20,
        requestedQty: 20,
        difference: 0,
        formula: "roof_area_sq = 20",
        physicallySufficient: true,
        explanation: "Equal",
        sourceDocumentIds: "[]",
        measurementValueIds: "[]",
        unit: "SQ",
      },
    });

    await runClaimIssueDetection({
      claimId: emptyClaim.id,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    await expect(
      reviewClaimIssues({
        claimId: emptyClaim.id,
        actorId: userId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toThrow(/No issues found/i);

    await reviewClaimIssues({
      claimId: emptyClaim.id,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
      noIssuesFound: true,
    });

    const noIssuesEvent = await prisma.claimEvent.findFirst({
      where: { claimId: emptyClaim.id, eventType: "NO_ISSUES_FOUND" },
    });
    expect(noIssuesEvent).toBeTruthy();

    await prisma.claimEvent.deleteMany({ where: { claimId: emptyClaim.id } });
    await prisma.revisionItem.deleteMany({ where: { claimId: emptyClaim.id } });
    await prisma.comparisonResult.deleteMany({ where: { claimId: emptyClaim.id } });
    await prisma.claim.delete({ where: { id: emptyClaim.id } });
  });

  it("workflow gate blocks EVIDENCE_VALIDATION until issuesReviewedAt", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: { workflowStage: WorkflowStage.RULE_ISSUE_DETECTION, issuesReviewedAt: null },
    });

    const blocked = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.RULE_ISSUE_DETECTION,
      WorkflowStage.EVIDENCE_VALIDATION,
    );
    expect(blocked.passed).toBe(false);

    await prisma.claim.update({
      where: { id: claimId },
      data: { issuesReviewedAt: new Date() },
    });

    const allowed = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.RULE_ISSUE_DETECTION,
      WorkflowStage.EVIDENCE_VALIDATION,
    );
    expect(allowed.passed).toBe(true);
  });
});
