import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  certifyIssueDetectionFromFixtures,
  evaluateIssueDetectionCertified,
  ISSUE_DETECTION_REQUIRED_ACCURACY,
  runIssueDetectionFixtureSuite,
} from "@/lib/issues/certification";
import {
  evaluateProductionReadiness,
  syncOrgProductionReadyFlag,
} from "@/lib/production/readiness";

describe("issue detection certification", () => {
  beforeAll(async () => {
    await prisma.issueDetectionCertification.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        version: "1.0.0",
        requiredAccuracy: 1,
        certified: false,
      },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.issueDetectionCertification.update({
      where: { id: "default" },
      data: { certified: false, fixtureAccuracy: null, failuresJson: null },
    });
    await prisma.parserCertification.updateMany({
      data: { parserCertified: false, fixtureAccuracy: null },
    });
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: { productionReady: false, productionOverrideAt: null, productionOverrideBy: null },
    });
    await prisma.$disconnect();
  });

  it("requires 100% fixture accuracy", () => {
    expect(ISSUE_DETECTION_REQUIRED_ACCURACY).toBe(1);
    expect(evaluateIssueDetectionCertified(0.99)).toBe(false);
    expect(evaluateIssueDetectionCertified(1)).toBe(true);
  });

  it("passes certification when all golden fixtures pass", async () => {
    const suite = runIssueDetectionFixtureSuite();
    expect(suite.certified).toBe(true);
    expect(suite.fixtureAccuracy).toBe(1);
    expect(suite.failures).toHaveLength(0);

    const record = await certifyIssueDetectionFromFixtures();
    expect(record.certified).toBe(true);

    const stored = await prisma.issueDetectionCertification.findUnique({
      where: { id: "default" },
    });
    expect(stored?.certified).toBe(true);
    expect(stored?.fixtureAccuracy).toBe(1);
  });

  it("fails certification when an expected revision is missing", () => {
    const suite = runIssueDetectionFixtureSuite();
    const tampered = {
      ...suite,
      passed: suite.passed - 1,
      total: suite.total,
      fixtureAccuracy: (suite.passed - 1) / suite.total,
      certified: false,
      failures: [
        ...suite.failures,
        {
          fixtureId: "tampered",
          type: "missing_expected" as const,
          message: "simulated missing issue",
        },
      ],
    };
    expect(evaluateIssueDetectionCertified(tampered.fixtureAccuracy)).toBe(false);
  });

  it("keeps productionReady false when detection is uncertified", async () => {
    await prisma.issueDetectionCertification.update({
      where: { id: "default" },
      data: { certified: false, fixtureAccuracy: 0.5 },
    });
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: {
        productionReady: true,
        productionOverrideAt: null,
        dryRunsReviewedCount: 0,
        dryRunsRequired: 10,
      },
    });

    const status = await evaluateProductionReadiness();
    expect(status.productionReady).toBe(false);
    expect(status.issueDetectionCertified).toBe(false);

    await syncOrgProductionReadyFlag();
    const settings = await prisma.orgSettings.findUnique({ where: { id: "default" } });
    expect(settings?.productionReady).toBe(false);
  });

  it("allows productionReady only when parsers, issues, and dry-runs are satisfied", async () => {
    await certifyIssueDetectionFromFixtures();

    await prisma.parserCertification.updateMany({
      data: { parserCertified: true, fixtureAccuracy: 1 },
    });
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: {
        dryRunsReviewedCount: 10,
        dryRunsRequired: 10,
        productionOverrideAt: null,
      },
    });

    const status = await evaluateProductionReadiness();
    expect(status.parsersCertified).toBe(true);
    expect(status.issueDetectionCertified).toBe(true);
    expect(status.dryRunsSatisfied).toBe(true);
    expect(status.productionReady).toBe(true);

    await syncOrgProductionReadyFlag();
    const settings = await prisma.orgSettings.findUnique({ where: { id: "default" } });
    expect(settings?.productionReady).toBe(true);
  });
});
