import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

export const DEFAULT_IWS_COURSE_WIDTH_FT = 3;

export type IceAndWaterEaveSfInput = {
  eaveLf: number;
  courseWidthFt?: number;
};

export function calculateIceAndWaterEaveSf(
  input: IceAndWaterEaveSfInput,
): CalculatorOutput {
  const eave = requirePositiveNumber(input.eaveLf, "eave_lf");
  if (typeof eave !== "number") {
    return eave;
  }
  if (eave === 0) {
    return calculatorFailure("eave_lf must be greater than zero.");
  }

  const width = input.courseWidthFt ?? DEFAULT_IWS_COURSE_WIDTH_FT;
  const widthCheck = requirePositiveNumber(width, "course_width_ft");
  if (typeof widthCheck !== "number") {
    return widthCheck;
  }
  if (widthCheck === 0) {
    return calculatorFailure("course_width_ft must be greater than zero.");
  }

  const area = eave * widthCheck;

  return calculatorSuccess({
    value: area,
    unit: "SF",
    formula: `ice_and_water_eave_sf = eave_lf (${eave}) × course_width_ft (${widthCheck})`,
    explanation: `Ice & water at eaves: ${eave} LF × ${widthCheck} ft course = ${area} SF.`,
  });
}
