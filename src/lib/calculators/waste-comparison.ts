import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export type WasteComparisonInput = {
  measurementWastePct: number;
};

export function calculateWasteComparison(input: WasteComparisonInput): CalculatorOutput {
  const waste = requirePositiveNumber(input.measurementWastePct, "waste_pct_recommended");
  if (typeof waste !== "number") {
    return waste;
  }

  return calculatorSuccess({
    value: waste,
    unit: "PCT",
    formula: `waste_pct_recommended = ${waste}`,
    explanation: `Measurement-recommended waste factor is ${waste}%.`,
  });
}
