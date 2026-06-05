export function computeDifference(approvedQty: number, requestedQty: number): number {
  return approvedQty - requestedQty;
}

export function computePctDifference(
  approvedQty: number,
  requestedQty: number,
): number | null {
  if (requestedQty === 0) {
    return approvedQty === 0 ? 0 : null;
  }
  return ((approvedQty - requestedQty) / requestedQty) * 100;
}

export function isPhysicallySufficient(approvedQty: number, requestedQty: number): boolean {
  return approvedQty >= requestedQty;
}
