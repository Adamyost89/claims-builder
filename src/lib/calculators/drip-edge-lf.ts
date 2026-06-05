import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export type DripEdgeLfInput = {
  eaveLf: number;
  rakeLf: number;
};

export function calculateDripEdgeLf(input: DripEdgeLfInput): CalculatorOutput {
  const eave = requirePositiveNumber(input.eaveLf, "eave_lf");
  if (typeof eave !== "number") {
    return eave;
  }
  const rake = requirePositiveNumber(input.rakeLf, "rake_lf");
  if (typeof rake !== "number") {
    return rake;
  }

  const total = eave + rake;
  if (total === 0) {
    return calculatorFailure("eave_lf and rake_lf cannot both be zero.");
  }

  return calculatorSuccess({
    value: total,
    unit: "LF",
    formula: `drip_edge_lf = eave_lf (${eave}) + rake_lf (${rake})`,
    explanation: `Drip edge covers eaves ${eave} LF plus rakes ${rake} LF.`,
  });
}
