import { ReviewStatus, UserRole } from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { resolveConfidenceReviewItem } from "@/lib/confidence/queue";
import { prisma } from "@/lib/db";
import { assertPermission, canEditClaims } from "@/lib/rbac";

export async function reviewExtraction(input: {
  claimId: string;
  extractionId: string;
  action: "accept" | "reject" | "edit";
  actorId: string;
  actorRole: UserRole;
  newValue?: string;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot review extractions.");

  const extraction = await prisma.documentExtraction.findFirst({
    where: { id: input.extractionId, claimId: input.claimId },
  });
  if (!extraction) {
    throw new Error("Extraction not found.");
  }

  if (input.action === "accept") {
    return updateExtractionReview(extraction.id, {
      reviewStatus: ReviewStatus.ACCEPTED,
      actorId: input.actorId,
      claimId: input.claimId,
    });
  }

  if (input.action === "reject") {
    return updateExtractionReview(extraction.id, {
      reviewStatus: ReviewStatus.REJECTED,
      actorId: input.actorId,
      claimId: input.claimId,
    });
  }

  if (!input.newValue?.trim()) {
    throw new Error("Edited value is required.");
  }

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "MANUAL_EDIT",
    payload: {
      table: "DocumentExtraction",
      rowId: extraction.id,
      before: extraction.fieldValue,
      after: input.newValue,
      originalFieldValue: extraction.originalFieldValue ?? extraction.fieldValue,
    },
  });

  return prisma.documentExtraction.update({
    where: { id: extraction.id },
    data: {
      originalFieldValue: extraction.originalFieldValue ?? extraction.fieldValue,
      fieldValue: input.newValue.trim(),
      reviewStatus: ReviewStatus.EDITED,
      reviewedById: input.actorId,
      reviewedAt: new Date(),
    },
  });
}

export async function reviewLineItem(input: {
  claimId: string;
  lineItemId: string;
  action: "accept" | "reject" | "edit";
  actorId: string;
  actorRole: UserRole;
  description?: string;
  quantity?: number;
  unit?: string;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot review line items.");

  const line = await prisma.estimateLineItem.findFirst({
    where: { id: input.lineItemId, claimId: input.claimId },
  });
  if (!line) {
    throw new Error("Line item not found.");
  }

  if (input.action === "accept") {
    const updated = await updateLineReview(line.id, ReviewStatus.ACCEPTED, input.actorId);
    await resolveRelatedConfidenceItem(input.claimId, "EstimateLineItem", line.id, input.actorId);
    return updated;
  }
  if (input.action === "reject") {
    const updated = await updateLineReview(line.id, ReviewStatus.REJECTED, input.actorId);
    await resolveRelatedConfidenceItem(input.claimId, "EstimateLineItem", line.id, input.actorId);
    return updated;
  }

  const updates: {
    description?: string;
    quantity?: number;
    unit?: string;
    originalDescription?: string;
    originalQuantity?: number;
  } = {};

  if (input.description !== undefined) {
    updates.originalDescription = line.originalDescription ?? line.description;
    updates.description = input.description;
  }
  if (input.quantity !== undefined) {
    updates.originalQuantity = line.originalQuantity ?? line.quantity;
    updates.quantity = input.quantity;
  }
  if (input.unit !== undefined) {
    updates.unit = input.unit;
  }

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "MANUAL_EDIT",
    payload: {
      table: "EstimateLineItem",
      rowId: line.id,
      before: { description: line.description, quantity: line.quantity, unit: line.unit },
      after: updates,
    },
  });

  return prisma.estimateLineItem.update({
    where: { id: line.id },
    data: {
      ...updates,
      reviewStatus: ReviewStatus.EDITED,
      reviewedById: input.actorId,
      reviewedAt: new Date(),
    },
  });
}

export async function reviewMeasurementValue(input: {
  claimId: string;
  valueId: string;
  action: "accept" | "reject" | "edit";
  actorId: string;
  actorRole: UserRole;
  value?: number;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot review measurements.");

  const row = await prisma.measurementValue.findFirst({
    where: { id: input.valueId, claimId: input.claimId },
  });
  if (!row) {
    throw new Error("Measurement value not found.");
  }

  if (input.action === "accept") {
    const updated = await updateMeasurementReview(row.id, ReviewStatus.ACCEPTED, input.actorId);
    await resolveRelatedConfidenceItem(input.claimId, "MeasurementValue", row.id, input.actorId);
    return updated;
  }
  if (input.action === "reject") {
    const updated = await updateMeasurementReview(row.id, ReviewStatus.REJECTED, input.actorId);
    await resolveRelatedConfidenceItem(input.claimId, "MeasurementValue", row.id, input.actorId);
    return updated;
  }

  if (input.value === undefined || !Number.isFinite(input.value)) {
    throw new Error("Edited measurement value is required.");
  }

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "MANUAL_EDIT",
    payload: {
      table: "MeasurementValue",
      rowId: row.id,
      before: row.value,
      after: input.value,
      originalValue: row.originalValue ?? row.value,
    },
  });

  return prisma.measurementValue.update({
    where: { id: row.id },
    data: {
      originalValue: row.originalValue ?? row.value,
      value: input.value,
      reviewStatus: ReviewStatus.EDITED,
      reviewedById: input.actorId,
      reviewedAt: new Date(),
    },
  });
}

async function updateExtractionReview(
  id: string,
  input: { reviewStatus: ReviewStatus; actorId: string; claimId: string },
) {
  const updated = await prisma.documentExtraction.update({
    where: { id },
    data: {
      reviewStatus: input.reviewStatus,
      reviewedById: input.actorId,
      reviewedAt: new Date(),
    },
  });

  await resolveRelatedConfidenceItem(input.claimId, "DocumentExtraction", id, input.actorId);
  return updated;
}

async function updateLineReview(id: string, status: ReviewStatus, actorId: string) {
  return prisma.estimateLineItem.update({
    where: { id },
    data: { reviewStatus: status, reviewedById: actorId, reviewedAt: new Date() },
  });
}

async function updateMeasurementReview(id: string, status: ReviewStatus, actorId: string) {
  return prisma.measurementValue.update({
    where: { id },
    data: { reviewStatus: status, reviewedById: actorId, reviewedAt: new Date() },
  });
}

async function resolveRelatedConfidenceItem(
  claimId: string,
  relatedTable: string,
  relatedId: string,
  actorId: string,
) {
  const item = await prisma.confidenceReviewItem.findFirst({
    where: { claimId, relatedTable, relatedId, resolution: "PENDING" },
  });
  if (item) {
    await resolveConfidenceReviewItem({
      claimId,
      itemId: item.id,
      resolution: "ACCEPTED",
      actorId,
      resolutionNote: "Resolved via extraction review",
    });
  }
}
