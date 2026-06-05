import type { ComparisonResult, EstimateLineItem } from "@prisma/client";
import { ReviewStatus } from "@prisma/client";

import type { UsableMeasurementValue } from "@/lib/comparison/context";
import type { IssueDetectionContext } from "@/lib/issues/context";
import { runIssueDetectionEngine } from "@/lib/issues/engine";
import type { RevisionDraft } from "@/lib/issues/types";

import { FIXTURE_RULES } from "./rules";
import type {
  FixtureAssertionFailure,
  FixtureRunResult,
  GoldenClaimFixture,
} from "./types";

const QTY_EPSILON = 0.01;

function approxEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  return Math.abs(a - b) <= QTY_EPSILON;
}

export function buildContextFromGoldenFixture(fixture: GoldenClaimFixture): IssueDetectionContext {
  const lineItems: EstimateLineItem[] = fixture.lineItems
    .filter((line) => (line.reviewStatus ?? "ACCEPTED") !== "REJECTED" && (line.reviewStatus ?? "ACCEPTED") !== "PENDING")
    .map((line, index) => ({
      id: line.id ?? `line-${index}`,
      claimId: `fixture-${fixture.id}`,
      documentId: "doc-carrier",
      extractionId: null,
      description: line.description,
      originalDescription: null,
      quantity: line.quantity,
      originalQuantity: null,
      unit: line.unit,
      unitPrice: null,
      total: null,
      category: null,
      lineCode: null,
      sourcePage: 1,
      rawText: line.description,
      confidence: 1,
      reviewStatus: (line.reviewStatus ?? "ACCEPTED") as ReviewStatus,
      extractionMethod: "HEURISTIC",
      reviewedById: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

  const measurements: UsableMeasurementValue[] = fixture.measurements.map((m, index) => ({
    id: `mv-${m.key}-${index}`,
    reportId: "report-1",
    claimId: `fixture-${fixture.id}`,
    extractionId: null,
    key: m.key,
    value: m.value,
    originalValue: null,
    unit: m.unit,
    slope: null,
    sourcePage: 1,
    rawText: `${m.key}: ${m.value}`,
    confidence: 1,
    reviewStatus: ReviewStatus.ACCEPTED,
    extractionMethod: "HEURISTIC",
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
    report: { documentId: "doc-measurement" },
  }));

  const comparisons: ComparisonResult[] = fixture.comparisons.map((c, index) => ({
    id: `cmp-${fixture.id}-${c.comparisonKey}-${index}`,
    claimId: `fixture-${fixture.id}`,
    comparisonKey: c.comparisonKey,
    approvedQty: c.approvedQty,
    requestedQty: c.requestedQty,
    difference: c.difference,
    pctDifference: c.requestedQty === 0 ? null : (c.difference / c.requestedQty) * 100,
    formula: c.formula,
    physicallySufficient: c.physicallySufficient,
    explanation: c.explanation,
    sourceDocumentIds: "[]",
    carrierLineItemId: c.carrierLineItemId ?? null,
    measurementValueIds: "[]",
    isWarning: c.isWarning ?? false,
    unit: c.unit,
    createdAt: new Date(),
  }));

  return {
    claim: {
      id: `fixture-${fixture.id}`,
      manufacturerSystem: fixture.claim.manufacturerSystem ?? null,
      comparisonReviewedAt: new Date(),
    },
    lineItems,
    measurements,
    comparisons,
    rules: FIXTURE_RULES,
  };
}

export function runGoldenFixture(fixture: GoldenClaimFixture): {
  drafts: RevisionDraft[];
  result: FixtureRunResult;
} {
  const ctx = buildContextFromGoldenFixture(fixture);
  const drafts = runIssueDetectionEngine(ctx);
  const result = assertGoldenFixture(fixture, drafts);
  return { drafts, result };
}

export function assertGoldenFixture(
  fixture: GoldenClaimFixture,
  actual: RevisionDraft[],
): FixtureRunResult {
  const failures: FixtureAssertionFailure[] = [];
  let passed = 0;
  let total = 0;

  const actualByKey = new Map(actual.map((d) => [d.detectionKey, d]));
  const keys = actual.map((d) => d.detectionKey);
  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== keys.length) {
    failures.push({
      fixtureId: fixture.id,
      type: "duplicate_detection_key",
      message: "Duplicate detectionKey values in engine output.",
    });
  }

  if (fixture.maxRevisionCount != null && actual.length !== fixture.maxRevisionCount) {
    failures.push({
      fixtureId: fixture.id,
      type: "revision_count_mismatch",
      message: `Expected ${fixture.maxRevisionCount} revisions, got ${actual.length}.`,
    });
  }

  for (const expected of fixture.expectedRevisions) {
    total += 1;
    const row = actualByKey.get(expected.detectionKey);
    if (!row) {
      failures.push({
        fixtureId: fixture.id,
        type: "missing_expected",
        detectionKey: expected.detectionKey,
        message: `Expected revision ${expected.detectionKey} was not created.`,
      });
      continue;
    }

    let ok = true;
    if (row.category !== expected.category) {
      ok = false;
      failures.push({
        fixtureId: fixture.id,
        type: "category_mismatch",
        detectionKey: expected.detectionKey,
        message: `Category ${row.category} !== expected ${expected.category}.`,
      });
    }
    if (!approxEqual(row.carrierApprovedQty, expected.carrierApprovedQty)) {
      ok = false;
      failures.push({
        fixtureId: fixture.id,
        type: "quantity_drift",
        detectionKey: expected.detectionKey,
        message: `carrierApprovedQty ${row.carrierApprovedQty} !== ${expected.carrierApprovedQty}.`,
      });
    }
    if (!approxEqual(row.requestedQty, expected.requestedQty)) {
      ok = false;
      failures.push({
        fixtureId: fixture.id,
        type: "quantity_drift",
        detectionKey: expected.detectionKey,
        message: `requestedQty ${row.requestedQty} !== ${expected.requestedQty}.`,
      });
    }
    if (
      expected.qtyDifference !== undefined &&
      !approxEqual(row.qtyDifference, expected.qtyDifference)
    ) {
      ok = false;
      failures.push({
        fixtureId: fixture.id,
        type: "quantity_drift",
        detectionKey: expected.detectionKey,
        message: `qtyDifference ${row.qtyDifference} !== ${expected.qtyDifference}.`,
      });
    }
    if (expected.requiresComparisonResultId && !row.comparisonResultId) {
      ok = false;
      failures.push({
        fixtureId: fixture.id,
        type: "missing_expected",
        detectionKey: expected.detectionKey,
        message: "Expected comparisonResultId to be set.",
      });
    }
    if (expected.requiresRuleId && !row.ruleId) {
      ok = false;
      failures.push({
        fixtureId: fixture.id,
        type: "missing_expected",
        detectionKey: expected.detectionKey,
        message: "Expected ruleId to be set.",
      });
    }
    const evidenceMatch =
      JSON.stringify([...row.requiredEvidenceTypes].sort()) ===
      JSON.stringify([...expected.requiredEvidenceTypes].sort());
    if (!evidenceMatch) {
      ok = false;
      failures.push({
        fixtureId: fixture.id,
        type: "evidence_types_mismatch",
        detectionKey: expected.detectionKey,
        message: `requiredEvidenceTypes mismatch.`,
      });
    }
    if (row.exportEligible !== expected.exportEligible) {
      ok = false;
      failures.push({
        fixtureId: fixture.id,
        type: "export_eligible_mismatch",
        detectionKey: expected.detectionKey,
        message: `exportEligible ${row.exportEligible} !== ${expected.exportEligible}.`,
      });
    }
    if (ok) {
      passed += 1;
    }
  }

  const expectedKeys = new Set(fixture.expectedRevisions.map((e) => e.detectionKey));
  for (const draft of actual) {
    if (!expectedKeys.has(draft.detectionKey)) {
      total += 1;
      failures.push({
        fixtureId: fixture.id,
        type: "unexpected_revision",
        detectionKey: draft.detectionKey,
        message: `Unexpected revision ${draft.detectionKey} created.`,
      });
    }
  }

  for (const forbidden of fixture.forbiddenDetectionKeys ?? []) {
    total += 1;
    if (actualByKey.has(forbidden)) {
      failures.push({
        fixtureId: fixture.id,
        type: "forbidden_detection_key",
        detectionKey: forbidden,
        message: `Forbidden detectionKey ${forbidden} was created.`,
      });
    } else {
      passed += 1;
    }
  }

  for (const pattern of fixture.forbiddenTitlePatterns ?? []) {
    total += 1;
    const regex = new RegExp(pattern, "i");
    const hit = actual.find(
      (d) => regex.test(d.title) || regex.test(d.requestedLineItem ?? ""),
    );
    if (hit) {
      failures.push({
        fixtureId: fixture.id,
        type: "forbidden_title",
        detectionKey: hit.detectionKey,
        message: `Forbidden title pattern /${pattern}/ matched "${hit.title}".`,
      });
    } else {
      passed += 1;
    }
  }

  const accuracy = total > 0 ? passed / total : 1;
  return {
    fixtureId: fixture.id,
    passed,
    total,
    accuracy,
    failures,
    actualDetectionKeys: keys,
  };
}

/** Verify rejected/pending lines never enter fixture context used by engine. */
export function assertRejectedPendingExcluded(fixture: GoldenClaimFixture): boolean {
  const withRejected = {
    ...fixture,
    lineItems: [
      ...fixture.lineItems,
      {
        description: "Rejected shingle",
        quantity: 999,
        unit: "SQ",
        reviewStatus: "REJECTED" as const,
      },
      {
        description: "Pending drip edge",
        quantity: 50,
        unit: "LF",
        reviewStatus: "PENDING" as const,
      },
    ],
  };
  const ctx = buildContextFromGoldenFixture(withRejected);
  return (
    !ctx.lineItems.some((l) => l.description.includes("Rejected")) &&
    !ctx.lineItems.some((l) => l.description.includes("Pending"))
  );
}
