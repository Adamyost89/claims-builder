import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export type SyntheticUnderlaymentSqInput = {
  roofAreaSq: number;
};

export function calculateSyntheticUnderlaymentSq(
  input: SyntheticUnderlaymentSqInput,
): CalculatorOutput {
  const area = requirePositiveNumber(input.roofAreaSq, "roof_area_sq");
  if (typeof area !== "number") {
    return area;
  }
  if (area === 0) {
    return calculatorFailure("roof_area_sq must be greater than zero.");
  }

  return calculatorSuccess({
    value: area,
    unit: "SQ",
    formula: `synthetic_underlayment_sq = roof_area_sq (${area})`,
    explanation: `Full-roof synthetic underlayment coverage equals roof area ${area} SQ.`,
  });
}
