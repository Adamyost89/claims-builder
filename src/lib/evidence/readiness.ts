import type { EvidenceLink, RevisionItem } from "@prisma/client";
import { IssueStatus, ReadinessStatus } from "@prisma/client";

import { getCategoryEvidenceRequirements } from "./requirements";

export type ReadinessEvaluation = {
  readinessStatus: ReadinessStatus;
  exportEligible: boolean;
  satisfiedGroups: number;
  totalGroups: number;
  satisfiedTypes: string[];
  isOverridden: boolean;
};

export function evaluateRevisionReadiness(
  revision: RevisionItem,
  links: EvidenceLink[],
): ReadinessEvaluation {
  if (
    revision.status === IssueStatus.EXCLUDED ||
    revision.readinessStatus === ReadinessStatus.EXCLUDED
  ) {
    return {
      readinessStatus: ReadinessStatus.EXCLUDED,
      exportEligible: false,
      satisfiedGroups: 0,
      totalGroups: 0,
      satisfiedTypes: [],
      isOverridden: false,
    };
  }

  const isOverridden = Boolean(revision.overrideById && revision.overriddenAt);
  if (isOverridden) {
    return {
      readinessStatus: ReadinessStatus.READY_FOR_OUTPUT,
      exportEligible: true,
      satisfiedGroups: 0,
      totalGroups: 0,
      satisfiedTypes: [],
      isOverridden: true,
    };
  }

  const spec = getCategoryEvidenceRequirements({
    category: revision.category,
    ruleId: revision.ruleId,
  });

  const satisfiedTypes = new Set(
    links.filter((link) => link.isSatisfied).map((link) => link.evidenceType),
  );

  let satisfiedGroups = 0;
  for (const group of spec.groups) {
    if (group.some((type) => satisfiedTypes.has(type))) {
      satisfiedGroups += 1;
    }
  }

  const totalGroups = spec.groups.length;

  if (satisfiedGroups === 0) {
    return {
      readinessStatus: ReadinessStatus.NEEDS_EVIDENCE,
      exportEligible: false,
      satisfiedGroups,
      totalGroups,
      satisfiedTypes: [...satisfiedTypes],
      isOverridden: false,
    };
  }

  if (satisfiedGroups < totalGroups) {
    return {
      readinessStatus: ReadinessStatus.PARTIALLY_READY,
      exportEligible: false,
      satisfiedGroups,
      totalGroups,
      satisfiedTypes: [...satisfiedTypes],
      isOverridden: false,
    };
  }

  return {
    readinessStatus: ReadinessStatus.READY_FOR_OUTPUT,
    exportEligible: true,
      satisfiedGroups,
      totalGroups,
      satisfiedTypes: [...satisfiedTypes],
      isOverridden: false,
  };
}

export function canReviewEvidence(input: {
  revisions: RevisionItem[];
  evaluations: ReadinessEvaluation[];
}): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];

  for (let index = 0; index < input.revisions.length; index += 1) {
    const revision = input.revisions[index];
    if (
      revision.status === IssueStatus.EXCLUDED ||
      revision.readinessStatus === ReadinessStatus.EXCLUDED
    ) {
      continue;
    }

    const evaluation = input.evaluations[index];
    if (!evaluation) {
      continue;
    }

    const ready =
      evaluation.isOverridden ||
      evaluation.readinessStatus === ReadinessStatus.READY_FOR_OUTPUT;

    if (!ready) {
      blockers.push(
        `Revision "${revision.title}" is ${evaluation.readinessStatus} and requires evidence or override.`,
      );
    }
  }

  return { ok: blockers.length === 0, blockers };
}
