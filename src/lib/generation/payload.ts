import type { OutputMode } from "@prisma/client";
import { IssueStatus, ReadinessStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { evaluateRevisionReadiness } from "@/lib/evidence/readiness";
import { getEffectiveRequiredEvidenceTypes } from "@/lib/evidence/requirements";
import { evaluateProductionReadiness } from "@/lib/production/readiness";

import {
  GENERATION_PROMPT_VERSION,
  STATIC_BANNED_PHRASES,
  TONE_STYLE_GUIDANCE,
} from "./constants";
import type { GenerationInput } from "./schemas";
import { generationInputSchema } from "./schemas";

export { GENERATION_PROMPT_VERSION };

export async function buildGenerationPayload(
  claimId: string,
  outputMode: OutputMode,
): Promise<GenerationInput> {
  const [claim, revisions, bannedPhraseRows, productionReadiness] = await Promise.all([
    prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        customerName: true,
        propertyAddress: true,
        carrier: true,
        claimNumber: true,
        policyNumber: true,
        state: true,
        city: true,
        claimType: true,
        manufacturerSystem: true,
        dateOfLoss: true,
        evidenceReviewedAt: true,
      },
    }),
    prisma.revisionItem.findMany({
      where: { claimId },
      include: {
        evidenceLinks: true,
        rule: { select: { id: true, citationText: true } },
      },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    }),
    prisma.bannedPhrase.findMany({ where: { active: true } }),
    evaluateProductionReadiness(),
  ]);

  if (!claim) {
    throw new Error("Claim not found.");
  }
  if (!claim.evidenceReviewedAt) {
    throw new Error("Evidence validation must be reviewed before generation.");
  }

  const comparisonIds = revisions
    .map((revision) => revision.comparisonResultId)
    .filter((id): id is string => Boolean(id));

  const comparisons = comparisonIds.length
    ? await prisma.comparisonResult.findMany({
        where: { id: { in: comparisonIds } },
        select: { id: true, formula: true },
      })
    : [];

  const comparisonFormulaById = new Map(comparisons.map((row) => [row.id, row.formula]));

  const ruleIdsFromLinks = revisions.flatMap((revision) =>
    revision.evidenceLinks
      .filter((link) => link.targetTable === "Rule")
      .map((link) => link.targetId),
  );
  const linkedRules = ruleIdsFromLinks.length
    ? await prisma.rule.findMany({
        where: { id: { in: ruleIdsFromLinks } },
        select: { id: true, citationText: true },
      })
    : [];
  const ruleCitationById = new Map(linkedRules.map((rule) => [rule.id, rule.citationText]));

  const bannedPhrases = [
    ...STATIC_BANNED_PHRASES,
    ...bannedPhraseRows.map((row) => row.phrase),
  ];

  const exportEligibleRevisions = [];
  const excludedRevisions = [];
  const unresolvedRevisions = [];

  for (const revision of revisions) {
    const evaluation = evaluateRevisionReadiness(revision, revision.evidenceLinks);
    const storedTypes = JSON.parse(revision.requiredEvidenceTypes) as string[];

    if (
      revision.status === IssueStatus.EXCLUDED ||
      revision.readinessStatus === ReadinessStatus.EXCLUDED
    ) {
      excludedRevisions.push({
        revisionItemId: revision.id,
        title: revision.title,
        category: revision.category,
        excludedReason: revision.excludedReason,
      });
      continue;
    }

    const isExportEligible = revision.exportEligible && evaluation.exportEligible;
    if (!isExportEligible) {
      unresolvedRevisions.push({
        revisionItemId: revision.id,
        title: revision.title,
        category: revision.category,
        readinessStatus: evaluation.readinessStatus,
        requiredEvidenceTypes: getEffectiveRequiredEvidenceTypes({
          category: revision.category,
          storedTypes,
          ruleId: revision.ruleId,
        }),
      });
      continue;
    }

    const comparisonFormulas = revision.comparisonResultId
      ? [comparisonFormulaById.get(revision.comparisonResultId)].filter(
          (formula): formula is string => Boolean(formula),
        )
      : [];

    const ruleCitations = [];
    if (revision.rule?.citationText) {
      ruleCitations.push({
        ruleId: revision.rule.id,
        citationText: revision.rule.citationText,
      });
    }
    for (const link of revision.evidenceLinks) {
      if (link.targetTable === "Rule") {
        const citationText = ruleCitationById.get(link.targetId);
        if (citationText && !ruleCitations.some((rule) => rule.ruleId === link.targetId)) {
          ruleCitations.push({ ruleId: link.targetId, citationText });
        }
      }
    }

    exportEligibleRevisions.push({
      revisionItemId: revision.id,
      title: revision.title,
      category: revision.category,
      carrierApprovedLineItem: revision.carrierApprovedLineItem,
      carrierApprovedQty: revision.carrierApprovedQty,
      carrierApprovedUnit: revision.carrierApprovedUnit,
      requestedLineItem: revision.requestedLineItem,
      requestedQty: revision.requestedQty,
      requestedUnit: revision.requestedUnit,
      qtyDifference: revision.qtyDifference,
      calculationMethod: revision.calculationMethod,
      basis: revision.basis,
      revisionRequired: revision.revisionRequired,
      requiredEvidenceStatus: evaluation.readinessStatus,
      isOverridden: evaluation.isOverridden,
      comparisonFormulas,
      evidence: revision.evidenceLinks.map((link) => ({
        evidenceId: link.id,
        evidenceType: link.evidenceType,
        label: link.label,
        snippet: link.snippet,
        targetTable: link.targetTable,
        targetId: link.targetId,
        isSatisfied: link.isSatisfied,
      })),
      ruleCitations,
    });
  }

  const payload: GenerationInput = {
    claimId,
    outputMode,
    claim: {
      customerName: claim.customerName,
      propertyAddress: claim.propertyAddress,
      carrier: claim.carrier,
      claimNumber: claim.claimNumber,
      policyNumber: claim.policyNumber,
      state: claim.state,
      city: claim.city,
      claimType: claim.claimType,
      manufacturerSystem: claim.manufacturerSystem,
      dateOfLoss: claim.dateOfLoss.toISOString(),
    },
    productionReadiness: {
      productionReady: productionReadiness.productionReady,
      blockers: productionReadiness.blockers,
    },
    toneRules: [...TONE_STYLE_GUIDANCE],
    bannedPhrases: [...new Set(bannedPhrases)],
    exportEligibleRevisions,
    excludedRevisions,
    unresolvedRevisions,
  };

  return generationInputSchema.parse(payload);
}
