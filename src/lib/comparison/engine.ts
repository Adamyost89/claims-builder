import type { EstimateLineItem } from "@prisma/client";

import {
  calculateDripEdgeLf,
  calculateGutterGuardLf,
  calculateIceAndWaterEaveSf,
  calculateRidgeCapLf,
  calculateRoofAreaSq,
  calculateSidingWallAreaSq,
  calculateStarterEaveLf,
  calculateSyntheticUnderlaymentSq,
  calculateValleyIceAndWaterSf,
  calculateWasteComparison,
  type CalculatorOutput,
} from "@/lib/calculators";
import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";

import {
  buildComparisonContext,
  type ComparisonContext,
  type UsableMeasurementValue,
} from "./context";
import { COMPARISON_KEYS } from "./keys";
import { findCarrierLineForComparison } from "./line-matcher";
import {
  computeDifference,
  computePctDifference,
  isPhysicallySufficient,
} from "./math";

export type ComparisonDraft = {
  comparisonKey: string;
  approvedQty: number;
  requestedQty: number;
  difference: number;
  pctDifference: number | null;
  formula: string;
  physicallySufficient: boolean;
  explanation: string;
  sourceDocumentIds: string[];
  carrierLineItemId: string | null;
  measurementValueIds: string[];
  isWarning: boolean;
  unit: string;
};

type ComparisonSpec = {
  comparisonKey: string;
  unit: string;
  compute: (ctx: ComparisonContext) => CalculatorOutput | null;
  measurementKeys: string[];
  optional?: boolean;
};

function measurementIds(ctx: ComparisonContext, keys: string[]): string[] {
  return keys
    .map((key) => ctx.measurementByKey.get(key)?.id)
    .filter((id): id is string => Boolean(id));
}

function documentIdsFromSources(
  ctx: ComparisonContext,
  line: EstimateLineItem | null,
  measurementKeys: string[],
): string[] {
  const ids = new Set<string>();
  if (line) {
    ids.add(line.documentId);
  }
  for (const key of measurementKeys) {
    const measurement = ctx.measurementByKey.get(key);
    if (measurement) {
      ids.add(measurement.report.documentId);
    }
  }
  for (const id of ctx.sourceDocumentIds) {
    ids.add(id);
  }
  return [...ids];
}

function buildComparisonRow(input: {
  comparisonKey: string;
  unit: string;
  approvedQty: number;
  requestedQty: number;
  formula: string;
  explanation: string;
  ctx: ComparisonContext;
  carrierLine: EstimateLineItem | null;
  measurementKeys: string[];
  isWarning?: boolean;
}): ComparisonDraft {
  const difference = computeDifference(input.approvedQty, input.requestedQty);
  const pctDifference = computePctDifference(input.approvedQty, input.requestedQty);

  return {
    comparisonKey: input.comparisonKey,
    approvedQty: input.approvedQty,
    requestedQty: input.requestedQty,
    difference,
    pctDifference,
    formula: input.formula,
    physicallySufficient: input.isWarning
      ? false
      : isPhysicallySufficient(input.approvedQty, input.requestedQty),
    explanation: input.explanation,
    sourceDocumentIds: documentIdsFromSources(
      input.ctx,
      input.carrierLine,
      input.measurementKeys,
    ),
    carrierLineItemId: input.carrierLine?.id ?? null,
    measurementValueIds: measurementIds(input.ctx, input.measurementKeys),
    isWarning: input.isWarning ?? false,
    unit: input.unit,
  };
}

function warningRow(input: {
  comparisonKey: string;
  explanation: string;
  ctx: ComparisonContext;
  carrierLine?: EstimateLineItem | null;
  measurementKeys?: string[];
  unit?: string;
}): ComparisonDraft {
  return buildComparisonRow({
    comparisonKey: input.comparisonKey,
    unit: input.unit ?? "",
    approvedQty: 0,
    requestedQty: 0,
    formula: "N/A — insufficient data",
    explanation: input.explanation,
    ctx: input.ctx,
    carrierLine: input.carrierLine ?? null,
    measurementKeys: input.measurementKeys ?? [],
    isWarning: true,
  });
}

