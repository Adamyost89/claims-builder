import type { EvidenceType, RevisionItem, UserRole } from "@prisma/client";
import { IssueStatus, ReadinessStatus } from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import { assertPermission, canEditClaims } from "@/lib/rbac";

import { autoLinkRevisionEvidence } from "./auto-link";
import {
  flattenRequirementGroups,
  getCategoryEvidenceRequirements,
  getEffectiveRequiredEvidenceTypes,
} from "./requirements";
import { canReviewEvidence, evaluateRevisionReadiness } from "./readiness";
import { EvidenceTargetError, validateEvidenceTarget } from "./targets";

export { EvidenceTargetError };

export async function clearEvidenceReviewedAt(claimId: string) {
  await prisma.claim.update({
    where: { id: claimId },
    data: { evidenceReviewedAt: null },
  });
}

export async function refreshRevisionReadiness(revisionId: string) {
  const revision = await prisma.revisionItem.findUnique({
    where: { id: revisionId },
    include: { evidenceLinks: true },
  });
  if (!revision) {
    throw new Error("Revision item not found.");
  }

  const evaluation = evaluateRevisionReadiness(revision, revision.evidenceLinks);

  return prisma.revisionItem.update({
    where: { id: revision.id },
    data: {
      readinessStatus: evaluation.readinessStatus,
      exportEligible: evaluation.exportEligible,
    },
  });
}

export async function refreshClaimEvidence(claimId: string) {
  const revisions = await prisma.revisionItem.findMany({ where: { claimId } });

  for (const revision of revisions) {
    if (revision.status !== IssueStatus.EXCLUDED) {
      await autoLinkRevisionEvidence(revision);
    }
    await refreshRevisionReadiness(revision.id);
  }

  return revisions.length;
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

export async function createEvidenceLink(input: {
  claimId: string;
  revisionItemId: string;
  evidenceType: EvidenceType;
  targetTable: string;
  targetId: string;
  label?: string;
  snippet?: string;
  isRequired?: boolean;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot create evidence links.");

  const revision = await prisma.revisionItem.findFirst({
    where: { id: input.revisionItemId, claimId: input.claimId },
  });
  if (!revision) {
    throw new Error("Revision item not found.");
  }

  const target = await validateEvidenceTarget({
    claimId: input.claimId,
    targetTable: input.targetTable,
    targetId: input.targetId,
  });

  const isSatisfied = evidenceTypeSatisfiesRevision(revision, input.evidenceType);

  const link = await prisma.evidenceLink.create({
    data: {
      claimId: input.claimId,
      revisionItemId: input.revisionItemId,
      evidenceType: input.evidenceType,
      targetTable: input.targetTable,
      targetId: input.targetId,
      label: input.label ?? target.label,
      snippet: input.snippet ?? target.snippet,
      isRequired: input.isRequired ?? true,
      isSatisfied,
    },
  });

  await refreshRevisionReadiness(revision.id);
  await clearEvidenceReviewedAt(input.claimId);

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "EVIDENCE_LINK",
    payload: {
      revisionItemId: revision.id,
      evidenceType: input.evidenceType,
      targetTable: input.targetTable,
      targetId: input.targetId,
      linkId: link.id,
    },
  });

  return link;
}

export async function deleteEvidenceLink(input: {
  claimId: string;
  linkId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot remove evidence links.");

  const link = await prisma.evidenceLink.findFirst({
    where: { id: input.linkId, claimId: input.claimId },
  });
  if (!link) {
    throw new Error("Evidence link not found.");
  }

  await prisma.evidenceLink.delete({ where: { id: link.id } });
  await refreshRevisionReadiness(link.revisionItemId);
  await clearEvidenceReviewedAt(input.claimId);

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "EVIDENCE_UNLINK",
    payload: {
      revisionItemId: link.revisionItemId,
      linkId: link.id,
      evidenceType: link.evidenceType,
      targetTable: link.targetTable,
      targetId: link.targetId,
    },
  });
}

export async function overrideRevisionEvidence(input: {
  claimId: string;
  revisionId: string;
  overrideNote: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot override evidence.");

  const note = input.overrideNote.trim();
  if (!note) {
    throw new Error("Override note is required.");
  }

  const revision = await prisma.revisionItem.findFirst({
    where: { id: input.revisionId, claimId: input.claimId },
  });
  if (!revision) {
    throw new Error("Revision item not found.");
  }
  if (revision.status === IssueStatus.EXCLUDED) {
    throw new Error("Excluded revisions cannot be overridden for export.");
  }

  const updated = await prisma.revisionItem.update({
    where: { id: revision.id },
    data: {
      overrideById: input.actorId,
      overrideNote: note,
      overriddenAt: new Date(),
      readinessStatus: ReadinessStatus.READY_FOR_OUTPUT,
      exportEligible: true,
    },
  });

  await clearEvidenceReviewedAt(input.claimId);

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "OVERRIDE",
    payload: {
      revisionItemId: revision.id,
      overrideNote: note,
      table: "RevisionItem",
      field: "exportEligible",
    },
  });

  return updated;
}

