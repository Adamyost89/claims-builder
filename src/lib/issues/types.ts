import type { IssueCategory, IssueStatus, ReadinessStatus } from "@prisma/client";

export const SOURCE_DETECTION_TYPES = {
  HARD_RULE: "HARD_RULE",
  COMPARISON: "COMPARISON",
  RULE_ENGINE: "RULE_ENGINE",
  MANUAL: "MANUAL",
} as const;

export type SourceDetectionType =
  (typeof SOURCE_DETECTION_TYPES)[keyof typeof SOURCE_DETECTION_TYPES];

export type RevisionDraft = {
  detectionKey: string;
  title: string;
  category: IssueCategory;
  carrierApprovedLineItem?: string | null;
  carrierApprovedQty?: number | null;
  carrierApprovedUnit?: string | null;
  requestedLineItem?: string | null;
  requestedQty?: number | null;
  requestedUnit?: string | null;
  qtyDifference?: number | null;
  calculationMethod?: string | null;
  basis?: string | null;
  revisionRequired?: string | null;
  status: IssueStatus;
  readinessStatus: ReadinessStatus;
  exportEligible: boolean;
  requiredEvidenceTypes: string[];
  comparisonResultId?: string | null;
  ruleId?: string | null;
  sourceDetectionType: SourceDetectionType;
};
