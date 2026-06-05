import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ClaimType,
  OutputMode,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { exportApprovedOutput } from "@/lib/export/service";
import { evaluateExportGate } from "@/lib/export/gate";
import {
  evaluateProductionReadiness,
  refreshProductionReadiness,
} from "@/lib/production/readiness";
import {
  reviewDryRunClaim,
  setProductionOverride,
} from "@/lib/production/service";
import { PermissionDeniedError } from "@/lib/rbac";

describe("production readiness phase 8", () => {
  let adminId: string;
  let managerId: string;
  let claimId: string;
  let outputId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `admin-prod-${Date.now()}@example.com`,
        name: "Admin",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.ADMIN,
      },
    });
    adminId = admin.id;

    const manager = await prisma.user.create({
      data: {
        email: `mgr-prod-${Date.now()}@example.com`,
        name: "Manager",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.MANAGER,
      },
    });
    managerId = manager.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Prod Customer",
        propertyAddress: "1 Prod St",
        carrier: "Carrier",
        claimNumber: `PROD-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: adminId,
        isDryRun: true,
        evidenceReviewedAt: new Date(),
      },
    });
    claimId = claim.id;

    const output = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "APPROVED",
        version: 1,
        contentJson: JSON.stringify({
          outputMode: "FULL_SUPPLEMENT",
          title: "Supplement",
          sections: [],
          excludedRevisions: [],
          unsupportedClaims: [],
          toneLintPassed: true,
          warnings: [],
        }),
        contentText: "Locked supplement content",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
    outputId = output.id;

    await prisma.orgSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        dryRunsRequired: 3,
        dryRunsReviewedCount: 0,
        productionReady: false,
      },
      update: {
        dryRunsRequired: 3,
        dryRunsReviewedCount: 0,
        productionOverrideAt: null,
        productionOverrideBy: null,
        productionOverrideNote: null,
        productionReady: false,
      },
    });
    await prisma.parserCertification.updateMany({
      data: { parserCertified: false, fixtureAccuracy: 0 },
    });
    await prisma.issueDetectionCertification.upsert({
      where: { id: "default" },
      create: { id: "default", certified: false, fixtureAccuracy: 0 },
      update: { certified: false, fixtureAccuracy: 0 },
    });
  });

  afterAll(async () => {
    await prisma.generatedOutput.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId] } } });
    await prisma.parserCertification.updateMany({ data: { parserCertified: true } });
    await prisma.issueDetectionCertification.update({
      where: { id: "default" },
      data: { certified: true, fixtureAccuracy: 1 },
    });
    await prisma.$disconnect();
  });

  it("productionReady false when parser certification missing", async () => {
    const status = await evaluateProductionReadiness();
    expect(status.parsersCertified).toBe(false);
    expect(status.productionReady).toBe(false);
  });

  it("productionReady false when issue detection certification missing", async () => {
    const status = await evaluateProductionReadiness();
    expect(status.issueDetectionCertified).toBe(false);
    expect(status.productionReady).toBe(false);
  });

  it("productionReady false when dry-run count is too low", async () => {
    const status = await evaluateProductionReadiness();
    expect(status.dryRunsSatisfied).toBe(false);
    expect(status.productionReady).toBe(false);
  });

  it("productionReady true when all requirements pass", async () => {
    await prisma.parserCertification.updateMany({
      data: { parserCertified: true, fixtureAccuracy: 1 },
    });
    await prisma.issueDetectionCertification.update({
      where: { id: "default" },
      data: { certified: true, fixtureAccuracy: 1 },
    });
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: { dryRunsReviewedCount: 3 },
    });

    const status = await refreshProductionReadiness();
    expect(status.productionReady).toBe(true);

    const settings = await prisma.orgSettings.findUnique({ where: { id: "default" } });
    expect(settings?.productionReady).toBe(true);
  });

  it("admin override allows carrier-ready export but productionReady remains false", async () => {
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: {
        productionReady: false,
        dryRunsReviewedCount: 0,
        productionOverrideAt: null,
      },
    });
    await prisma.parserCertification.updateMany({ data: { parserCertified: false } });
    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: false },
    });

    await setProductionOverride({
      actorId: adminId,
      actorRole: UserRole.ADMIN,
      overrideNote: "Documented pilot export approval",
    });

    const status = await evaluateProductionReadiness();
    expect(status.hasAdminOverride).toBe(true);
    expect(status.productionReady).toBe(false);

    const output = await prisma.generatedOutput.findUniqueOrThrow({ where: { id: outputId } });
    const gate = await evaluateExportGate({
      output,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(true);
  });

  it("manager cannot set production override", async () => {
    await expect(
      setProductionOverride({
        actorId: managerId,
        actorRole: UserRole.MANAGER,
        overrideNote: "Should fail",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("admin override requires note", async () => {
    await expect(
      setProductionOverride({
        actorId: adminId,
        actorRole: UserRole.ADMIN,
        overrideNote: "   ",
      }),
    ).rejects.toThrow(/override note is required/i);
  });

  it("dry-run review increments count once", async () => {
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: { dryRunsReviewedCount: 0 },
    });
    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: true, dryRunReviewedAt: null, dryRunReviewedById: null },
    });
    await prisma.generatedOutput.update({
      where: { id: outputId },
      data: {
        status: "EXPORTED",
        exportedAt: new Date(),
        exportedById: managerId,
        exportFormat: "clipboard",
      },
    });

    await reviewDryRunClaim({
      claimId,
      actorId: managerId,
      actorRole: UserRole.MANAGER,
    });

    const settings = await prisma.orgSettings.findUnique({ where: { id: "default" } });
    expect(settings?.dryRunsReviewedCount).toBe(1);
  });

  it("dry-run review cannot double-count same claim", async () => {
    await expect(
      reviewDryRunClaim({
        claimId,
        actorId: managerId,
        actorRole: UserRole.MANAGER,
      }),
    ).rejects.toThrow(/already been reviewed/i);
  });

  it("dry-run review logs DRY_RUN_REVIEW", async () => {
    const event = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "DRY_RUN_REVIEW" },
    });
    expect(event).toBeTruthy();
  });

  it("export marks output exported without changing content", async () => {
    const freshOutput = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.INTERNAL_AUDIT,
        status: "APPROVED",
        version: 2,
        contentJson: JSON.stringify({
          outputMode: "INTERNAL_AUDIT",
          title: "Internal audit",
          sections: [],
          excludedRevisions: [],
          unsupportedClaims: [],
          toneLintPassed: true,
          warnings: [],
        }),
        contentText: "Immutable export text",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });

    await exportApprovedOutput({
      claimId,
      outputId: freshOutput.id,
      format: "clipboard",
      actorId: adminId,
      actorRole: UserRole.ADMIN,
    });

    const exported = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: freshOutput.id },
    });
    expect(exported.status).toBe("EXPORTED");
    expect(exported.contentText).toBe("Immutable export text");
    expect(exported.exportedAt).toBeTruthy();
    expect(exported.exportedById).toBe(adminId);
    expect(exported.exportFormat).toBe("clipboard");
  });

  it("export history shows export metadata via prisma include", async () => {
    const row = await prisma.generatedOutput.findFirst({
      where: { claimId, status: "EXPORTED", exportedById: adminId },
      include: { exportedBy: { select: { email: true } } },
      orderBy: { version: "desc" },
    });
    expect(row?.exportedAt).toBeTruthy();
    expect(row?.exportFormat).toBeTruthy();
    expect(row?.exportedBy?.email).toBeTruthy();
  });

  it("carrier export blocked with detailed blocker list when production not ready", async () => {
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: {
        productionOverrideAt: null,
        productionOverrideBy: null,
        dryRunsReviewedCount: 0,
      },
    });
    await prisma.parserCertification.updateMany({ data: { parserCertified: false } });
    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: false },
    });

    const carrier = await prisma.generatedOutput.findUniqueOrThrow({ where: { id: outputId } });
    const gate = await evaluateExportGate({
      output: carrier,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.blockers.length).toBeGreaterThan(0);
    expect(gate.blockers.some((b) => b.includes("Carrier-ready"))).toBe(true);
  });
});
