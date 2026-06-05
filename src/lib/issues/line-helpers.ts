import type { EstimateLineItem } from "@prisma/client";

import { findCarrierLineForComparison } from "@/lib/comparison/line-matcher";
import { COMPARISON_KEYS } from "@/lib/comparison/keys";
import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import type { UsableMeasurementValue } from "@/lib/comparison/context";

export function hasDedicatedEaveStarterLine(lineItems: EstimateLineItem[]): boolean {
  return lineItems.some((line) => {
    if (line.unit.toUpperCase() !== "LF") {
      return false;
    }
    const lower = line.description.toLowerCase();
    if (!/starter/.test(lower)) {
      return false;
    }
    return !/rake/.test(lower);
  });
}

export function hasRakeStarterLine(lineItems: EstimateLineItem[]): boolean {
  return lineItems.some((line) => /starter/i.test(line.description) && /rake/i.test(line.description));
}

export function findFeltUnderlaymentLine(
  lineItems: EstimateLineItem[],
): EstimateLineItem | null {
  for (const line of lineItems) {
    const lower = line.description.toLowerCase();
    if (
      (/15\s*lb|#15|15#/.test(lower) || /felt/.test(lower)) &&
      (/felt|underlayment/.test(lower)) &&
      !/synthetic/.test(lower)
    ) {
      return line;
    }
  }
  return null;
}

export function isOwensCorningSystem(manufacturerSystem: string | null): boolean {
  if (!manufacturerSystem) {
    return false;
  }
  return /owens\s*corning|\boc\b/i.test(manufacturerSystem);
}

export function getMeasurementValue(
  measurements: UsableMeasurementValue[],
  key: string,
): UsableMeasurementValue | undefined {
  return measurements.find((m) => m.key === key);
}

export function getEaveLf(measurements: UsableMeasurementValue[]): number | null {
  const row = getMeasurementValue(measurements, MEASUREMENT_KEYS.EAVE_LF);
  return row?.value ?? null;
}

export function getCarrierLine(
  lineItems: EstimateLineItem[],
  comparisonKey: string,
): EstimateLineItem | null {
  return findCarrierLineForComparison(lineItems, comparisonKey);
}

export function hasAccessoryLines(lineItems: EstimateLineItem[]): boolean {
  const keys = [
    COMPARISON_KEYS.DRIP_EDGE_LF,
    COMPARISON_KEYS.RIDGE_CAP_LF,
    COMPARISON_KEYS.STARTER_EAVE_LF,
  ];
  return keys.some((key) => getCarrierLine(lineItems, key) != null);
}

export function getRoofShingleLine(lineItems: EstimateLineItem[]): EstimateLineItem | null {
  return getCarrierLine(lineItems, COMPARISON_KEYS.ROOF_AREA_SQ);
}
