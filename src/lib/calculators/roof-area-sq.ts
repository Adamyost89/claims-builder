import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export type RoofAreaSqInput = {
  roofAreaSq: number;
};

export function calculateRoofAreaSq(input: RoofAreaSqInput): CalculatorOutput {
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
    formula: `roof_area_sq = ${area}`,
    explanation: `Measurement report roof area is ${area} SQ.`,
  });
}
