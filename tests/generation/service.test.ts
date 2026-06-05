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
  EvidenceType,
  IssueCategory,
  IssueStatus,
  OutputMode,
  ReadinessStatus,
  RuleAuthority,
  UserRole,
  WorkflowStage,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import * as mockModule from "@/lib/generation/mock";
import { buildGenerationPayload } from "@/lib/generation/payload";
import type { GenerationInput, GenerationOutput } from "@/lib/generation/schemas";
import {
  runClaimGeneration,
  validateAndFinalizeOutput,
} from "@/lib/generation/service";
import { runToneLint } from "@/lib/generation/tone";
import { detectUnsupportedClaims } from "@/lib/generation/unsupported-claims";
import { runWorkflowAdvanceGate } from "@/lib/gates/workflow-stage-gates";

describe("generation service", () => {
  let userId: string;
  let claimId: string;
  let comparisonId: string;
  let codeRuleId: string;
  let readyRevisionId: string;
  let evidenceLinkId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `gen-${Date.now()}@example.com`,
        name: "Generation User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Generation Customer",
        propertyAddress: "1 Gen St",
        carrier: "Carrier",
        claimNumber: `GEN-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
        workflowStage: WorkflowStage.GENERATION,
        comparisonReviewedAt: new Date(),
        issuesReviewedAt: new Date(),
        evidenceReviewedAt: new Date(),
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
        citationText: "R905.2.8.5 Drip edge required.",
        appliesWhen: "eave present",
        requiredEvidence: "CODE",
        outputLanguage: "Install drip edge per IRC.",
      },
    });
    codeRuleId = codeRule.id;

    const readyRevision = await prisma.revisionItem.create({
      data: {
        claimId,
        title: "Roof area deficiency",
        category: IssueCategory.MEASUREMENT_DEFICIENCY,
        status: IssueStatus.READY_FOR_OUTPUT,
        readinessStatus: ReadinessStatus.READY_FOR_OUTPUT,
        exportEligible: true,
        carrierApprovedQty: 20,
        carrierApprovedUnit: "SQ",
        requestedQty: 24,
        requestedUnit: "SQ",
        qtyDifference: -4,
        basis: "Measurement report shows 24 SQ.",
        revisionRequired: "Increase roof area to 24 SQ.",
        calculationMethod: "roof_area_sq comparison",
        comparisonResultId: comparisonId,
        requiredEvidenceTypes: JSON.stringify(["MEASUREMENT"]),
      },
    });
    readyRevisionId = readyRevision.id;

    const evidenceLink = await prisma.evidenceLink.create({
      data: {
        claimId,
        revisionItemId: readyRevisionId,
        evidenceType: EvidenceType.MEASUREMENT,
        targetTable: "ComparisonResult",
        targetId: comparisonId,
        label: "roof_area_sq",
        snippet: "roof_area_sq = 24",
        isRequired: true,
        isSatisfied: true,
      },
    });
    evidenceLinkId = evidenceLink.id;

    await prisma.revisionItem.create({
      data: {
        claimId,
        title: "Excluded item",
        category: IssueCategory.OMITTED_ITEM,
        status: IssueStatus.EXCLUDED,
        readinessStatus: ReadinessStatus.EXCLUDED,
        exportEligible: false,
        excludedReason: "Not pursuing",
        requiredEvidenceTypes: "[]",
      },
    });

    await prisma.revisionItem.create({
      data: {
        claimId,
        title: "Needs evidence item",
        category: IssueCategory.OMITTED_ITEM,
        status: IssueStatus.NEEDS_EVIDENCE,
        readinessStatus: ReadinessStatus.NEEDS_EVIDENCE,
        exportEligible: false,
        requiredEvidenceTypes: JSON.stringify(["MEASUREMENT"]),
      },
    });
  });

  afterAll(async () => {
    await prisma.generatedOutput.deleteMany({ where: { claimId } });
    await prisma.evidenceLink.deleteMany({ where: { claimId } });
    await prisma.revisionItem.deleteMany({ where: { claimId } });
    await prisma.comparisonResult.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.rule.deleteMany({ where: { id: codeRuleId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("payload excludes NEEDS_EVIDENCE revisions from export-eligible list", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    expect(payload.exportEligibleRevisions.some((r) => r.title === "Needs evidence item")).toBe(
      false,
    );
    expect(payload.unresolvedRevisions.some((r) => r.title === "Needs evidence item")).toBe(true);
  });

  it("payload excludes EXCLUDED revisions from carrier-ready sections", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    expect(payload.exportEligibleRevisions.some((r) => r.title === "Excluded item")).toBe(false);
    expect(payload.excludedRevisions.some((r) => r.title === "Excluded item")).toBe(true);
  });

  it("payload includes only exportEligible RevisionItems", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    expect(payload.exportEligibleRevisions).toHaveLength(1);
    expect(payload.exportEligibleRevisions[0]?.revisionItemId).toBe(readyRevisionId);
  });

  it("payload includes linked evidence with IDs and snippets", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const evidence = payload.exportEligibleRevisions[0]?.evidence ?? [];
    expect(evidence.some((row) => row.evidenceId === evidenceLinkId)).toBe(true);
    expect(evidence[0]?.snippet).toContain("roof_area_sq");
  });

  it("payload includes only stored Rule.citationText", async () => {
    const revision = await prisma.revisionItem.update({
      where: { id: readyRevisionId },
      data: { ruleId: codeRuleId },
    });
    expect(revision.ruleId).toBe(codeRuleId);

    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const citations = payload.exportEligibleRevisions[0]?.ruleCitations ?? [];
    expect(citations).toHaveLength(1);
    expect(citations[0]?.citationText).toBe("R905.2.8.5 Drip edge required.");
    expect(citations[0]?.citationText).not.toContain("invented");
  });

  it("unsupported detector catches unknown revisionItemId", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const output = mockModule.generateMockOutput(payload);
    output.sections[0]!.revisionItemId = "unknown-revision";

    const claims = detectUnsupportedClaims(output, payload);
    expect(claims.some((claim) => claim.code === "UNKNOWN_REVISION")).toBe(true);
  });

  it("unsupported detector catches changed quantity", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const output = mockModule.generateMockOutput(payload);
    output.sections[0]!.approvedQty = 999;

    const claims = detectUnsupportedClaims(output, payload);
    expect(claims.some((claim) => claim.code === "QUANTITY_MISMATCH")).toBe(true);
  });

  it("unsupported detector catches unknown evidenceId", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const output = mockModule.generateMockOutput(payload);
    output.sections[0]!.evidenceIds = ["bad-evidence"];

    const claims = detectUnsupportedClaims(output, payload);
    expect(claims.some((claim) => claim.code === "UNKNOWN_EVIDENCE")).toBe(true);
  });

  it("unsupported detector catches unknown ruleId", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const output = mockModule.generateMockOutput(payload);
    output.sections[0]!.ruleIds = ["bad-rule"];

    const claims = detectUnsupportedClaims(output, payload);
    expect(claims.some((claim) => claim.code === "UNKNOWN_RULE")).toBe(true);
  });

  it("tone lint catches banned phrases", () => {
    const result = runToneLint("We believe this may need a revision, please consider.");
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("generation saves blocked DRAFT when unsupportedClaims exist", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const badOutput = mockModule.generateMockOutput(payload);
    badOutput.sections[0]!.revisionItemId = "unknown-revision";

    vi.spyOn(mockModule, "generateMockOutput").mockReturnValueOnce(badOutput);

    const result = await runClaimGeneration({
      claimId,
      outputMode: OutputMode.FULL_SUPPLEMENT,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    expect(result.output.status).toBe("DRAFT");
    expect(result.output.generationBlocked).toBe(true);
    expect(result.validDraft).toBe(false);
  });

  it("generation saves blocked DRAFT when tone lint fails", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const badOutput = mockModule.generateMockOutput(payload);
    badOutput.sections[0]!.body = "We believe the carrier should consider this possibly.";

    vi.spyOn(mockModule, "generateMockOutput").mockReturnValueOnce(badOutput);

    const result = await runClaimGeneration({
      claimId,
      outputMode: OutputMode.FULL_SUPPLEMENT,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    expect(result.output.generationBlocked).toBe(true);
    expect(result.output.toneLintPassed).toBe(false);
  });

  it("workflow gate blocks HUMAN_APPROVAL when draft is blocked", async () => {
    await prisma.generatedOutput.deleteMany({ where: { claimId } });
    await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "DRAFT",
        generationBlocked: true,
        toneLintPassed: false,
        contentText: "blocked",
        contentJson: "{}",
        unsupportedClaimsJson: JSON.stringify([{ code: "UNKNOWN_REVISION", message: "bad" }]),
      },
    });

    await prisma.claim.update({
      where: { id: claimId },
      data: { workflowStage: WorkflowStage.GENERATION },
    });

    const blocked = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.GENERATION,
      WorkflowStage.HUMAN_APPROVAL,
    );
    expect(blocked.passed).toBe(false);
    expect(blocked.blockers.some((b) => b.code === "GENERATION_BLOCKED")).toBe(true);
  });

  it("workflow gate allows HUMAN_APPROVAL when valid draft exists", async () => {
    await prisma.generatedOutput.deleteMany({ where: { claimId } });
    await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "DRAFT",
        generationBlocked: false,
        toneLintPassed: true,
        contentText: "valid draft",
        contentJson: "{}",
        unsupportedClaimsJson: "[]",
      },
    });

    await prisma.claim.update({
      where: { id: claimId },
      data: { workflowStage: WorkflowStage.GENERATION },
    });

    const allowed = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.GENERATION,
      WorkflowStage.HUMAN_APPROVAL,
    );
    expect(allowed.passed).toBe(true);
  });

  it("uses mock generation only in tests", async () => {
    await prisma.generatedOutput.deleteMany({ where: { claimId } });

    const result = await runClaimGeneration({
      claimId,
      outputMode: OutputMode.SHORT_REPLY,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    expect(result.output.isMockGeneration).toBe(true);
    expect(result.output.model).toBe("mock-deterministic");
  });

  it("validateAndFinalizeOutput marks blocked when both tone and unsupported fail", async () => {
    const payload = await buildGenerationPayload(claimId, OutputMode.FULL_SUPPLEMENT);
    const output: GenerationOutput = {
      ...mockModule.generateMockOutput(payload),
      sections: [
        {
          revisionItemId: "missing",
          heading: "Bad",
          body: "We believe this may need changes.",
          approvedQty: 1,
          requestedQty: 2,
          difference: -1,
          evidenceIds: ["missing-evidence"],
          ruleIds: ["missing-rule"],
        },
      ],
    };

    const finalized = await validateAndFinalizeOutput(output, payload as GenerationInput);
    expect(finalized.generationBlocked).toBe(true);
    expect(finalized.toneLintPassed).toBe(false);
    expect(finalized.unsupportedClaims.length).toBeGreaterThan(0);
  });
});
