import {
  ConfidenceReviewResolution,
  ReviewStatus,
  UserRole,
} from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import { getUsableParsedData } from "@/lib/parse/usable-data";
import { assertPermission, canEditClaims } from "@/lib/rbac";

import { runComparisonEngine } from "./engine";

async function assertComparisonInputsReady(claimId: string) {
  const pendingConfidence = await prisma.confidenceReviewItem.count({
    where: {
      claimId,
      blocksOutput: true,
      resolution: ConfidenceReviewResolution.PENDING,
    },
  });
  if (pendingConfidence > 0) {
    throw new Error(
      `${pendingConfidence} confidence review item(s) must be resolved before running comparison.`,
    );
  }

  const [pendingLines, pendingMeasurements] = await Promise.all([
    prisma.estimateLineItem.count({
      where: { claimId, reviewStatus: ReviewStatus.PENDING },
    }),
    prisma.measurementValue.count({
      where: { claimId, reviewStatus: ReviewStatus.PENDING },
    }),
  ]);
  if (pendingLines + pendingMeasurements > 0) {
    throw new Error("All parsed carrier and measurement values must be reviewed first.");
  }
}

export async function runClaimComparison(input: {
  claimId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot run comparison.");

  const claim = await prisma.claim.findUnique({ where: { id: input.claimId } });
  if (!claim) {
    throw new Error("Claim not found.");
  }

  await assertComparisonInputsReady(input.claimId);

  const parsed = await getUsableParsedData(input.claimId);
  const drafts = runComparisonEngine({
    lineItems: parsed.lineItems,
    measurements: parsed.measurements,
  });

  await prisma.$transaction([
    prisma.comparisonResult.deleteMany({ where: { claimId: input.claimId } }),
    prisma.claim.update({
      where: { id: input.claimId },
      data: { comparisonReviewedAt: null, issuesReviewedAt: null },
    }),
  ]);

  const created = await prisma.$transaction(
    drafts.map((draft) =>
      prisma.comparisonResult.create({
        data: {
          claimId: input.claimId,
          comparisonKey: draft.comparisonKey,
          approvedQty: draft.approvedQty,
          requestedQty: draft.requestedQty,
          difference: draft.difference,
          pctDifference: draft.pctDifference,
          formula: draft.formula,
          physicallySufficient: draft.physicallySufficient,
          explanation: draft.explanation,
          sourceDocumentIds: JSON.stringify(draft.sourceDocumentIds),
          carrierLineItemId: draft.carrierLineItemId,
          measurementValueIds: JSON.stringify(draft.measurementValueIds),
          isWarning: draft.isWarning,
          unit: draft.unit,
        },
      }),
    ),
  );

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "COMPARISON_RUN",
    payload: {
      resultCount: created.length,
      warningCount: created.filter((r) => r.isWarning).length,
      replacedPriorResults: true,
    },
  });

  return created;
}

export async function reviewClaimComparison(input: {
  claimId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot review comparison.");

  const claim = await prisma.claim.findUnique({ where: { id: input.claimId } });
  if (!claim) {
    throw new Error("Claim not found.");
  }

  const count = await prisma.comparisonResult.count({ where: { claimId: input.claimId } });
  if (count === 0) {
    throw new Error("Run measurement comparison before signing off review.");
  }

  const updated = await prisma.claim.update({
    where: { id: input.claimId },
    data: { comparisonReviewedAt: new Date() },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "COMPARISON_REVIEW",
    payload: {
      comparisonResultCount: count,
      comparisonReviewedAt: updated.comparisonReviewedAt?.toISOString(),
    },
  });

  return updated;
}

export async function getClaimComparisons(claimId: string) {
  const [claim, results, documents] = await Promise.all([
    prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        customerName: true,
        comparisonReviewedAt: true,
        workflowStage: true,
      },
    }),
    prisma.comparisonResult.findMany({
      where: { claimId },
      orderBy: [{ isWarning: "asc" }, { comparisonKey: "asc" }],
    }),
    prisma.document.findMany({
      where: { claimId, deletedAt: null },
      select: { id: true, fileName: true, type: true },
    }),
  ]);

  if (!claim) {
    return null;
  }

  const docById = new Map(documents.map((d) => [d.id, d]));

  const enriched = results.map((result) => {
    const sourceIds = JSON.parse(result.sourceDocumentIds) as string[];
    return {
      ...result,
      sourceDocuments: sourceIds
        .map((id) => docById.get(id))
        .filter((d): d is NonNullable<typeof d> => Boolean(d)),
    };
  });

  return { claim, results: enriched, documents };
}
