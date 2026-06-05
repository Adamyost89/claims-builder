import type { ComparisonResult, EstimateLineItem, Rule } from "@prisma/client";

import type { UsableMeasurementValue } from "@/lib/comparison/context";
import { getUsableParsedData } from "@/lib/parse/usable-data";
import { prisma } from "@/lib/db";

export type IssueDetectionContext = {
  claim: {
    id: string;
    manufacturerSystem: string | null;
    comparisonReviewedAt: Date | null;
  };
  lineItems: EstimateLineItem[];
  measurements: UsableMeasurementValue[];
  comparisons: ComparisonResult[];
  rules: Rule[];
};

export async function buildIssueDetectionContext(
  claimId: string,
): Promise<IssueDetectionContext | null> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      manufacturerSystem: true,
      comparisonReviewedAt: true,
    },
  });
  if (!claim) {
    return null;
  }

  const [parsed, comparisons, rules] = await Promise.all([
    getUsableParsedData(claimId),
    prisma.comparisonResult.findMany({
      where: { claimId },
      orderBy: { comparisonKey: "asc" },
    }),
    prisma.rule.findMany({ where: { active: true }, orderBy: { title: "asc" } }),
  ]);

  return {
    claim,
    lineItems: parsed.lineItems,
    measurements: parsed.measurements,
    comparisons,
    rules,
  };
}
