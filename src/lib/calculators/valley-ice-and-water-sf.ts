import {
  calculatorFailure,
  calculatorSuccess,
  requirePositiveNumber,
  type CalculatorOutput,
} from "./types";

import { DEFAULT_IWS_COURSE_WIDTH_FT } from "./ice-and-water-eave-sf";

export type ValleyIceAndWaterSfInput = {
  valleyLf: number;
  courseWidthFt?: number;
};

export function calculateValleyIceAndWaterSf(
  input: ValleyIceAndWaterSfInput,
): CalculatorOutput {
  const valley = requirePositiveNumber(input.valleyLf, "valley_lf");
  if (typeof valley !== "number") {
    return valley;
  }
  if (valley === 0) {
    return calculatorFailure("valley_lf must be greater than zero.");
  }

  const width = input.courseWidthFt ?? DEFAULT_IWS_COURSE_WIDTH_FT;
  const widthCheck = requirePositiveNumber(width, "course_width_ft");
  if (typeof widthCheck !== "number") {
    return widthCheck;
  }
  if (widthCheck === 0) {
    return calculatorFailure("course_width_ft must be greater than zero.");
  }

  const area = valley * widthCheck;

  return calculatorSuccess({
    value: area,
    unit: "SF",
    formula: `valley_ice_and_water_sf = valley_lf (${valley}) × course_width_ft (${widthCheck})`,
    explanation: `Ice & water in valleys: ${valley} LF × ${widthCheck} ft width = ${area} SF.`,
  });
}
