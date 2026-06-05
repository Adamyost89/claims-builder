import type { ComparisonResult } from "@prisma/client";
import { IssueCategory } from "@prisma/client";

import { COMPARISON_KEY_LABELS, COMPARISON_KEYS } from "@/lib/comparison/keys";

import type { IssueDetectionContext } from "./context";
import { getCarrierLine } from "./line-helpers";
import { SOURCE_DETECTION_TYPES, type RevisionDraft } from "./types";

const QUANTITY_COMPARISON_KEYS = [
  COMPARISON_KEYS.ROOF_AREA_SQ,
  COMPARISON_KEYS.STARTER_EAVE_LF,
  COMPARISON_KEYS.RIDGE_CAP_LF,
  COMPARISON_KEYS.DRIP_EDGE_LF,
  COMPARISON_KEYS.ICE_AND_WATER_EAVE_SF,
  COMPARISON_KEYS.VALLEY_ICE_AND_WATER_SF,
  COMPARISON_KEYS.SYNTHETIC_UNDERLAYMENT_SQ,
  COMPARISON_KEYS.SIDING_WALL_AREA_SQ,
  COMPARISON_KEYS.GUTTER_GUARD_LF,
  COMPARISON_KEYS.WASTE_COMPARISON,
] as const;

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

function labelFor(key: string): string {
  return COMPARISON_KEY_LABELS[key as keyof typeof COMPARISON_KEY_LABELS] ?? key;
}

function carrierLineDescription(ctx: IssueDetectionContext, comparison: ComparisonResult): string | null {
  if (comparison.carrierLineItemId) {
    const line = ctx.lineItems.find((l) => l.id === comparison.carrierLineItemId);
    return line?.description ?? null;
  }
  const matched = getCarrierLine(ctx.lineItems, comparison.comparisonKey);
  return matched?.description ?? null;
}

export function detectMeasurementDeficiency(
  ctx: IssueDetectionContext,
  comparison: ComparisonResult,
): RevisionDraft | null {
  if (comparison.isWarning) {
    return null;
  }
  if (comparison.requestedQty <= comparison.approvedQty) {
    return null;
  }

  const carrierDesc = carrierLineDescription(ctx, comparison);

  return baseDraft({
    detectionKey: `comparison:${comparison.comparisonKey}:measurement_deficiency`,
    title: `${labelFor(comparison.comparisonKey)} quantity deficiency`,
    category: IssueCategory.MEASUREMENT_DEFICIENCY,
    carrierApprovedLineItem: carrierDesc,
    carrierApprovedQty: comparison.approvedQty,
    carrierApprovedUnit: comparison.unit,
    requestedLineItem: labelFor(comparison.comparisonKey),
    requestedQty: comparison.requestedQty,
    requestedUnit: comparison.unit,
    qtyDifference: comparison.difference,
    calculationMethod: comparison.formula,
    basis: comparison.explanation,
    revisionRequired: `Measurement-supported quantity exceeds carrier-approved ${labelFor(comparison.comparisonKey)}.`,
    requiredEvidenceTypes: ["MEASUREMENT"],
    comparisonResultId: comparison.id,
    ruleId: findRuleByTitle(ctx, "Measurement comparison variance")?.id ?? null,
    sourceDetectionType: SOURCE_DETECTION_TYPES.COMPARISON,
  });
}

export function detectOmittedFromComparison(
  ctx: IssueDetectionContext,
  comparison: ComparisonResult,
): RevisionDraft | null {
  const isOmitted =
    (comparison.isWarning && comparison.approvedQty === 0 && comparison.requestedQty > 0) ||
    (!comparison.carrierLineItemId &&
      comparison.approvedQty === 0 &&
      comparison.requestedQty > 0 &&
      !comparison.comparisonKey.startsWith("warning_"));

  if (!isOmitted) {
    return null;
  }

  return baseDraft({
    detectionKey: `comparison:${comparison.comparisonKey}:omitted_item`,
    title: `${labelFor(comparison.comparisonKey)} omitted from carrier scope`,
    category: IssueCategory.OMITTED_ITEM,
    carrierApprovedLineItem: null,
    carrierApprovedQty: 0,
    carrierApprovedUnit: comparison.unit,
    requestedLineItem: labelFor(comparison.comparisonKey),
    requestedQty: comparison.requestedQty,
    requestedUnit: comparison.unit,
    qtyDifference: -comparison.requestedQty,
    calculationMethod: comparison.formula,
    basis: comparison.explanation,
    revisionRequired: `Carrier scope has no matching line for measurement-supported ${labelFor(comparison.comparisonKey)}.`,
    requiredEvidenceTypes: ["MEASUREMENT", "PHOTO"],
    comparisonResultId: comparison.id,
    ruleId: findRuleByTitle(ctx, "Omitted line items")?.id ?? null,
    sourceDetectionType: SOURCE_DETECTION_TYPES.COMPARISON,
  });
}

export function detectInstallationInsufficiency(
  ctx: IssueDetectionContext,
  comparison: ComparisonResult,
): RevisionDraft | null {
  if (comparison.isWarning || comparison.physicallySufficient) {
    return null;
  }

  const carrierDesc = carrierLineDescription(ctx, comparison);

  return baseDraft({
    detectionKey: `comparison:${comparison.comparisonKey}:installation_insufficiency`,
    title: `${labelFor(comparison.comparisonKey)} physically insufficient`,
    category: IssueCategory.INSTALLATION_INSUFFICIENCY,
    carrierApprovedLineItem: carrierDesc,
    carrierApprovedQty: comparison.approvedQty,
    carrierApprovedUnit: comparison.unit,
    requestedLineItem: labelFor(comparison.comparisonKey),
    requestedQty: comparison.requestedQty,
    requestedUnit: comparison.unit,
    qtyDifference: comparison.difference,
    calculationMethod: comparison.formula,
    basis: `Approved quantity does not physically support installation. ${comparison.explanation}`,
    revisionRequired: `Increase approved ${labelFor(comparison.comparisonKey)} to support physical installation.`,
    requiredEvidenceTypes: ["MEASUREMENT", "MANUFACTURER"],
    comparisonResultId: comparison.id,
    ruleId: null,
    sourceDetectionType: SOURCE_DETECTION_TYPES.COMPARISON,
  });
}

export function detectComparisonIssues(ctx: IssueDetectionContext): RevisionDraft[] {
  const results: RevisionDraft[] = [];
  const seen = new Set<string>();

  for (const key of QUANTITY_COMPARISON_KEYS) {
    const comparison = ctx.comparisons.find((c) => c.comparisonKey === key);
    if (!comparison) {
      continue;
    }

    for (const detector of [
      detectOmittedFromComparison,
      detectMeasurementDeficiency,
      detectInstallationInsufficiency,
    ]) {
      const draft = detector(ctx, comparison);
      if (draft && !seen.has(draft.detectionKey)) {
        seen.add(draft.detectionKey);
        results.push(draft);
      }
    }
  }

  return results;
}

function findRuleByTitle(ctx: IssueDetectionContext, titlePart: string) {
  return ctx.rules.find((rule) => rule.title.includes(titlePart));
}
