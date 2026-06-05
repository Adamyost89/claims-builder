import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export type RidgeCapLfInput = {
  ridgeLf: number;
  hipLf?: number;
};

export function calculateRidgeCapLf(input: RidgeCapLfInput): CalculatorOutput {
  const ridge = requirePositiveNumber(input.ridgeLf, "ridge_lf");
  if (typeof ridge !== "number") {
    return ridge;
  }

  const hipRaw = input.hipLf ?? 0;
  const hip = requirePositiveNumber(hipRaw, "hip_lf");
  if (typeof hip !== "number") {
    return hip;
  }

  const total = ridge + hip;
  if (total === 0) {
    return calculatorFailure("ridge_lf and hip_lf cannot both be zero.");
  }

  return calculatorSuccess({
    value: total,
    unit: "LF",
    formula: `ridge_cap_lf = ridge_lf (${ridge}) + hip_lf (${hip})`,
    explanation: `Ridge cap length combines ridge ${ridge} LF and hip ${hip} LF.`,
  });
}
