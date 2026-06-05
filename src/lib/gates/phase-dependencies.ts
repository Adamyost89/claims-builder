import { ClaimStatus, WorkflowStage } from "@prisma/client";

import { prisma } from "@/lib/db";

export type ClaimPhase = 1 | 2 | 3 | 4 | 5;

const PHASE_DEPENDENCIES: Partial<Record<ClaimPhase, ClaimPhase[]>> = {
  5: [4],
};

export type PhaseEvaluation = {
  phase: ClaimPhase;
  complete: boolean;
  reasons: string[];
};

export async function evaluateClaimPhase(
  phase: ClaimPhase,
  claimId: string,
): Promise<PhaseEvaluation> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      documents: true,
      comparisonResults: true,
      revisionItems: true,
      generatedOutputs: true,
    },
  });

  if (!claim) {
    return { phase, complete: false, reasons: ["Claim does not exist."] };
  }

  const reasons: string[] = [];

  switch (phase) {
    case 1: {
      if (claim.documents.length === 0) {
        reasons.push("No documents uploaded.");
      }
      break;
    }
    case 2: {
      const unparsed = claim.documents.filter((doc) => doc.parseStatus !== "COMPLETE");
      if (unparsed.length > 0) {
        reasons.push(`${unparsed.length} document(s) are not fully parsed.`);
      }
      if (claim.workflowStage === WorkflowStage.UPLOAD) {
        reasons.push("Workflow has not advanced beyond upload.");
      }
      break;
    }
    case 3: {
      if (!claim.comparisonReviewedAt) {
        reasons.push("Measurement comparison has not been reviewed.");
      }
      if (claim.comparisonResults.length === 0) {
        reasons.push("No comparison results recorded.");
      }
      break;
    }
    case 4: {
      if (!claim.issuesReviewedAt) {
        reasons.push("Rule issues have not been reviewed.");
      }
      if (claim.revisionItems.length === 0) {
        reasons.push("No revision items exist for this claim.");
      }
      break;
    }
    case 5: {
      const approved = claim.generatedOutputs.some(
        (output) => output.status === "APPROVED" || output.status === "EXPORTED",
      );
      if (!approved) {
        reasons.push("No approved generated output exists.");
      }
      if (
        claim.status !== ClaimStatus.READY_FOR_OUTPUT &&
        claim.status !== ClaimStatus.EXPORTED
      ) {
        reasons.push("Claim is not marked ready for output.");
      }
      break;
    }
    default:
      reasons.push("Unknown phase.");
  }

  return { phase, complete: reasons.length === 0, reasons };
}

export async function assertPhaseComplete(
  phase: ClaimPhase,
  claimId: string,
): Promise<void> {
  const dependencies = PHASE_DEPENDENCIES[phase] ?? [];
  for (const dependency of dependencies) {
    const evaluation = await evaluateClaimPhase(dependency, claimId);
    if (!evaluation.complete) {
      throw new Error(
        `Phase ${dependency} must be complete before phase ${phase}: ${evaluation.reasons.join(" ")}`,
      );
    }
  }

  const current = await evaluateClaimPhase(phase, claimId);
  if (!current.complete) {
    throw new Error(
      `Phase ${phase} is not complete: ${current.reasons.join(" ")}`,
    );
  }
}