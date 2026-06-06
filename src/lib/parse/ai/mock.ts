import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import type { ExtractedPage } from "@/lib/parsers/types";

import type { AiCarrierExtraction, AiMeasurementExtraction } from "./schemas";

const ERIE_MARKER = "Erie Insurance - Property Estimate";

export function mockExtractCarrierEstimate(pages: ExtractedPage[]): AiCarrierExtraction | null {
  const fullText = pages.map((p) => p.text).join("\n");

  if (fullText.includes("AI_TEST_FORCE_MALFORMED")) {
    return { lineItems: [{ description: 123 }] } as unknown as AiCarrierExtraction;
  }

  if (fullText.includes("AI_TEST_MISSING_SOURCE")) {
    return {
      lineItems: [
        {
          lineNumber: 999,
          description: "Fabricated line",
          action: null,
          quantity: 1,
          unit: "EA",
          unitPrice: 10,
          replacementCost: null,
          depreciation: null,
          acv: null,
          sourcePage: 1,
          sourceText: "THIS TEXT DOES NOT EXIST IN THE DOCUMENT",
          confidence: 0.95,
        },
      ],
      warnings: [],
    };
  }

  if (!fullText.includes(ERIE_MARKER)) {
    return null;
  }

  const lineItems: AiCarrierExtraction["lineItems"] = [];

  const tearOutLine =
    "101|Tear out - 3 tab shingles|24.00|SQ|45.00|1080.00|540.00|540.00";
  if (fullText.includes("Tear out - 3 tab shingles")) {
    lineItems.push({
      lineNumber: 101,
      description: "Tear out - 3 tab shingles",
      action: "tear_out",
      quantity: 24,
      unit: "SQ",
      unitPrice: 45,
      replacementCost: 1080,
      depreciation: 540,
      acv: 540,
      sourcePage: 1,
      sourceText: tearOutLine,
      confidence: 0.88,
    });
  }

  const installLine =
    "102|Install - Lam comp shingle|24.00|SQ|185.00|4440.00|2220.00|2220.00";
  if (fullText.includes("Install - Lam comp shingle")) {
    lineItems.push({
      lineNumber: 102,
      description: "Install - Lam comp shingle",
      action: "install",
      quantity: 24,
      unit: "SQ",
      unitPrice: 185,
      replacementCost: 4440,
      depreciation: 2220,
      acv: 2220,
      sourcePage: 1,
      sourceText: installLine,
      confidence: 0.9,
    });
  }

  if (lineItems.length === 0) {
    return null;
  }

  return { lineItems, warnings: [] };
}

export function mockExtractMeasurementReport(
  pages: ExtractedPage[],
): AiMeasurementExtraction | null {
  const fullText = pages.map((p) => p.text).join("\n");

  if (fullText.includes("GAF QuickMeasure Report") && fullText.includes("Waste Factor Table")) {
    const roofSource = "Total Area 20.33 SQ";
    const rakeSource = "Rakes 88 LF";
    const hipSource = "Hips 24 LF";
    const suggestedWasteSource = "Suggested Waste 12%   22.77 SQ";

    return {
      vendor: "GAF",
      roofAreaSqFt: 2033,
      eavesLf: null,
      rakesLf: 88,
      ridgesLf: null,
      hipsLf: 24,
      valleysLf: null,
      dripEdgeLf: null,
      starterLf: null,
      ridgeCapLf: null,
      iceWaterLf: null,
      stepFlashingLf: null,
      roofToWallFlashingLf: null,
      predominantPitch: null,
      facetCount: null,
      suggestedWastePct: 12,
      fields: [
        {
          key: MEASUREMENT_KEYS.ROOF_AREA_SQ,
          value: 20.33,
          unit: "SQ",
          sourcePage: 1,
          sourceText: roofSource,
          confidence: 0.92,
        },
        {
          key: MEASUREMENT_KEYS.RAKE_LF,
          value: 88,
          unit: "LF",
          sourcePage: 1,
          sourceText: rakeSource,
          confidence: 0.9,
        },
        {
          key: MEASUREMENT_KEYS.HIP_LF,
          value: 24,
          unit: "LF",
          sourcePage: 1,
          sourceText: hipSource,
          confidence: 0.9,
        },
        {
          key: MEASUREMENT_KEYS.WASTE_PCT,
          value: 12,
          unit: "PCT",
          sourcePage: 1,
          sourceText: suggestedWasteSource,
          confidence: 0.88,
        },
      ],
      warnings: [],
    };
  }

  if (fullText.includes("GAF QuickMeasure Report")) {
    const roofSource = "Total Area 20.33 SQ";
    const rakeSource = "Rakes 88 LF";
    const hipSource = "Hips 24 LF";

    return {
      vendor: "GAF",
      roofAreaSqFt: 2033,
      eavesLf: null,
      rakesLf: 88,
      ridgesLf: null,
      hipsLf: 24,
      valleysLf: null,
      dripEdgeLf: null,
      starterLf: null,
      ridgeCapLf: null,
      iceWaterLf: null,
      stepFlashingLf: null,
      roofToWallFlashingLf: null,
      predominantPitch: null,
      facetCount: null,
      suggestedWastePct: null,
      fields: [
        {
          key: MEASUREMENT_KEYS.ROOF_AREA_SQ,
          value: 20.33,
          unit: "SQ",
          sourcePage: 1,
          sourceText: roofSource,
          confidence: 0.92,
        },
        {
          key: MEASUREMENT_KEYS.RAKE_LF,
          value: 88,
          unit: "LF",
          sourcePage: 1,
          sourceText: rakeSource,
          confidence: 0.9,
        },
        {
          key: MEASUREMENT_KEYS.HIP_LF,
          value: 24,
          unit: "LF",
          sourcePage: 1,
          sourceText: hipSource,
          confidence: 0.9,
        },
      ],
      warnings: [],
    };
  }

  return null;
}

/** Test hook: returns intentionally invalid payload shape. */
export function mockMalformedAiPayload(): unknown {
  return { lineItems: [{ description: 123, notAField: true }] };
}
