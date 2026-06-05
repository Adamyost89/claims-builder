import { describe, expect, it } from "vitest";
import type { ComparisonResult, EstimateLineItem, Rule } from "@prisma/client";

import { COMPARISON_KEYS } from "@/lib/comparison/keys";
import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import type { IssueDetectionContext } from "@/lib/issues/context";
import { runIssueDetectionEngine } from "@/lib/issues/engine";
import type { UsableMeasurementValue } from "@/lib/comparison/context";

function line(
  description: string,
  quantity: number,
  unit: string,
  id = description,
): EstimateLineItem {
  return {
    id,
    claimId: "claim-1",
    documentId: "doc-carrier",
    extractionId: null,
    description,
    originalDescription: null,
    quantity,
    originalQuantity: null,
    unit,
    unitPrice: null,
    total: null,
    category: null,
    lineCode: null,
    sourcePage: 1,
    rawText: description,
    confidence: 0.95,
    reviewStatus: "ACCEPTED",
    extractionMethod: "HEURISTIC",
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function measurement(key: string, value: number, unit: string): UsableMeasurementValue {
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
    reviewStatus: "ACCEPTED",
    extractionMethod: "HEURISTIC",
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
    report: { documentId: "doc-measurement" },
  };
}

function comparison(
  partial: Partial<ComparisonResult> & Pick<ComparisonResult, "comparisonKey">,
): ComparisonResult {
  return {
    id: `cmp-${partial.comparisonKey}`,
    claimId: "claim-1",
    approvedQty: 0,
    requestedQty: 0,
    difference: 0,
    pctDifference: 0,
    formula: "formula",
    physicallySufficient: true,
    explanation: "explanation",
    sourceDocumentIds: "[]",
    carrierLineItemId: null,
    measurementValueIds: "[]",
    isWarning: false,
    unit: "SQ",
    createdAt: new Date(),
    ...partial,
  };
}

function ctx(input: Partial<IssueDetectionContext>): IssueDetectionContext {
  return {
    claim: {
      id: "claim-1",
      manufacturerSystem: null,
      comparisonReviewedAt: new Date(),
    },
    lineItems: [],
    measurements: [],
    comparisons: [],
    rules: [] as Rule[],
    ...input,
  };
}

describe("issue detection engine", () => {
  it("creates eave-only starter omitted RevisionItem", () => {
    const results = runIssueDetectionEngine(
      ctx({
        measurements: [measurement(MEASUREMENT_KEYS.EAVE_LF, 156, "LF")],
        comparisons: [
          comparison({
            comparisonKey: COMPARISON_KEYS.STARTER_EAVE_LF,
            approvedQty: 0,
            requestedQty: 156,
            unit: "LF",
            formula: "starter_eave_lf = eave_lf (156)",
          }),
        ],
      }),
    );

    const starter = results.find((r) => r.detectionKey === "hard:starter_omitted_eave");
    expect(starter?.category).toBe("OMITTED_ITEM");
    expect(starter?.requestedQty).toBe(156);
    expect(starter?.requestedLineItem).toContain("eaves");
  });

  it("does not create rake starter automatically", () => {
    const results = runIssueDetectionEngine(
      ctx({
        lineItems: [line("Starter strip at rakes", 80, "LF", "rake-starter")],
        measurements: [
          measurement(MEASUREMENT_KEYS.EAVE_LF, 156, "LF"),
          measurement(MEASUREMENT_KEYS.RAKE_LF, 80, "LF"),
        ],
      }),
    );

    expect(results.some((r) => /rake/i.test(r.title))).toBe(false);
    expect(results.some((r) => r.detectionKey === "hard:starter_omitted_eave")).toBe(true);
  });

  it("creates OC + felt synthetic underlayment review issue", () => {
    const results = runIssueDetectionEngine(
      ctx({
        claim: {
          id: "claim-1",
          manufacturerSystem: "Owens Corning Duration",
          comparisonReviewedAt: new Date(),
        },
        lineItems: [line("15 lb felt underlayment", 24, "SQ")],
        comparisons: [
          comparison({
            comparisonKey: COMPARISON_KEYS.SYNTHETIC_UNDERLAYMENT_SQ,
            approvedQty: 24,
            requestedQty: 24.33,
            unit: "SQ",
          }),
        ],
      }),
    );

    const oc = results.find((r) => r.detectionKey === "hard:oc_felt_synthetic_review");
    expect(oc?.category).toBe("CODE_MANUFACTURER");
    expect(oc?.revisionRequired).toMatch(/review/i);
  });

  it("creates MEASUREMENT_DEFICIENCY when requested exceeds approved", () => {
    const results = runIssueDetectionEngine(
      ctx({
        lineItems: [line("R&R Laminated comp shingle", 20, "SQ")],
        comparisons: [
          comparison({
            comparisonKey: COMPARISON_KEYS.ROOF_AREA_SQ,
            approvedQty: 20,
            requestedQty: 24.33,
            difference: -4.33,
            unit: "SQ",
            physicallySufficient: false,
          }),
        ],
      }),
    );

    const deficiency = results.find(
      (r) => r.detectionKey === "comparison:roof_area_sq:measurement_deficiency",
    );
    expect(deficiency?.category).toBe("MEASUREMENT_DEFICIENCY");
    expect(deficiency?.qtyDifference).toBe(-4.33);
  });

  it("creates OMITTED_ITEM when measurement exists without carrier line", () => {
    const results = runIssueDetectionEngine(
      ctx({
        comparisons: [
          comparison({
            comparisonKey: COMPARISON_KEYS.DRIP_EDGE_LF,
            approvedQty: 0,
            requestedQty: 240,
            isWarning: true,
            unit: "LF",
          }),
        ],
      }),
    );

    expect(
      results.some((r) => r.detectionKey === "comparison:drip_edge_lf:omitted_item"),
    ).toBe(true);
  });

  it("creates INSTALLATION_INSUFFICIENCY when physicallySufficient is false", () => {
    const results = runIssueDetectionEngine(
      ctx({
        lineItems: [line("Drip edge", 100, "LF")],
        comparisons: [
          comparison({
            comparisonKey: COMPARISON_KEYS.DRIP_EDGE_LF,
            approvedQty: 100,
            requestedQty: 240,
            difference: -140,
            physicallySufficient: false,
            unit: "LF",
          }),
        ],
      }),
    );

    expect(
      results.some(
        (r) => r.detectionKey === "comparison:drip_edge_lf:installation_insufficiency",
      ),
    ).toBe(true);
  });
});
