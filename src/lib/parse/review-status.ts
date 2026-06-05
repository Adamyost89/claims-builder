import { ReviewStatus } from "@prisma/client";

/** Statuses that may flow into later phases (comparison, rules, generation). */
export const USABLE_REVIEW_STATUSES: ReviewStatus[] = [
  ReviewStatus.ACCEPTED,
  ReviewStatus.EDITED,
];

export function isUsableReviewStatus(status: ReviewStatus): boolean {
  return USABLE_REVIEW_STATUSES.includes(status);
}

export function isRejectedReviewStatus(status: ReviewStatus): boolean {
  return status === ReviewStatus.REJECTED;
}