const COMPARISON_SPECS: ComparisonSpec[] = [
  {
    comparisonKey: COMPARISON_KEYS.ROOF_AREA_SQ,
    unit: "SQ",
    measurementKeys: [MEASUREMENT_KEYS.ROOF_AREA_SQ],
    compute: (ctx) => {
      const area = ctx.measurementByKey.get(MEASUREMENT_KEYS.ROOF_AREA_SQ)?.value;
      return area != null ? calculateRoofAreaSq({ roofAreaSq: area }) : null;
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.WASTE_COMPARISON,
    unit: "PCT",
    measurementKeys: [MEASUREMENT_KEYS.WASTE_PCT],
    optional: true,
    compute: (ctx) => {
      const waste = ctx.measurementByKey.get(MEASUREMENT_KEYS.WASTE_PCT)?.value;
      return waste != null ? calculateWasteComparison({ measurementWastePct: waste }) : null;
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.STARTER_EAVE_LF,
    unit: "LF",
    measurementKeys: [MEASUREMENT_KEYS.EAVE_LF],
    compute: (ctx) => {
      const eave = ctx.measurementByKey.get(MEASUREMENT_KEYS.EAVE_LF)?.value;
      return eave != null ? calculateStarterEaveLf({ eaveLf: eave }) : null;
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.RIDGE_CAP_LF,
    unit: "LF",
    measurementKeys: [MEASUREMENT_KEYS.RIDGE_LF, MEASUREMENT_KEYS.HIP_LF],
    compute: (ctx) => {
      const ridge = ctx.measurementByKey.get(MEASUREMENT_KEYS.RIDGE_LF)?.value;
      if (ridge == null) {
        return null;
      }
      const hip = ctx.measurementByKey.get(MEASUREMENT_KEYS.HIP_LF)?.value ?? 0;
      return calculateRidgeCapLf({ ridgeLf: ridge, hipLf: hip });
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.DRIP_EDGE_LF,
    unit: "LF",
    measurementKeys: [MEASUREMENT_KEYS.EAVE_LF, MEASUREMENT_KEYS.RAKE_LF],
    compute: (ctx) => {
      const eave = ctx.measurementByKey.get(MEASUREMENT_KEYS.EAVE_LF)?.value;
      const rake = ctx.measurementByKey.get(MEASUREMENT_KEYS.RAKE_LF)?.value;
      if (eave == null || rake == null) {
        return null;
      }
      return calculateDripEdgeLf({ eaveLf: eave, rakeLf: rake });
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.ICE_AND_WATER_EAVE_SF,
    unit: "SF",
    measurementKeys: [MEASUREMENT_KEYS.EAVE_LF],
    compute: (ctx) => {
      const eave = ctx.measurementByKey.get(MEASUREMENT_KEYS.EAVE_LF)?.value;
      return eave != null ? calculateIceAndWaterEaveSf({ eaveLf: eave }) : null;
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.VALLEY_ICE_AND_WATER_SF,
    unit: "SF",
    measurementKeys: [MEASUREMENT_KEYS.VALLEY_LF],
    optional: true,
    compute: (ctx) => {
      const valley = ctx.measurementByKey.get(MEASUREMENT_KEYS.VALLEY_LF)?.value;
      return valley != null ? calculateValleyIceAndWaterSf({ valleyLf: valley }) : null;
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.SYNTHETIC_UNDERLAYMENT_SQ,
    unit: "SQ",
    measurementKeys: [MEASUREMENT_KEYS.ROOF_AREA_SQ],
    compute: (ctx) => {
      const area = ctx.measurementByKey.get(MEASUREMENT_KEYS.ROOF_AREA_SQ)?.value;
      return area != null ? calculateSyntheticUnderlaymentSq({ roofAreaSq: area }) : null;
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.SIDING_WALL_AREA_SQ,
    unit: "SQ",
    measurementKeys: [MEASUREMENT_KEYS.WALL_AREA_SQ],
    optional: true,
    compute: (ctx) => {
      const wall = ctx.measurementByKey.get(MEASUREMENT_KEYS.WALL_AREA_SQ)?.value;
      return wall != null ? calculateSidingWallAreaSq({ wallAreaSq: wall }) : null;
    },
  },
  {
    comparisonKey: COMPARISON_KEYS.GUTTER_GUARD_LF,
    unit: "LF",
    measurementKeys: [MEASUREMENT_KEYS.EAVE_LF],
    optional: true,
    compute: (ctx) => {
      const eave = ctx.measurementByKey.get(MEASUREMENT_KEYS.EAVE_LF)?.value;
      return eave != null ? calculateGutterGuardLf({ eaveLf: eave }) : null;
    },
  },
];

export function runComparisonEngine(input: {
  lineItems: EstimateLineItem[];
  measurements: UsableMeasurementValue[];
}): ComparisonDraft[] {
  const ctx = buildComparisonContext(input);
  const results: ComparisonDraft[] = [];

  const hasMeasurements = input.measurements.length > 0;
  const hasCarrierLines = input.lineItems.length > 0;

  if (!hasMeasurements && hasCarrierLines) {
    results.push(
      warningRow({
        comparisonKey: COMPARISON_KEYS.WARNING_MISSING_MEASUREMENT,
        explanation:
          "Carrier line items exist but no accepted/edited measurement values are available for comparison.",
        ctx,
      }),
    );
    return results;
  }

  if (!hasCarrierLines && hasMeasurements) {
    results.push(
      warningRow({
        comparisonKey: COMPARISON_KEYS.WARNING_MISSING_CARRIER,
        explanation:
          "Measurement values exist but no accepted/edited carrier line items were found. Phase 4 may detect omitted items.",
        ctx,
      }),
    );
  }

  for (const spec of COMPARISON_SPECS) {
    const carrierLine = findCarrierLineForComparison(ctx.lineItems, spec.comparisonKey);
    const calc = spec.compute(ctx);

    if (!calc) {
      if (!spec.optional && hasMeasurements) {
        results.push(
          warningRow({
            comparisonKey: `${COMPARISON_KEYS.WARNING_MISSING_MEASUREMENT}:${spec.comparisonKey}`,
            explanation: `Required measurement data for ${spec.comparisonKey} is missing. Comparison is incomplete.`,
            ctx,
            carrierLine,
            measurementKeys: spec.measurementKeys,
            unit: spec.unit,
          }),
        );
      }
      continue;
    }

    if (!calc.ok) {
      results.push(
        warningRow({
          comparisonKey: `${COMPARISON_KEYS.WARNING_MISSING_MEASUREMENT}:${spec.comparisonKey}`,
          explanation: calc.error,
          ctx,
          carrierLine,
          measurementKeys: spec.measurementKeys,
          unit: spec.unit,
        }),
      );
      continue;
    }

    const requestedQty = calc.value;
    const approvedQty = carrierLine?.quantity ?? 0;

    if (!carrierLine && hasMeasurements) {
      results.push(
        buildComparisonRow({
          comparisonKey: spec.comparisonKey,
          unit: calc.unit,
          approvedQty: 0,
          requestedQty,
          formula: calc.formula,
          explanation: `${calc.explanation} No matching carrier line item found — flagged for Phase 4 omitted-item detection.`,
          ctx,
          carrierLine: null,
          measurementKeys: spec.measurementKeys,
          isWarning: true,
        }),
      );
      continue;
    }

    results.push(
      buildComparisonRow({
        comparisonKey: spec.comparisonKey,
        unit: calc.unit,
        approvedQty,
        requestedQty,
        formula: calc.formula,
        explanation: `${calc.explanation} Carrier approved ${approvedQty} ${calc.unit}; measurement-supported request ${requestedQty} ${calc.unit}.`,
        ctx,
        carrierLine,
        measurementKeys: spec.measurementKeys,
      }),
    );
  }

  return results;
}
