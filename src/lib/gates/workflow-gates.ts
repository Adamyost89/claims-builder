import {
  ClaimStatus,
  ConfidenceReviewResolution,
  DocumentType,
  OutputStatus,
  ParseStatus,
  ReviewStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db";

import type { Blocker, GateResult } from "./types";

function result(gateId: string, blockers: Blocker[]): GateResult {
  return {
    gateId,
    passed: blockers.length === 0,
    blockers,
  };
}

function errorBlocker(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Blocker {
  return { code, message, severity: "error", details };
}

export async function runGenerationGateG1(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) {
    return result("G1", [errorBlocker("CLAIM_NOT_FOUND", "Claim does not exist.")]);
  }

  const carrierEstimate = await prisma.document.findFirst({
    where: { claimId, type: DocumentType.CARRIER_ESTIMATE },
  });
  if (!carrierEstimate) {
    blockers.push(
      errorBlocker(
        "MISSING_CARRIER_ESTIMATE",
        "Upload a carrier estimate before generation.",
      ),
    );
  } else if (carrierEstimate.parseStatus !== ParseStatus.COMPLETE) {
    blockers.push(
      errorBlocker(
        "CARRIER_ESTIMATE_NOT_PARSED",
        "Carrier estimate must finish parsing before generation.",
        { parseStatus: carrierEstimate.parseStatus },
      ),
    );
  }

  const contractorEstimate = await prisma.document.findFirst({
    where: { claimId, type: DocumentType.CONTRACTOR_ESTIMATE },
  });
  if (!contractorEstimate) {
    blockers.push(
      errorBlocker(
        "MISSING_CONTRACTOR_ESTIMATE",
        "Upload a contractor estimate for supplement comparison.",
      ),
    );
  }

  return result("G1", blockers);
}

export async function runGenerationGateG2(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const pendingLines = await prisma.estimateLineItem.count({
    where: { claimId, reviewStatus: ReviewStatus.PENDING },
  });
  if (pendingLines > 0) {
    blockers.push(
      errorBlocker(
        "LINE_ITEMS_NEED_REVIEW",
        `${pendingLines} estimate line item(s) still need human review.`,
        { pendingLines },
      ),
    );
  }

  const failedDocs = await prisma.document.count({
    where: {
      claimId,
      parseStatus: { in: [ParseStatus.FAILED, ParseStatus.NEEDS_REVIEW] },
    },
  });
  if (failedDocs > 0) {
    blockers.push(
      errorBlocker(
        "DOCUMENTS_NEED_ATTENTION",
        `${failedDocs} document(s) failed parsing or need review.`,
        { failedDocs },
      ),
    );
  }

  return result("G2", blockers);
}

export async function runGenerationGateG3(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) {
    return result("G3", [errorBlocker("CLAIM_NOT_FOUND", "Claim does not exist.")]);
  }

  if (!claim.comparisonReviewedAt) {
    blockers.push(
      errorBlocker(
        "COMPARISON_NOT_REVIEWED",
        "Measurement and scope comparison must be reviewed before generation.",
      ),
    );
  }

  const openComparisons = await prisma.comparisonResult.count({
    where: { claimId, physicallySufficient: false },
  });
  if (openComparisons > 0) {
    blockers.push(
      errorBlocker(
        "INSUFFICIENT_COMPARISONS",
        `${openComparisons} comparison result(s) are marked physically insufficient.`,
        { openComparisons },
      ),
    );
  }

  return result("G3", blockers);
}

export async function runGenerationGateG4(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) {
    return result("G4", [errorBlocker("CLAIM_NOT_FOUND", "Claim does not exist.")]);
  }

  if (!claim.issuesReviewedAt) {
    blockers.push(
      errorBlocker(
        "ISSUES_NOT_REVIEWED",
        "Detected rule issues must be reviewed before generation.",
      ),
    );
  }

  const unsatisfiedEvidence = await prisma.evidenceLink.count({
    where: { claimId, isRequired: true, isSatisfied: false },
  });
  if (unsatisfiedEvidence > 0) {
    blockers.push(
      errorBlocker(
        "REQUIRED_EVIDENCE_MISSING",
        `${unsatisfiedEvidence} required evidence link(s) are not satisfied.`,
        { unsatisfiedEvidence },
      ),
    );
  }

  const draftIssues = await prisma.revisionItem.count({
    where: { claimId, status: "DRAFT" },
  });
  if (draftIssues > 0) {
    blockers.push(
      errorBlocker(
        "DRAFT_REVISION_ITEMS",
        `${draftIssues} revision item(s) remain in draft status.`,
        { draftIssues },
      ),
    );
  }

  return result("G4", blockers);
}

export async function runGenerationGateG5(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];

  const blockingConfidence = await prisma.confidenceReviewItem.count({
    where: {
      claimId,
      blocksOutput: true,
      resolution: ConfidenceReviewResolution.PENDING,
    },
  });
  if (blockingConfidence > 0) {
    blockers.push(
      errorBlocker(
        "CONFIDENCE_REVIEW_PENDING",
        `${blockingConfidence} confidence review item(s) block generation.`,
        { blockingConfidence },
      ),
    );
  }

  const readyItems = await prisma.revisionItem.count({
    where: { claimId, readinessStatus: "READY_FOR_OUTPUT" },
  });
  if (readyItems === 0) {
    blockers.push(
      errorBlocker(
        "NO_READY_REVISION_ITEMS",
        "At least one revision item must be ready for output before generation.",
      ),
    );
  }

  const openTasks = await prisma.reviewTask.count({
    where: { claimId, status: { in: ["OPEN", "IN_PROGRESS"] } },
  });
  if (openTasks > 0) {
    blockers.push(
      errorBlocker(
        "OPEN_REVIEW_TASKS",
        `${openTasks} review task(s) must be resolved before generation.`,
        { openTasks },
      ),
    );
  }

  return result("G5", blockers);
}

