import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export type SidingWallAreaSqInput = {
  wallAreaSq: number;
};

export function calculateSidingWallAreaSq(input: SidingWallAreaSqInput): CalculatorOutput {
  const area = requirePositiveNumber(input.wallAreaSq, "wall_area_sq");
  if (typeof area !== "number") {
    return area;
  }
  if (area === 0) {
    return calculatorFailure("wall_area_sq must be greater than zero.");
  }

  return calculatorSuccess({
    value: area,
    unit: "SQ",
    formula: `siding_wall_area_sq = wall_area_sq (${area})`,
    explanation: `Siding wall area from measurement is ${area} SQ.`,
  });
}
