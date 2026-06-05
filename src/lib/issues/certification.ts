import { prisma } from "@/lib/db";

import { GOLDEN_CLAIM_FIXTURES } from "./fixtures/golden";
import { runGoldenFixture } from "./fixtures/runner";
import type { FixtureAssertionFailure, FixtureRunResult } from "./fixtures/types";

export const ISSUE_DETECTION_CERT_VERSION = "1.0.0";

/** Phase 4b requires 100% accuracy on all golden fixture assertions. */
export const ISSUE_DETECTION_REQUIRED_ACCURACY = 1;

export type IssueDetectionCertificationResult = {
  version: string;
  requiredAccuracy: number;
  fixtureAccuracy: number;
  certified: boolean;
  passed: number;
  total: number;
  fixtureResults: FixtureRunResult[];
  failures: FixtureAssertionFailure[];
};

export function evaluateIssueDetectionCertified(
  fixtureAccuracy: number | null | undefined,
): boolean {
  if (fixtureAccuracy == null) {
    return false;
  }
  return fixtureAccuracy >= ISSUE_DETECTION_REQUIRED_ACCURACY;
}

export function runIssueDetectionFixtureSuite() {
  const fixtureResults: FixtureRunResult[] = [];
  const failures: FixtureAssertionFailure[] = [];

  for (const fixture of GOLDEN_CLAIM_FIXTURES) {
    const { result } = runGoldenFixture(fixture);
    fixtureResults.push(result);
    failures.push(...result.failures);
  }

  const passed = fixtureResults.reduce((sum, r) => sum + r.passed, 0);
  const total = fixtureResults.reduce((sum, r) => sum + r.total, 0);
  const fixtureAccuracy = total > 0 ? passed / total : 0;
  const certified = evaluateIssueDetectionCertified(fixtureAccuracy);

  return {
    version: ISSUE_DETECTION_CERT_VERSION,
    requiredAccuracy: ISSUE_DETECTION_REQUIRED_ACCURACY,
    fixtureAccuracy,
    certified,
    passed,
    total,
    fixtureResults,
    failures,
  } satisfies IssueDetectionCertificationResult;
}

export async function getIssueDetectionCertification() {
  return prisma.issueDetectionCertification.findUnique({ where: { id: "default" } });
}

export async function isIssueDetectionCertified(): Promise<boolean> {
  const record = await getIssueDetectionCertification();
  return record?.certified ?? false;
}

export async function updateIssueDetectionCertification(
  result: IssueDetectionCertificationResult,
) {
  return prisma.issueDetectionCertification.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      version: result.version,
      requiredAccuracy: result.requiredAccuracy,
      fixtureAccuracy: result.fixtureAccuracy,
      certified: result.certified,
      certifiedAt: result.certified ? new Date() : null,
      lastRunAt: new Date(),
      failuresJson: result.failures.length > 0 ? JSON.stringify(result.failures) : null,
    },
    update: {
      version: result.version,
      fixtureAccuracy: result.fixtureAccuracy,
      certified: result.certified,
      certifiedAt: result.certified ? new Date() : null,
      lastRunAt: new Date(),
      failuresJson: result.failures.length > 0 ? JSON.stringify(result.failures) : null,
    },
  });
}

export async function certifyIssueDetectionFromFixtures() {
  const result = runIssueDetectionFixtureSuite();
  await updateIssueDetectionCertification(result);
  return result;
}