export async function runExportGateE1(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const output = await prisma.generatedOutput.findFirst({
    where: { claimId },
    orderBy: { version: "desc" },
  });

  if (!output) {
    blockers.push(
      errorBlocker(
        "NO_GENERATED_OUTPUT",
        "Generate supplement output before attempting export.",
      ),
    );
    return result("E1", blockers);
  }

  if (!output.contentText && !output.contentJson) {
    blockers.push(
      errorBlocker(
        "EMPTY_OUTPUT",
        "Generated output has no content.",
        { outputId: output.id },
      ),
    );
  }

  if (!output.toneLintPassed) {
    blockers.push(
      errorBlocker(
        "TONE_LINT_FAILED",
        "Output must pass tone lint before export.",
        { violations: output.toneLintViolations },
      ),
    );
  }

  return result("E1", blockers);
}

export async function runExportGateE2(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const output = await prisma.generatedOutput.findFirst({
    where: { claimId },
    orderBy: { version: "desc" },
  });

  if (!output) {
    return result("E2", [
      errorBlocker("NO_GENERATED_OUTPUT", "No generated output to validate for export."),
    ]);
  }

  let revisionIds: string[] = [];
  try {
    revisionIds = JSON.parse(output.revisionIdsIncluded) as string[];
  } catch {
    revisionIds = [];
  }

  if (revisionIds.length === 0) {
    blockers.push(
      errorBlocker(
        "NO_REVISIONS_INCLUDED",
        "Generated output must include at least one revision item.",
      ),
    );
    return result("E2", blockers);
  }

  const ineligible = await prisma.revisionItem.findMany({
    where: {
      claimId,
      id: { in: revisionIds },
      exportEligible: false,
    },
    select: { id: true, title: true },
  });

  if (ineligible.length > 0) {
    blockers.push(
      errorBlocker(
        "REVISIONS_NOT_EXPORT_ELIGIBLE",
        `${ineligible.length} included revision item(s) are not export eligible.`,
        { revisionIds: ineligible.map((item) => item.id) },
      ),
    );
  }

  return result("E2", blockers);
}

export async function runExportGateE3(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const output = await prisma.generatedOutput.findFirst({
    where: { claimId },
    orderBy: { version: "desc" },
  });

  if (!output) {
    return result("E3", [
      errorBlocker("NO_GENERATED_OUTPUT", "No generated output awaiting approval."),
    ]);
  }

  if (output.status !== OutputStatus.APPROVED) {
    blockers.push(
      errorBlocker(
        "OUTPUT_NOT_APPROVED",
        "A manager must approve the generated output before export.",
        { status: output.status },
      ),
    );
  }

  if (!output.approvedById || !output.approvedAt) {
    blockers.push(
      errorBlocker(
        "APPROVAL_METADATA_MISSING",
        "Approved output is missing approver metadata.",
      ),
    );
  }

  return result("E3", blockers);
}

export async function runExportGateE4(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const [claim, settings] = await Promise.all([
    prisma.claim.findUnique({ where: { id: claimId } }),
    prisma.orgSettings.findUnique({ where: { id: "default" } }),
  ]);

  if (!claim) {
    return result("E4", [errorBlocker("CLAIM_NOT_FOUND", "Claim does not exist.")]);
  }

  const productionReady = settings?.productionReady ?? false;
  if (!productionReady && !claim.isDryRun) {
    blockers.push(
      errorBlocker(
        "ORG_NOT_PRODUCTION_READY",
        "Organization is not production ready. Complete dry runs or enable production in settings.",
        {
          dryRunsReviewedCount: settings?.dryRunsReviewedCount ?? 0,
          dryRunsRequired: settings?.dryRunsRequired ?? 10,
        },
      ),
    );
  }

  return result("E4", blockers);
}

export async function runExportGateE5(claimId: string): Promise<GateResult> {
  const blockers: Blocker[] = [];
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) {
    return result("E5", [errorBlocker("CLAIM_NOT_FOUND", "Claim does not exist.")]);
  }

  if (
    claim.status !== ClaimStatus.READY_FOR_OUTPUT &&
    claim.status !== ClaimStatus.EXPORTED
  ) {
    blockers.push(
      errorBlocker(
        "CLAIM_NOT_READY",
        "Claim must be ready for output before export.",
        { status: claim.status },
      ),
    );
  }

  const exportedOutput = await prisma.generatedOutput.findFirst({
    where: { claimId, status: OutputStatus.EXPORTED },
  });
  if (exportedOutput) {
    blockers.push(
      errorBlocker(
        "ALREADY_EXPORTED",
        "This claim already has an exported output version.",
        { outputId: exportedOutput.id },
      ),
    );
  }

  return result("E5", blockers);
}

export async function runAllGenerationGates(claimId: string): Promise<GateResult[]> {
  return Promise.all([
    runGenerationGateG1(claimId),
    runGenerationGateG2(claimId),
    runGenerationGateG3(claimId),
    runGenerationGateG4(claimId),
    runGenerationGateG5(claimId),
  ]);
}

export async function runAllExportGates(claimId: string): Promise<GateResult[]> {
  return Promise.all([
    runExportGateE1(claimId),
    runExportGateE2(claimId),
    runExportGateE3(claimId),
    runExportGateE4(claimId),
    runExportGateE5(claimId),
  ]);
}