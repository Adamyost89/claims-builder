import type { EstimateLineItem } from "@prisma/client";

import { COMPARISON_KEYS } from "./keys";

export type LineMatchRule = {
  comparisonKey: string;
  patterns: RegExp[];
  unit?: string;
};

export const LINE_MATCH_RULES: LineMatchRule[] = [
  {
    comparisonKey: COMPARISON_KEYS.ROOF_AREA_SQ,
    patterns: [/shingle/i, /comp\.?\s*shingle/i, /laminated/i, /roofing\s+felt/i],
    unit: "SQ",
  },
  {
    comparisonKey: COMPARISON_KEYS.STARTER_EAVE_LF,
    patterns: [/starter/i],
    unit: "LF",
  },
  {
    comparisonKey: COMPARISON_KEYS.RIDGE_CAP_LF,
    patterns: [/ridge\s*cap/i, /hip\s*ridge/i, /ridge\s*shingle/i],
    unit: "LF",
  },
  {
    comparisonKey: COMPARISON_KEYS.DRIP_EDGE_LF,
    patterns: [/drip\s*edge/i],
    unit: "LF",
  },
  {
    comparisonKey: COMPARISON_KEYS.ICE_AND_WATER_EAVE_SF,
    patterns: [/ice\s*(?:&|and)\s*water/i, /\biw\b/i, /weather\s*barrier/i],
    unit: "SF",
  },
  {
    comparisonKey: COMPARISON_KEYS.VALLEY_ICE_AND_WATER_SF,
    patterns: [/valley.*ice/i, /ice.*valley/i],
    unit: "SF",
  },
  {
    comparisonKey: COMPARISON_KEYS.SYNTHETIC_UNDERLAYMENT_SQ,
    patterns: [/synthetic\s*underlayment/i, /underlayment/i, /felt/i],
    unit: "SQ",
  },
  {
    comparisonKey: COMPARISON_KEYS.SIDING_WALL_AREA_SQ,
    patterns: [/siding/i, /vinyl\s*sid/i],
    unit: "SQ",
  },
  {
    comparisonKey: COMPARISON_KEYS.GUTTER_GUARD_LF,
    patterns: [/gutter\s*guard/i, /leaf\s*guard/i],
    unit: "LF",
  },
  {
    comparisonKey: COMPARISON_KEYS.WASTE_COMPARISON,
    patterns: [/waste/i, /overhead/i],
  },
];

export function findCarrierLineForComparison(
  lineItems: EstimateLineItem[],
  comparisonKey: string,
): EstimateLineItem | null {
  const rule = LINE_MATCH_RULES.find((r) => r.comparisonKey === comparisonKey);
  if (!rule) {
    return null;
  }

  for (const line of lineItems) {
    if (rule.unit && line.unit.toUpperCase() !== rule.unit) {
      continue;
    }
    if (rule.patterns.some((pattern) => pattern.test(line.description))) {
      return line;
    }
  }

  return null;
}
