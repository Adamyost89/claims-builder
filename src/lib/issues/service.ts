import { IssueStatus, ReadinessStatus, UserRole } from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { clearEvidenceReviewedAt, refreshClaimEvidence } from "@/lib/evidence/service";
import { prisma } from "@/lib/db";
import { evaluateActiveRules } from "@/lib/rules/engine";
import { assertPermission, canEditClaims } from "@/lib/rbac";

import { buildIssueDetectionContext } from "./context";
import { runIssueDetectionEngine } from "./engine";
import { SOURCE_DETECTION_TYPES } from "./types";

function draftRevisionFilter() {
  return {
    sourceDetectionType: { not: null },
    status: IssueStatus.DRAFT,
  };
}

export async function runClaimIssueDetection(input: {
  claimId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot run issue detection.");

  const ctx = await buildIssueDetectionContext(input.claimId);
  if (!ctx) {
    throw new Error("Claim not found.");
  }

  if (!ctx.claim.comparisonReviewedAt) {
    throw new Error("Measurement comparison must be reviewed before issue detection.");
  }

  const drafts = runIssueDetectionEngine(ctx);
  const ruleEvaluations = evaluateActiveRules(ctx);

  await prisma.$transaction([
    prisma.revisionItem.deleteMany({
      where: { claimId: input.claimId, ...draftRevisionFilter() },
    }),
    prisma.claim.update({
      where: { id: input.claimId },
      data: { issuesReviewedAt: null, evidenceReviewedAt: null },
    }),
  ]);

  const created = await prisma.$transaction(
    drafts.map((draft) =>
      prisma.revisionItem.create({
        data: {
          claimId: input.claimId,
          detectionKey: draft.detectionKey,
          title: draft.title,
          category: draft.category,
          carrierApprovedLineItem: draft.carrierApprovedLineItem,
          carrierApprovedQty: draft.carrierApprovedQty,
          carrierApprovedUnit: draft.carrierApprovedUnit,
          requestedLineItem: draft.requestedLineItem,
          requestedQty: draft.requestedQty,
          requestedUnit: draft.requestedUnit,
          qtyDifference: draft.qtyDifference,
          calculationMethod: draft.calculationMethod,
          basis: draft.basis,
          revisionRequired: draft.revisionRequired,
          status: draft.status,
          readinessStatus: draft.readinessStatus,
          exportEligible: draft.exportEligible,
          requiredEvidenceTypes: JSON.stringify(draft.requiredEvidenceTypes),
          comparisonResultId: draft.comparisonResultId,
          ruleId: draft.ruleId,
          sourceDetectionType: draft.sourceDetectionType,
        },
      }),
    ),
  );

  for (const evaluation of ruleEvaluations.filter((e) => e.triggered)) {
    await prisma.ruleEvaluation.create({
      data: {
        claimId: input.claimId,
        ruleId: evaluation.ruleId,
        triggered: true,
        confidence: 1,
        resultJson: JSON.stringify({ reason: evaluation.reason }),
      },
    });
  }

  await refreshClaimEvidence(input.claimId);

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "ISSUE_DETECTION_RUN",
    payload: {
      revisionCount: created.length,
      ruleEvaluations: ruleEvaluations.filter((e) => e.triggered).length,
      replacedDraftItems: true,
    },
  });

  return { revisions: created, ruleEvaluations };
}

