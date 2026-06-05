import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export type GutterGuardLfInput = {
  eaveLf: number;
};

export function calculateGutterGuardLf(input: GutterGuardLfInput): CalculatorOutput {
  const eave = requirePositiveNumber(input.eaveLf, "eave_lf");
  if (typeof eave !== "number") {
    return eave;
  }
  if (eave === 0) {
    return calculatorFailure("eave_lf must be greater than zero for gutter guard.");
  }

  return calculatorSuccess({
    value: eave,
    unit: "LF",
    formula: `gutter_guard_lf = eave_lf (${eave})`,
    explanation: `Gutter guard length follows eave run ${eave} LF.`,
  });
}
