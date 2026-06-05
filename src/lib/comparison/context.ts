import type { EstimateLineItem, MeasurementValue } from "@prisma/client";

import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";

export type UsableMeasurementValue = MeasurementValue & {
  report: { documentId: string };
};

export type ComparisonContext = {
  lineItems: EstimateLineItem[];
  measurements: UsableMeasurementValue[];
  measurementByKey: Map<string, UsableMeasurementValue>;
  sourceDocumentIds: Set<string>;
};

export function buildComparisonContext(input: {
  lineItems: EstimateLineItem[];
  measurements: UsableMeasurementValue[];
}): ComparisonContext {
  const measurementByKey = new Map<string, UsableMeasurementValue>();
  const sourceDocumentIds = new Set<string>();

  for (const line of input.lineItems) {
    sourceDocumentIds.add(line.documentId);
  }

  for (const measurement of input.measurements) {
    if (!measurementByKey.has(measurement.key)) {
      measurementByKey.set(measurement.key, measurement);
    }
    sourceDocumentIds.add(measurement.report.documentId);
  }

  return {
    lineItems: input.lineItems,
    measurements: input.measurements,
    measurementByKey,
    sourceDocumentIds,
  };
}

export function getMeasurementValue(
  ctx: ComparisonContext,
  key: string,
): MeasurementValue | undefined {
  return ctx.measurementByKey.get(key);
}

export function getNumericMeasurement(
  ctx: ComparisonContext,
  key: string,
): number | undefined {
  const row = getMeasurementValue(ctx, key);
  return row?.value;
}

export { MEASUREMENT_KEYS };
