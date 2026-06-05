import { describe, expect, it } from "vitest";
import type { EstimateLineItem } from "@prisma/client";

import { COMPARISON_KEYS } from "@/lib/comparison/keys";
import { runComparisonEngine } from "@/lib/comparison/engine";
import type { UsableMeasurementValue } from "@/lib/comparison/context";
import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";

function line(
  overrides: Partial<EstimateLineItem> & Pick<EstimateLineItem, "description" | "quantity" | "unit">,
): EstimateLineItem {
  return {
    id: overrides.id ?? `line-${overrides.description}`,
    claimId: "claim-1",
    documentId: overrides.documentId ?? "doc-carrier",
    extractionId: null,
    description: overrides.description,
    originalDescription: null,
    quantity: overrides.quantity,
    originalQuantity: null,
    unit: overrides.unit,
    unitPrice: null,
    total: null,
    category: null,
    lineCode: null,
    sourcePage: 1,
    rawText: overrides.description,
    confidence: 0.95,
    reviewStatus: overrides.reviewStatus ?? "ACCEPTED",
    extractionMethod: "HEURISTIC",
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function measurement(
  key: string,
  value: number,
  unit: string,
  reviewStatus: "ACCEPTED" | "PENDING" | "REJECTED" = "ACCEPTED",
): UsableMeasurementValue {
  return {
    id: `mv-${key}`,
    reportId: "report-1",
    claimId: "claim-1",
    extractionId: null,
    key,
    value,
    originalValue: null,
    unit,
    slope: null,
    sourcePage: 1,
    rawText: `${key}: ${value}`,
    confidence: 0.95,
    reviewStatus,
    extractionMethod: "HEURISTIC",
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
    report: { documentId: "doc-measurement" },
  };
}

describe("comparison engine", () => {
  it("uses only accepted line items passed into the engine", () => {
    const results = runComparisonEngine({
      lineItems: [
        line({
          id: "accepted",
          description: "R&R Laminated comp shingle",
          quantity: 20,
          unit: "SQ",
        }),
      ],
      measurements: [measurement(MEASUREMENT_KEYS.ROOF_AREA_SQ, 24.33, "SQ")],
    });

    const roof = results.find((r) => r.comparisonKey === COMPARISON_KEYS.ROOF_AREA_SQ);
    expect(roof).toBeTruthy();
    expect(roof!.approvedQty).toBe(20);
    expect(roof!.requestedQty).toBe(24.33);
    expect(roof!.difference).toBeCloseTo(-4.33);
    expect(roof!.formula).toBe("roof_area_sq = 24.33");
    expect(roof!.physicallySufficient).toBe(false);
  });

  it("matches carrier approved quantity from accepted line items only", () => {
    const results = runComparisonEngine({
      lineItems: [
        line({
          description: "Drip edge",
          quantity: 156,
          unit: "LF",
        }),
      ],
      measurements: [
        measurement(MEASUREMENT_KEYS.EAVE_LF, 156, "LF"),
        measurement(MEASUREMENT_KEYS.RAKE_LF, 84, "LF"),
      ],
    });

    const drip = results.find((r) => r.comparisonKey === COMPARISON_KEYS.DRIP_EDGE_LF);
    expect(drip?.approvedQty).toBe(156);
    expect(drip?.requestedQty).toBe(240);
    expect(drip?.formula).toBe("drip_edge_lf = eave_lf (156) + rake_lf (84)");
  });

  it("excludes pending measurements by caller filtering", () => {
    const results = runComparisonEngine({
      lineItems: [
        line({
          description: "Starter strip",
          quantity: 100,
          unit: "LF",
        }),
      ],
      measurements: [measurement(MEASUREMENT_KEYS.EAVE_LF, 156, "LF", "ACCEPTED")],
    });

    const starter = results.find(
      (r) => r.comparisonKey === COMPARISON_KEYS.STARTER_EAVE_LF,
    );
    expect(starter?.requestedQty).toBe(156);
    expect(starter?.formula).toBe("starter_eave_lf = eave_lf (156)");
  });

  it("creates warning when measurement exists but carrier line is missing", () => {
    const results = runComparisonEngine({
      lineItems: [],
      measurements: [measurement(MEASUREMENT_KEYS.ROOF_AREA_SQ, 24.33, "SQ")],
    });

    expect(
      results.some((r) => r.comparisonKey === COMPARISON_KEYS.WARNING_MISSING_CARRIER),
    ).toBe(true);
    const roofWarning = results.find(
      (r) => r.comparisonKey === COMPARISON_KEYS.ROOF_AREA_SQ && r.isWarning,
    );
    expect(roofWarning).toBeTruthy();
    expect(roofWarning!.approvedQty).toBe(0);
    expect(roofWarning!.requestedQty).toBe(24.33);
  });

  it("creates missing measurement warning without RevisionItem", () => {
    const results = runComparisonEngine({
      lineItems: [
        line({
          description: "R&R Laminated comp shingle",
          quantity: 20,
          unit: "SQ",
        }),
      ],
      measurements: [],
    });

    expect(
      results.some((r) => r.comparisonKey === COMPARISON_KEYS.WARNING_MISSING_MEASUREMENT),
    ).toBe(true);
  });
});
