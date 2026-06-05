export type CalculatorSuccess = {
  ok: true;
  value: number;
  unit: string;
  formula: string;
  explanation: string;
};

export type CalculatorFailure = {
  ok: false;
  error: string;
};

export type CalculatorOutput = CalculatorSuccess | CalculatorFailure;

export function calculatorSuccess(input: Omit<CalculatorSuccess, "ok">): CalculatorSuccess {
  return { ok: true, ...input };
}

export function calculatorFailure(error: string): CalculatorFailure {
  return { ok: false, error };
}

export function requirePositiveNumber(
  value: number | undefined | null,
  label: string,
): number | CalculatorFailure {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return calculatorFailure(`${label} is required.`);
  }
  if (value < 0) {
    return calculatorFailure(`${label} must be zero or positive.`);
  }
  return value;
}
