import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export type StarterEaveLfInput = {
  eaveLf: number;
};

export function calculateStarterEaveLf(input: StarterEaveLfInput): CalculatorOutput {
  const eave = requirePositiveNumber(input.eaveLf, "eave_lf");
  if (typeof eave !== "number") {
    return eave;
  }
  if (eave === 0) {
    return calculatorFailure("eave_lf must be greater than zero for starter calculation.");
  }

  return calculatorSuccess({
    value: eave,
    unit: "LF",
    formula: `starter_eave_lf = eave_lf (${eave})`,
    explanation: `Starter course at eaves equals eave length ${eave} LF.`,
  });
}
