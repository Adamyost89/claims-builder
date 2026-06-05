import { IssueCategory } from "@prisma/client";

import { COMPARISON_KEY_LABELS, COMPARISON_KEYS } from "@/lib/comparison/keys";
import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";

import type { IssueDetectionContext } from "./context";
import {
  findFeltUnderlaymentLine,
  getCarrierLine,
  getEaveLf,
  getMeasurementValue,
  getRoofShingleLine,
  hasAccessoryLines,
  hasDedicatedEaveStarterLine,
  isOwensCorningSystem,
} from "./line-helpers";
import { SOURCE_DETECTION_TYPES, type RevisionDraft } from "./types";

function baseDraft(
  partial: Omit<RevisionDraft, "status" | "readinessStatus" | "exportEligible">,
): RevisionDraft {
  return {
    status: "DRAFT",
    readinessStatus: "NOT_ASSESSED",
    exportEligible: false,
    ...partial,
  };
}

export function detectStarterOmitted(ctx: IssueDetectionContext): RevisionDraft | null {
  if (hasDedicatedEaveStarterLine(ctx.lineItems)) {
    return null;
  }

  const eaveLf = getEaveLf(ctx.measurements);
  if (eaveLf == null || eaveLf <= 0) {
    return null;
  }

  const starterComparison = ctx.comparisons.find(
    (c) => c.comparisonKey === COMPARISON_KEYS.STARTER_EAVE_LF && !c.isWarning,
  );

  return baseDraft({
    detectionKey: "hard:starter_omitted_eave",
    title: "Starter course omitted at eaves",
    category: IssueCategory.OMITTED_ITEM,
    carrierApprovedLineItem: null,
    carrierApprovedQty: 0,
    carrierApprovedUnit: "LF",
    requestedLineItem: "Starter strip at eaves",
    requestedQty: starterComparison?.requestedQty ?? eaveLf,
    requestedUnit: "LF",
    qtyDifference: -(starterComparison?.requestedQty ?? eaveLf),
    calculationMethod: starterComparison?.formula ?? `starter_eave_lf = eave_lf (${eaveLf})`,
    basis:
      "Manufacturer hard rule: starter must be a separate line item at eaves. No dedicated eave starter line found.",
    revisionRequired:
      "Add separate starter course line item at eaves only (rake starter not auto-requested in Phase 4).",
    requiredEvidenceTypes: ["MANUFACTURER", "MEASUREMENT"],
    comparisonResultId: starterComparison?.id ?? null,
    ruleId: findRuleByTitle(ctx, "Starter separation")?.id ?? null,
    sourceDetectionType: SOURCE_DETECTION_TYPES.HARD_RULE,
  });
}

export function detectOcFeltSynthetic(ctx: IssueDetectionContext): RevisionDraft | null {
  if (!isOwensCorningSystem(ctx.claim.manufacturerSystem)) {
    return null;
  }

  const feltLine = findFeltUnderlaymentLine(ctx.lineItems);
  if (!feltLine) {
    return null;
  }

  const syntheticComparison = ctx.comparisons.find(
    (c) => c.comparisonKey === COMPARISON_KEYS.SYNTHETIC_UNDERLAYMENT_SQ,
  );

  return baseDraft({
    detectionKey: "hard:oc_felt_synthetic_review",
    title: "Synthetic underlayment review required (OC + felt)",
    category: IssueCategory.CODE_MANUFACTURER,
    carrierApprovedLineItem: feltLine.description,
    carrierApprovedQty: feltLine.quantity,
    carrierApprovedUnit: feltLine.unit,
    requestedLineItem: "Synthetic underlayment",
    requestedQty: syntheticComparison?.requestedQty ?? null,
    requestedUnit: syntheticComparison?.unit ?? "SQ",
    qtyDifference:
      syntheticComparison != null
        ? feltLine.quantity - syntheticComparison.requestedQty
        : null,
    calculationMethod: syntheticComparison?.formula ?? "Manufacturer system review",
    basis:
      "Hard rule: Owens Corning system with 15 lb felt / felt underlayment requires synthetic underlayment review.",
    revisionRequired:
      "Review synthetic underlayment requirement per OC manufacturer system — not final approval language.",
    requiredEvidenceTypes: ["MANUFACTURER", "CODE"],
    comparisonResultId: syntheticComparison?.id ?? null,
    ruleId: findRuleByTitle(ctx, "Felt / underlayment")?.id ?? null,
    sourceDetectionType: SOURCE_DETECTION_TYPES.HARD_RULE,
  });
}

export function detectEstimateInconsistency(ctx: IssueDetectionContext): RevisionDraft | null {
  if (!hasAccessoryLines(ctx.lineItems)) {
    return null;
  }

  const roofLine = getRoofShingleLine(ctx.lineItems);
  const roofApproved = roofLine?.quantity ?? 0;
  const roofMeasurement = getMeasurementValue(ctx.measurements, MEASUREMENT_KEYS.ROOF_AREA_SQ);

  if (roofApproved > 0 || !roofMeasurement) {
    return null;
  }

  const roofComparison = ctx.comparisons.find(
    (c) => c.comparisonKey === COMPARISON_KEYS.ROOF_AREA_SQ,
  );

  return baseDraft({
    detectionKey: "hard:estimate_inconsistency_accessories_without_base",
    title: "Estimate inconsistency: accessories without base roof scope",
    category: IssueCategory.ESTIMATE_INCONSISTENCY,
    carrierApprovedLineItem: roofLine?.description ?? "Roof shingles (missing)",
    carrierApprovedQty: roofApproved,
    carrierApprovedUnit: "SQ",
    requestedLineItem: "Roof area scope",
    requestedQty: roofMeasurement.value,
    requestedUnit: "SQ",
    qtyDifference: roofApproved - roofMeasurement.value,
    calculationMethod: roofComparison?.formula ?? `roof_area_sq = ${roofMeasurement.value}`,
    basis:
      "Carrier approved roof accessories but base shingle/roof area scope is missing or zero while measurements show roof area.",
    revisionRequired: "Reconcile accessory scope with required base roof installation scope.",
    requiredEvidenceTypes: ["MEASUREMENT", "PHOTO"],
    comparisonResultId: roofComparison?.id ?? null,
    ruleId: findRuleByTitle(ctx, "Omitted line items")?.id ?? null,
    sourceDetectionType: SOURCE_DETECTION_TYPES.HARD_RULE,
  });
}

export function detectHardRules(ctx: IssueDetectionContext): RevisionDraft[] {
  const results: RevisionDraft[] = [];
  const starter = detectStarterOmitted(ctx);
  if (starter) {
    results.push(starter);
  }
  const ocFelt = detectOcFeltSynthetic(ctx);
  if (ocFelt) {
    results.push(ocFelt);
  }
  const inconsistency = detectEstimateInconsistency(ctx);
  if (inconsistency) {
    results.push(inconsistency);
  }
  return results;
}

function findRuleByTitle(ctx: IssueDetectionContext, titlePart: string) {
  return ctx.rules.find((rule) => rule.title.includes(titlePart));
}
