import { prisma } from "@/lib/db";

import { USABLE_REVIEW_STATUSES } from "./review-status";

/** Parsed rows that may influence later phases (comparison, rules, generation). */
export async function getUsableParsedData(claimId: string) {
  const [lineItems, extractions, measurements] = await Promise.all([
    prisma.estimateLineItem.findMany({
      where: { claimId, reviewStatus: { in: USABLE_REVIEW_STATUSES } },
    }),
    prisma.documentExtraction.findMany({
      where: { claimId, reviewStatus: { in: USABLE_REVIEW_STATUSES } },
    }),
    prisma.measurementValue.findMany({
      where: { claimId, reviewStatus: { in: USABLE_REVIEW_STATUSES } },
      include: { report: { select: { documentId: true } } },
    }),
  ]);

  return { lineItems, extractions, measurements };
}