export async function reviewClaimIssues(input: {
  claimId: string;
  actorId: string;
  actorRole: UserRole;
  noIssuesFound?: boolean;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot review issues.");

  const claim = await prisma.claim.findUnique({ where: { id: input.claimId } });
  if (!claim) {
    throw new Error("Claim not found.");
  }

  const revisionCount = await prisma.revisionItem.count({ where: { claimId: input.claimId } });

  if (revisionCount === 0) {
    if (!input.noIssuesFound) {
      throw new Error(
        "No revision items exist. Confirm 'No issues found' to sign off an empty detection run.",
      );
    }
    await logClaimEvent({
      claimId: input.claimId,
      actorId: input.actorId,
      eventType: "NO_ISSUES_FOUND",
      payload: { explicit: true },
    });
  }

  const updated = await prisma.claim.update({
    where: { id: input.claimId },
    data: { issuesReviewedAt: new Date() },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "ISSUE_REVIEW",
    payload: {
      revisionCount,
      noIssuesFound: revisionCount === 0,
      issuesReviewedAt: updated.issuesReviewedAt?.toISOString(),
    },
  });

  return updated;
}

export async function updateRevisionItem(input: {
  claimId: string;
  revisionId: string;
  actorId: string;
  actorRole: UserRole;
  action: "include" | "exclude" | "needs_evidence" | "edit";
  excludedReason?: string;
  title?: string;
  revisionRequired?: string;
  basis?: string;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot update revision items.");

  const revision = await prisma.revisionItem.findFirst({
    where: { id: input.revisionId, claimId: input.claimId },
  });
  if (!revision) {
    throw new Error("Revision item not found.");
  }

  if (input.action === "include") {
    await clearEvidenceReviewedAt(input.claimId);
    await prisma.revisionItem.update({
      where: { id: revision.id },
      data: {
        status: IssueStatus.READY_FOR_OUTPUT,
        excludedReason: null,
        overrideById: null,
        overrideNote: null,
        overriddenAt: null,
      },
    });
    await refreshClaimEvidence(input.claimId);
    return prisma.revisionItem.findUniqueOrThrow({ where: { id: revision.id } });
  }

  if (input.action === "exclude") {
    await clearEvidenceReviewedAt(input.claimId);
    await prisma.revisionItem.update({
      where: { id: revision.id },
      data: {
        status: IssueStatus.EXCLUDED,
        readinessStatus: ReadinessStatus.EXCLUDED,
        exportEligible: false,
        excludedReason: input.excludedReason ?? "Excluded by reviewer",
        overrideById: null,
        overrideNote: null,
        overriddenAt: null,
      },
    });
    return prisma.revisionItem.findUniqueOrThrow({ where: { id: revision.id } });
  }

  if (input.action === "needs_evidence") {
    await clearEvidenceReviewedAt(input.claimId);
    await prisma.revisionItem.update({
      where: { id: revision.id },
      data: {
        status: IssueStatus.NEEDS_EVIDENCE,
        overrideById: null,
        overrideNote: null,
        overriddenAt: null,
      },
    });
    await refreshClaimEvidence(input.claimId);
    return prisma.revisionItem.findUniqueOrThrow({ where: { id: revision.id } });
  }

  const updates: {
    title?: string;
    revisionRequired?: string;
    basis?: string;
  } = {};
  if (input.title !== undefined) {
    updates.title = input.title;
  }
  if (input.revisionRequired !== undefined) {
    updates.revisionRequired = input.revisionRequired;
  }
  if (input.basis !== undefined) {
    updates.basis = input.basis;
  }

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "MANUAL_EDIT",
    payload: {
      table: "RevisionItem",
      rowId: revision.id,
      before: {
        title: revision.title,
        revisionRequired: revision.revisionRequired,
        basis: revision.basis,
      },
      after: updates,
    },
  });

  await clearEvidenceReviewedAt(input.claimId);

  const updated = await prisma.revisionItem.update({
    where: { id: revision.id },
    data: {
      ...updates,
      sourceDetectionType: SOURCE_DETECTION_TYPES.MANUAL,
    },
  });

  await refreshClaimEvidence(input.claimId);
  return updated;
}

export async function getClaimIssues(claimId: string) {
  const [claim, revisions, comparisons, rules] = await Promise.all([
    prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        customerName: true,
        comparisonReviewedAt: true,
        issuesReviewedAt: true,
        manufacturerSystem: true,
        workflowStage: true,
      },
    }),
    prisma.revisionItem.findMany({
      where: { claimId },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
      include: { rule: { select: { id: true, title: true, authorityType: true } } },
    }),
    prisma.comparisonResult.findMany({ where: { claimId } }),
    prisma.ruleEvaluation.findMany({
      where: { claimId, triggered: true },
      include: { rule: { select: { id: true, title: true } } },
      orderBy: { evaluatedAt: "desc" },
      take: 20,
    }),
  ]);

  if (!claim) {
    return null;
  }

  const comparisonById = new Map(comparisons.map((c) => [c.id, c]));

  const enriched = revisions.map((revision) => ({
    ...revision,
    requiredEvidenceTypes: JSON.parse(revision.requiredEvidenceTypes) as string[],
    comparison: revision.comparisonResultId
      ? comparisonById.get(revision.comparisonResultId) ?? null
      : null,
  }));

  return { claim, revisions: enriched, ruleEvaluations: rules };
}
