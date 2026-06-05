import type { IssueCategory } from "@prisma/client";

export type FixtureFixtureGroup =
  | "hard-rule"
  | "omitted"
  | "quantity-deficiency"
  | "zero-issue"
  | "installation-insufficiency"
  | "estimate-inconsistency"
  | "no-rake-starter";

export type FixtureLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  reviewStatus?: "ACCEPTED" | "EDITED" | "REJECTED" | "PENDING";
};

export type FixtureMeasurement = {
  key: string;
  value: number;
  unit: string;
};

export type FixtureComparison = {
  comparisonKey: string;
  approvedQty: number;
  requestedQty: number;
  difference: number;
  formula: string;
  physicallySufficient: boolean;
  explanation: string;
  unit: string;
  isWarning?: boolean;
  carrierLineItemId?: string;
};

export type ExpectedRevisionFixture = {
  detectionKey: string;
  category: IssueCategory;
  carrierApprovedQty?: number | null;
  requestedQty?: number | null;
  qtyDifference?: number | null;
  requiresComparisonResultId?: boolean;
  requiresRuleId?: boolean;
  requiredEvidenceTypes: string[];
  exportEligible: boolean;
};

export type GoldenClaimFixture = {
  id: string;
  name: string;
  fixtureGroup: FixtureFixtureGroup;
  claim: {
    manufacturerSystem?: string | null;
  };
  lineItems: FixtureLineItem[];
  measurements: FixtureMeasurement[];
  comparisons: FixtureComparison[];
  expectedRevisions: ExpectedRevisionFixture[];
  forbiddenDetectionKeys?: string[];
  forbiddenTitlePatterns?: string[];
  maxRevisionCount?: number;
};

export type FixtureAssertionFailure = {
  fixtureId: string;
  type:
    | "missing_expected"
    | "unexpected_revision"
    | "quantity_drift"
    | "category_mismatch"
    | "duplicate_detection_key"
    | "forbidden_detection_key"
    | "forbidden_title"
    | "revision_count_mismatch"
    | "evidence_types_mismatch"
    | "export_eligible_mismatch";
  message: string;
  detectionKey?: string;
};

export type FixtureRunResult = {
  fixtureId: string;
  passed: number;
  total: number;
  accuracy: number;
  failures: FixtureAssertionFailure[];
  actualDetectionKeys: string[];
};
