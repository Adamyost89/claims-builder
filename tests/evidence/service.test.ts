import bcrypt from "bcryptjs";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  ClaimType,
  EvidenceType,
  IssueCategory,
  IssueStatus,
  ReadinessStatus,
  RuleAuthority,
  UserRole,
  WorkflowStage,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { shouldAutoLinkDocument } from "@/lib/evidence/auto-link";
import {
  createEvidenceLink,
  deleteEvidenceLink,
  overrideRevisionEvidence,
  refreshClaimEvidence,
  reviewClaimEvidence,
} from "@/lib/evidence/service";
import { EvidenceTargetError } from "@/lib/evidence/targets";
import { runWorkflowAdvanceGate } from "@/lib/gates/workflow-stage-gates";
import {
  reviewClaimIssues,
  runClaimIssueDetection,
  updateRevisionItem,
} from "@/lib/issues/service";

describe("evidence validation service", () => {
  let userId: string;
  let claimId: string;
  let comparisonId: string;
  let codeRuleId: string;
  let manufacturerRuleId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `evidence-${Date.now()}@example.com`,
        name: "Evidence User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Evidence Customer",
        propertyAddress: "1 Evidence St",
        carrier: "Carrier",
        claimNumber: `EVD-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
        workflowStage: WorkflowStage.EVIDENCE_VALIDATION,
        comparisonReviewedAt: new Date(),
        issuesReviewedAt: new Date(),
      },
    });
    claimId = claim.id;

    const comparison = await prisma.comparisonResult.create({
      data: {
        claimId,
        comparisonKey: "roof_area_sq",
        approvedQty: 20,
        requestedQty: 24,
        difference: -4,
        formula: "roof_area_sq = 24",
        explanation: "Area deficiency",
        sourceDocumentIds: "[]",
        measurementValueIds: "[]",
        unit: "SQ",
      },
    });
    comparisonId = comparison.id;

    const codeRule = await prisma.rule.create({
      data: {
        title: "IRC drip edge",
        scopeCategory: "ROOF",
        authorityType: RuleAuthority.CODE,
        citationText: "R905.2.8.5",
        appliesWhen: "eave present",
        requiredEvidence: "CODE",
        outputLanguage: "Install drip edge per IRC.",
      },
    });
    codeRuleId = codeRule.id;

    const manufacturerRule = await prisma.rule.create({
      data: {
        title: "OC starter strip",
        scopeCategory: "ROOF",
        authorityType: RuleAuthority.MANUFACTURER,
        citationText: "OC install guide",
        appliesWhen: "starter required",
        requiredEvidence: "MANUFACTURER",
        outputLanguage: "Install per OC guide.",
      },
    });
    manufacturerRuleId = manufacturerRule.id;
  });

  afterAll(async () => {
    await prisma.evidenceLink.deleteMany({ where: { claimId } });
    await prisma.revisionItem.deleteMany({ where: { claimId } });
    await prisma.comparisonResult.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.rule.deleteMany({
      where: { id: { in: [codeRuleId, manufacturerRuleId] } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function createRevision(input: {
    title: string;
    category: IssueCategory;
    comparisonResultId?: string;
    ruleId?: string;
    status?: IssueStatus;
  }) {
    return prisma.revisionItem.create({
      data: {
        claimId,
        title: input.title,
        category: input.category,
        status: input.status ?? IssueStatus.READY_FOR_OUTPUT,
        readinessStatus: ReadinessStatus.NOT_ASSESSED,
        exportEligible: false,
        requiredEvidenceTypes: "[]",
        comparisonResultId: input.comparisonResultId,
        ruleId: input.ruleId,
      },
    });
  }

  it("measurement deficiency auto-links comparison as MEASUREMENT", async () => {
    const revision = await createRevision({
      title: "Roof area deficiency",
      category: IssueCategory.MEASUREMENT_DEFICIENCY,
      comparisonResultId: comparisonId,
    });

    await refreshClaimEvidence(claimId);

    const links = await prisma.evidenceLink.findMany({
      where: { revisionItemId: revision.id },
    });
    expect(links).toHaveLength(1);
    expect(links[0]?.evidenceType).toBe(EvidenceType.MEASUREMENT);
    expect(links[0]?.targetTable).toBe("ComparisonResult");
    expect(links[0]?.isSatisfied).toBe(true);

    const updated = await prisma.revisionItem.findUniqueOrThrow({
      where: { id: revision.id },
    });
    expect(updated.readinessStatus).toBe(ReadinessStatus.READY_FOR_OUTPUT);
    expect(updated.exportEligible).toBe(true);
  });

  it("rule-based code/manufacturer issue auto-links Rule evidence", async () => {
    const codeRevision = await createRevision({
      title: "Code drip edge",
      category: IssueCategory.CODE_MANUFACTURER,
      ruleId: codeRuleId,
    });
    const mfgRevision = await createRevision({
      title: "Manufacturer starter",
      category: IssueCategory.CODE_MANUFACTURER,
      ruleId: manufacturerRuleId,
    });

    await refreshClaimEvidence(claimId);

    const codeLinks = await prisma.evidenceLink.findMany({
      where: { revisionItemId: codeRevision.id },
    });
    expect(codeLinks[0]?.evidenceType).toBe(EvidenceType.CODE);
    expect(codeLinks[0]?.targetTable).toBe("Rule");

    const mfgLinks = await prisma.evidenceLink.findMany({
      where: { revisionItemId: mfgRevision.id },
    });
    expect(mfgLinks[0]?.evidenceType).toBe(EvidenceType.MANUFACTURER);
  });

  it("missing evidence sets NEEDS_EVIDENCE", async () => {
    const revision = await createRevision({
      title: "Omitted starter",
      category: IssueCategory.OMITTED_ITEM,
    });

    await refreshClaimEvidence(claimId);

    const updated = await prisma.revisionItem.findUniqueOrThrow({
      where: { id: revision.id },
    });
    expect(updated.readinessStatus).toBe(ReadinessStatus.NEEDS_EVIDENCE);
    expect(updated.exportEligible).toBe(false);
  });

  it("partial evidence sets PARTIALLY_READY", async () => {
    const revision = await createRevision({
      title: "Installation insufficiency",
      category: IssueCategory.INSTALLATION_INSUFFICIENCY,
      ruleId: codeRuleId,
    });

    await refreshClaimEvidence(claimId);

    const updated = await prisma.revisionItem.findUniqueOrThrow({
      where: { id: revision.id },
    });
    expect(updated.readinessStatus).toBe(ReadinessStatus.PARTIALLY_READY);
    expect(updated.exportEligible).toBe(false);
  });

  it("full required evidence sets READY_FOR_OUTPUT", async () => {
    const revision = await createRevision({
      title: "Installation complete evidence",
      category: IssueCategory.INSTALLATION_INSUFFICIENCY,
      comparisonResultId: comparisonId,
      ruleId: codeRuleId,
    });

    await refreshClaimEvidence(claimId);

    const updated = await prisma.revisionItem.findUniqueOrThrow({
      where: { id: revision.id },
    });
    expect(updated.readinessStatus).toBe(ReadinessStatus.READY_FOR_OUTPUT);
    expect(updated.exportEligible).toBe(true);
  });

  it("excluded item is never exportEligible", async () => {
    const revision = await createRevision({
      title: "Excluded deficiency",
      category: IssueCategory.MEASUREMENT_DEFICIENCY,
      comparisonResultId: comparisonId,
      status: IssueStatus.EXCLUDED,
    });

    await prisma.revisionItem.update({
      where: { id: revision.id },
      data: {
        readinessStatus: ReadinessStatus.EXCLUDED,
        exportEligible: false,
      },
    });

    await refreshClaimEvidence(claimId);

    const updated = await prisma.revisionItem.findUniqueOrThrow({
      where: { id: revision.id },
    });
    expect(updated.exportEligible).toBe(false);
    expect(updated.readinessStatus).toBe(ReadinessStatus.EXCLUDED);
  });

  it("override requires note and logs audit", async () => {
    const revision = await createRevision({
      title: "Needs override",
      category: IssueCategory.OMITTED_ITEM,
    });

    await expect(
      overrideRevisionEvidence({
        claimId,
        revisionId: revision.id,
        overrideNote: "   ",
        actorId: userId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toThrow(/override note is required/i);

    await overrideRevisionEvidence({
      claimId,
      revisionId: revision.id,
      overrideNote: "Field verified — proceed without photo",
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const overrideEvent = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "OVERRIDE" },
      orderBy: { createdAt: "desc" },
    });
    expect(overrideEvent).toBeTruthy();
    expect(overrideEvent?.payloadJson).toContain("overrideNote");
    expect(overrideEvent?.payloadJson).toContain("Field verified");
  });

  it("override can make item exportEligible", async () => {
    const revision = await createRevision({
      title: "Override eligible",
      category: IssueCategory.ESTIMATE_INCONSISTENCY,
    });

    await overrideRevisionEvidence({
      claimId,
      revisionId: revision.id,
      overrideNote: "Carrier line confirmed in email thread",
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const updated = await prisma.revisionItem.findUniqueOrThrow({
      where: { id: revision.id },
    });
    expect(updated.exportEligible).toBe(true);
    expect(updated.readinessStatus).toBe(ReadinessStatus.READY_FOR_OUTPUT);
    expect(updated.overrideNote).toContain("Carrier line");
  });

  it("removing evidence clears evidenceReviewedAt", async () => {
    const revision = await createRevision({
      title: "Review reset on unlink",
      category: IssueCategory.MEASUREMENT_DEFICIENCY,
      comparisonResultId: comparisonId,
    });
    await refreshClaimEvidence(claimId);

    await prisma.claim.update({
      where: { id: claimId },
      data: { evidenceReviewedAt: new Date() },
    });

    const link = await prisma.evidenceLink.findFirst({
      where: { revisionItemId: revision.id },
    });
    expect(link).toBeTruthy();

    await deleteEvidenceLink({
      claimId,
      linkId: link!.id,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(claim.evidenceReviewedAt).toBeNull();
  });

  it("editing RevisionItem clears evidenceReviewedAt", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: { evidenceReviewedAt: new Date() },
    });

    const revision = await prisma.revisionItem.findFirst({ where: { claimId } });
    expect(revision).toBeTruthy();

    await updateRevisionItem({
      claimId,
      revisionId: revision!.id,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
      action: "edit",
      title: "Edited after evidence review",
    });

    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(claim.evidenceReviewedAt).toBeNull();
  });

  it("re-running issue detection clears evidenceReviewedAt", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: { evidenceReviewedAt: new Date(), comparisonReviewedAt: new Date() },
    });

    await prisma.comparisonResult.create({
      data: {
        claimId,
        comparisonKey: "starter_eave_lf",
        approvedQty: 0,
        requestedQty: 156,
        difference: -156,
        formula: "starter_eave_lf = 156",
        explanation: "Starter omitted",
        sourceDocumentIds: "[]",
        measurementValueIds: "[]",
        unit: "LF",
      },
    });

    await runClaimIssueDetection({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(claim.evidenceReviewedAt).toBeNull();
    expect(claim.issuesReviewedAt).toBeNull();
  });

  it("workflow gate blocks GENERATION until evidenceReviewedAt exists", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        workflowStage: WorkflowStage.EVIDENCE_VALIDATION,
        evidenceReviewedAt: null,
        issuesReviewedAt: new Date(),
      },
    });

    const blocked = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.EVIDENCE_VALIDATION,
      WorkflowStage.GENERATION,
    );
    expect(blocked.passed).toBe(false);
    expect(blocked.blockers.some((b) => b.code === "EVIDENCE_NOT_REVIEWED")).toBe(true);
  });

  it("evidence review sets evidenceReviewedAt", async () => {
    await prisma.evidenceLink.deleteMany({ where: { claimId } });
    await prisma.revisionItem.deleteMany({ where: { claimId } });

    await createRevision({
      title: "Ready only",
      category: IssueCategory.MEASUREMENT_DEFICIENCY,
      comparisonResultId: comparisonId,
    });

    await refreshClaimEvidence(claimId);

    await prisma.claim.update({
      where: { id: claimId },
      data: { issuesReviewedAt: new Date(), evidenceReviewedAt: null },
    });

    const updated = await reviewClaimEvidence({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    expect(updated.evidenceReviewedAt).toBeTruthy();

    const reviewEvent = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "EVIDENCE_REVIEW" },
      orderBy: { createdAt: "desc" },
    });
    expect(reviewEvent).toBeTruthy();
  });

  it("EvidenceLink requires valid target table and target id", async () => {
    const revision = await prisma.revisionItem.findFirst({ where: { claimId } });
    expect(revision).toBeTruthy();

    await expect(
      createEvidenceLink({
        claimId,
        revisionItemId: revision!.id,
        evidenceType: EvidenceType.MEASUREMENT,
        targetTable: "NotATable",
        targetId: "fake",
        actorId: userId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toBeInstanceOf(EvidenceTargetError);

    await expect(
      createEvidenceLink({
        claimId,
        revisionItemId: revision!.id,
        evidenceType: EvidenceType.MEASUREMENT,
        targetTable: "ComparisonResult",
        targetId: "missing-id",
        actorId: userId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toBeInstanceOf(EvidenceTargetError);
  });

  it("auto-link does not link photos/invoices/policy", () => {
    expect(shouldAutoLinkDocument("PHOTO")).toBe(false);
    expect(shouldAutoLinkDocument("INVOICE")).toBe(false);
    expect(shouldAutoLinkDocument("POLICY_JACKET")).toBe(false);
    expect(shouldAutoLinkDocument("CARRIER_ESTIMATE")).toBe(true);
  });
});
