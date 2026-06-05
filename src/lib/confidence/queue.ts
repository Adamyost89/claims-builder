import {
  ConfidenceReviewResolution,
  ConfidenceReviewType,
} from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import { getConfidenceThreshold } from "@/lib/parsers/confidence";

export async function createConfidenceReviewItem(input: {
  claimId: string;
  reviewType: ConfidenceReviewType;
  relatedTable: string;
  relatedId: string;
  confidence: number;
  reason: string;
  blocksOutput?: boolean;
  beforeJson?: Record<string, unknown>;
}) {
  const existing = await prisma.confidenceReviewItem.findFirst({
    where: {
      claimId: input.claimId,
      relatedTable: input.relatedTable,
      relatedId: input.relatedId,
      resolution: ConfidenceReviewResolution.PENDING,
    },
  });
  if (existing) {
    return existing;
  }

  return prisma.confidenceReviewItem.create({
    data: {
      claimId: input.claimId,
      reviewType: input.reviewType,
      relatedTable: input.relatedTable,
      relatedId: input.relatedId,
      confidence: input.confidence,
      reason: input.reason,
      blocksOutput: input.blocksOutput ?? true,
      beforeJson: input.beforeJson ? JSON.stringify(input.beforeJson) : null,
    },
  });
}

export async function listConfidenceQueue(claimId: string) {
  return prisma.confidenceReviewItem.findMany({
    where: { claimId },
    orderBy: [{ resolution: "asc" }, { createdAt: "desc" }],
    include: {
      resolvedBy: { select: { id: true, name: true } },
    },
  });
}

export async function resolveConfidenceReviewItem(input: {
  claimId: string;
  itemId: string;
  resolution: ConfidenceReviewResolution;
  actorId: string;
  resolutionNote?: string;
  afterJson?: Record<string, unknown>;
}) {
  const item = await prisma.confidenceReviewItem.findFirst({
    where: { id: input.itemId, claimId: input.claimId },
  });
  if (!item) {
    throw new Error("Confidence review item not found.");
  }

  const updated = await prisma.confidenceReviewItem.update({
    where: { id: item.id },
    data: {
      resolution: input.resolution,
      resolvedById: input.actorId,
      resolvedAt: new Date(),
      resolutionNote: input.resolutionNote ?? null,
      afterJson: input.afterJson ? JSON.stringify(input.afterJson) : null,
    },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "CONFIDENCE_RESOLVE",
    payload: {
      itemId: item.id,
      resolution: input.resolution,
      reviewType: item.reviewType,
      relatedTable: item.relatedTable,
      relatedId: item.relatedId,
    },
  });

  return updated;
}

export async function maybeQueueLowConfidence(input: {
  claimId: string;
  reviewType: ConfidenceReviewType;
  relatedTable: string;
  relatedId: string;
  confidence: number;
  label: string;
  threshold?: number;
}) {
  const threshold = input.threshold ?? (await getConfidenceThreshold());
  if (input.confidence >= threshold) {
    return null;
  }
  return createConfidenceReviewItem({
    claimId: input.claimId,
    reviewType: input.reviewType,
    relatedTable: input.relatedTable,
    relatedId: input.relatedId,
    confidence: input.confidence,
    reason: `${input.label} confidence ${(input.confidence * 100).toFixed(0)}% is below threshold ${(threshold * 100).toFixed(0)}%.`,
    blocksOutput: true,
  });
}
