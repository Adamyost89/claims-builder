import type { RevisionItem, Rule } from "@prisma/client";
import { EvidenceType, IssueStatus, RuleAuthority } from "@prisma/client";

import { prisma } from "@/lib/db";

import { getCategoryEvidenceRequirements } from "./requirements";

function ruleAuthorityToEvidenceType(authority: RuleAuthority): EvidenceType | null {
  if (authority === RuleAuthority.CODE) {
    return EvidenceType.CODE;
  }
  if (authority === RuleAuthority.MANUFACTURER) {
    return EvidenceType.MANUFACTURER;
  }
  return null;
}

function requiredTypesForRevision(revision: RevisionItem): EvidenceType[] {
  const spec = getCategoryEvidenceRequirements({
    category: revision.category,
    ruleId: revision.ruleId,
  });
  return [...new Set(spec.groups.flat())];
}

function evidenceTypeSatisfiesRevision(
  revision: RevisionItem,
  evidenceType: EvidenceType,
): boolean {
  const spec = getCategoryEvidenceRequirements({
    category: revision.category,
    ruleId: revision.ruleId,
  });
  return spec.groups.some((group) => group.includes(evidenceType));
}

async function ensureAutoLink(input: {
  claimId: string;
  revisionItemId: string;
  evidenceType: EvidenceType;
  targetTable: string;
  targetId: string;
  label: string;
  snippet: string | null;
  revision: RevisionItem;
}) {
  const existing = await prisma.evidenceLink.findFirst({
    where: {
      revisionItemId: input.revisionItemId,
      targetTable: input.targetTable,
      targetId: input.targetId,
    },
  });
  if (existing) {
    return existing;
  }

  const isSatisfied = evidenceTypeSatisfiesRevision(input.revision, input.evidenceType);

  return prisma.evidenceLink.create({
    data: {
      claimId: input.claimId,
      revisionItemId: input.revisionItemId,
      evidenceType: input.evidenceType,
      targetTable: input.targetTable,
      targetId: input.targetId,
      label: input.label,
      snippet: input.snippet,
      isRequired: true,
      isSatisfied,
    },
  });
}

export async function autoLinkRevisionEvidence(revision: RevisionItem) {
  if (revision.status === IssueStatus.EXCLUDED) {
    return [];
  }

  const requiredTypes = requiredTypesForRevision(revision);
  const created = [];

  if (
    revision.comparisonResultId &&
    requiredTypes.includes(EvidenceType.MEASUREMENT)
  ) {
    const comparison = await prisma.comparisonResult.findFirst({
      where: { id: revision.comparisonResultId, claimId: revision.claimId },
    });
    if (comparison) {
      const link = await ensureAutoLink({
        claimId: revision.claimId,
        revisionItemId: revision.id,
        evidenceType: EvidenceType.MEASUREMENT,
        targetTable: "ComparisonResult",
        targetId: comparison.id,
        label: comparison.comparisonKey,
        snippet: comparison.formula,
        revision,
      });
      created.push(link);
    }
  }

  if (revision.ruleId) {
    const rule = await prisma.rule.findUnique({ where: { id: revision.ruleId } });
    if (rule) {
      const evidenceType = ruleAuthorityToEvidenceType(rule.authorityType);
      if (evidenceType && requiredTypes.includes(evidenceType)) {
        const link = await ensureAutoLink({
          claimId: revision.claimId,
          revisionItemId: revision.id,
          evidenceType,
          targetTable: "Rule",
          targetId: rule.id,
          label: rule.title,
          snippet: rule.citationText,
          revision,
        });
        created.push(link);
      }
    }
  }

  return created;
}

export function shouldAutoLinkDocument(documentType: string): boolean {
  return !["PHOTO", "INVOICE", "POLICY_JACKET"].includes(documentType);
}

export type { Rule };
