import {
  ConfidenceReviewResolution,
  ParseStatus,
  ReviewStatus,
  WorkflowStage,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { isExportReadyOutput } from "@/lib/export/gate";

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

/**
 * Validates prerequisites before advancing from one workflow stage to the next.
 * Stages cannot be skipped — caller must pass consecutive from/to stages only.
 */
export async function runWorkflowAdvanceGate(
  claimId: string,
  fromStage: WorkflowStage,
  toStage: WorkflowStage,
): Promise<GateResult> {
  const gateId = `WF_${fromStage}_TO_${toStage}`;
  const blockers: Blocker[] = [];

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      documents: { where: { deletedAt: null } },
    },
  });

  if (!claim) {
    return result(gateId, [errorBlocker("CLAIM_NOT_FOUND", "Claim does not exist.")]);
  }

  if (claim.workflowStage !== fromStage) {
    blockers.push(
      errorBlocker(
        "STAGE_MISMATCH",
        `Claim is at ${claim.workflowStage}, not ${fromStage}.`,
        { currentStage: claim.workflowStage, expectedStage: fromStage },
      ),
    );
    return result(gateId, blockers);
  }

  switch (toStage) {
    case WorkflowStage.PARSE: {
      const activeDocs = claim.documents.length;
      if (activeDocs === 0) {
        blockers.push(
          errorBlocker(
            "NO_DOCUMENTS",
            "Upload at least one active document before advancing to Parse.",
          ),
        );
      }
      break;
    }
    case WorkflowStage.HUMAN_REVIEW: {
      const parseableDocs = claim.documents.filter((doc) =>
        ["CARRIER_ESTIMATE", "CONTRACTOR_ESTIMATE", "EAGLEVIEW", "HOVER", "GAF", "ITEL"].includes(
          doc.type,
        ),
      );
      const incomplete = parseableDocs.filter(
        (doc) =>
          doc.parseStatus !== ParseStatus.COMPLETE &&
          doc.parseStatus !== ParseStatus.NEEDS_REVIEW,
      );
      const failed = parseableDocs.filter((doc) => doc.parseStatus === ParseStatus.FAILED);
      if (incomplete.length > 0) {
        blockers.push(
          errorBlocker(
            "PARSE_INCOMPLETE",
            `${incomplete.length} document(s) must finish parsing before human review.`,
            { incompleteCount: incomplete.length },
          ),
        );
      }
      if (failed.length > 0) {
        blockers.push(
          errorBlocker(
            "PARSE_FAILED",
            `${failed.length} document(s) failed parsing and must be resolved.`,
            { failedCount: failed.length },
          ),
        );
      }
      break;
    }
    case WorkflowStage.MEASUREMENT_COMPARISON: {
      const pendingConfidence = await prisma.confidenceReviewItem.count({
        where: {
          claimId,
          blocksOutput: true,
          resolution: ConfidenceReviewResolution.PENDING,
        },
      });
      if (pendingConfidence > 0) {
        blockers.push(
          errorBlocker(
            "CONFIDENCE_QUEUE_OPEN",
            `${pendingConfidence} confidence review item(s) must be resolved.`,
            { pendingConfidence },
          ),
        );
      }
      const [pendingLines, pendingExtractions, pendingMeasurements] = await Promise.all([
        prisma.estimateLineItem.count({
          where: { claimId, reviewStatus: ReviewStatus.PENDING },
        }),
        prisma.documentExtraction.count({
          where: { claimId, reviewStatus: ReviewStatus.PENDING },
        }),
        prisma.measurementValue.count({
          where: { claimId, reviewStatus: ReviewStatus.PENDING },
        }),
      ]);
      const pendingTotal = pendingLines + pendingExtractions + pendingMeasurements;
      if (pendingTotal > 0) {
        blockers.push(
          errorBlocker(
            "PARSED_DATA_UNREVIEWED",
            `${pendingTotal} parsed value(s) require human review before measurement comparison.`,
            { pendingLines, pendingExtractions, pendingMeasurements },
          ),
        );
      }
      break;
    }
    case WorkflowStage.RULE_ISSUE_DETECTION: {
      if (!claim.comparisonReviewedAt) {
        blockers.push(
          errorBlocker(
            "COMPARISON_NOT_REVIEWED",
            "Measurement comparison must be reviewed before rule/issue detection. (Phase 3)",
          ),
        );
      }
      const comparisons = await prisma.comparisonResult.count({ where: { claimId } });
      if (comparisons === 0) {
        blockers.push(
          errorBlocker(
            "NO_COMPARISONS",
            "Run measurement comparison before advancing. (Phase 3)",
          ),
        );
      }
      break;
    }
    case WorkflowStage.EVIDENCE_VALIDATION: {
      if (!claim.issuesReviewedAt) {
        blockers.push(
          errorBlocker(
            "ISSUES_NOT_REVIEWED",
            "Rule/issue detection must be reviewed before evidence validation.",
          ),
        );
      }
      break;
    }
    case WorkflowStage.GENERATION: {
      if (!claim.evidenceReviewedAt) {
        blockers.push(
          errorBlocker(
            "EVIDENCE_NOT_REVIEWED",
            "Evidence validation must be reviewed before generation.",
          ),
        );
      }
      const needsEvidence = await prisma.revisionItem.count({
        where: {
          claimId,
          status: { not: "EXCLUDED" },
          readinessStatus: { in: ["NEEDS_EVIDENCE", "PARTIALLY_READY"] },
          overrideById: null,
        },
      });
      const notExportEligible = await prisma.revisionItem.count({
        where: {
          claimId,
          status: { not: "EXCLUDED" },
          exportEligible: false,
        },
      });
      if (needsEvidence > 0 || notExportEligible > 0) {
        blockers.push(
          errorBlocker(
            "EVIDENCE_INCOMPLETE",
            "All included revisions must pass evidence validation before generation.",
            { needsEvidence, notExportEligible },
          ),
        );
      }
      break;
    }
    case WorkflowStage.HUMAN_APPROVAL: {
      const validDraft = await prisma.generatedOutput.count({
        where: {
          claimId,
          status: "DRAFT",
          generationBlocked: false,
          toneLintPassed: true,
        },
      });
      if (validDraft === 0) {
        const blockedDraft = await prisma.generatedOutput.count({
          where: { claimId, status: "DRAFT", generationBlocked: true },
        });
        blockers.push(
          errorBlocker(
            blockedDraft > 0 ? "GENERATION_BLOCKED" : "NO_VALID_GENERATED_OUTPUT",
            blockedDraft > 0
              ? "Generated draft is blocked by unsupported claims or tone lint failures. Fix and regenerate before human approval."
              : "Generate a valid unblocked draft before human approval.",
            { blockedDraft, validDraft },
          ),
        );
      }
      break;
    }
    case WorkflowStage.EXPORT: {
      if (!claim.evidenceReviewedAt) {
        blockers.push(
          errorBlocker(
            "EVIDENCE_NOT_REVIEWED",
            "Evidence validation must be reviewed before export.",
          ),
        );
      }

      const approvedOutputs = await prisma.generatedOutput.findMany({
        where: { claimId, status: "APPROVED" },
      });
      const hasExportReadyApproval = approvedOutputs.some((output) =>
        isExportReadyOutput(output),
      );

      if (!hasExportReadyApproval) {
        blockers.push(
          errorBlocker(
            "OUTPUT_NOT_APPROVED",
            "At least one approved, unblocked output with passing tone lint and no unsupported claims is required before export.",
          ),
        );
      }
      break;
    }
    default:
      blockers.push(
        errorBlocker("INVALID_TRANSITION", `Cannot advance to ${toStage}.`),
      );
  }

  return result(gateId, blockers);
}