export async function reviewClaimEvidence(input: {
  claimId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot review evidence.");

  const claim = await prisma.claim.findUnique({ where: { id: input.claimId } });
  if (!claim) {
    throw new Error("Claim not found.");
  }
  if (!claim.issuesReviewedAt) {
    throw new Error("Issues must be reviewed before evidence validation sign-off.");
  }

  await refreshClaimEvidence(input.claimId);

  const revisions = await prisma.revisionItem.findMany({
    where: { claimId: input.claimId },
    include: { evidenceLinks: true },
  });

  const evaluations = revisions.map((revision) =>
    evaluateRevisionReadiness(revision, revision.evidenceLinks),
  );

  const reviewCheck = canReviewEvidence({ revisions, evaluations });
  if (!reviewCheck.ok) {
    throw new Error(reviewCheck.blockers.join(" "));
  }

  const updated = await prisma.claim.update({
    where: { id: input.claimId },
    data: { evidenceReviewedAt: new Date() },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "EVIDENCE_REVIEW",
    payload: {
      revisionCount: revisions.length,
      evidenceReviewedAt: updated.evidenceReviewedAt?.toISOString(),
    },
  });

  return updated;
}

export async function getClaimEvidenceMatrix(claimId: string) {
  await refreshClaimEvidence(claimId);

  const [claim, revisions, sources] = await Promise.all([
    prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        customerName: true,
        issuesReviewedAt: true,
        evidenceReviewedAt: true,
        workflowStage: true,
      },
    }),
    prisma.revisionItem.findMany({
      where: { claimId },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
      include: {
        evidenceLinks: true,
        overrideBy: { select: { id: true, name: true, email: true } },
      },
    }),
    loadEvidenceSources(claimId),
  ]);

  if (!claim) {
    return null;
  }

  const rows = revisions.map((revision) => {
    const storedTypes = JSON.parse(revision.requiredEvidenceTypes) as string[];
    const requirementSpec = getCategoryEvidenceRequirements({
      category: revision.category,
      ruleId: revision.ruleId,
    });
    const evaluation = evaluateRevisionReadiness(revision, revision.evidenceLinks);

    return {
      ...revision,
      requiredEvidenceTypes: getEffectiveRequiredEvidenceTypes({
        category: revision.category,
        storedTypes,
        ruleId: revision.ruleId,
      }),
      requirementGroups: requirementSpec.groups,
      evaluation,
      linkedEvidence: revision.evidenceLinks,
    };
  });

  return { claim, rows, sources };
}

async function loadEvidenceSources(claimId: string) {
  const [
    documents,
    photos,
    extractions,
    lineItems,
    measurements,
    comparisons,
    calculations,
    rules,
  ] = await Promise.all([
    prisma.document.findMany({
      where: { claimId, deletedAt: null },
      select: { id: true, fileName: true, type: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.photo.findMany({
      where: { claimId },
      select: { id: true, fileName: true, caption: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.documentExtraction.findMany({
      where: { claimId, reviewStatus: { in: ["ACCEPTED", "EDITED"] } },
      select: { id: true, fieldName: true, fieldValue: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.estimateLineItem.findMany({
      where: { claimId, reviewStatus: { in: ["ACCEPTED", "EDITED"] } },
      select: { id: true, description: true, quantity: true, unit: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.measurementValue.findMany({
      where: { claimId, reviewStatus: { in: ["ACCEPTED", "EDITED"] } },
      select: { id: true, key: true, value: true, unit: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.comparisonResult.findMany({
      where: { claimId },
      select: {
        id: true,
        comparisonKey: true,
        formula: true,
        approvedQty: true,
        requestedQty: true,
        difference: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.calculation.findMany({
      where: { claimId },
      select: { id: true, calculatorType: true, formula: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rule.findMany({
      where: { active: true },
      select: { id: true, title: true, authorityType: true, citationText: true },
      orderBy: { title: "asc" },
      take: 100,
    }),
  ]);

  return {
    documents,
    photos,
    extractions,
    lineItems,
    measurements,
    comparisons,
    calculations,
    rules,
  };
}

export function formatRequirementGroups(groups: { length: number }[][] | string[][]): string {
  return (groups as string[][])
    .map((group) => group.join(" or "))
    .join(" + ");
}

export { flattenRequirementGroups, evaluateRevisionReadiness };
