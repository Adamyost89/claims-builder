import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ClaimType,
  OutputMode,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { evaluateExportGate } from "@/lib/export/gate";
import {
  evaluateProductionReadiness,
  getProductionDashboardData,
} from "@/lib/production/readiness";
import { setProductionOverride } from "@/lib/production/service";

describe("override expiration", () => {
  let adminId: string;
  let claimId: string;
  let carrierOutputId: string;

  async function resetOrgSettingsOverride() {
    await prisma.orgSettings.upsert({
      where: { id: "default" },
      create: { id: "default", productionReady: false },
      update: {
        productionReady: false,
        productionOverrideAt: null,
        productionOverrideBy: null,
        productionOverrideNote: null,
        productionOverrideExpiresAt: null,
        productionOverrideRevokedAt: null,
        productionOverrideRevokedBy: null,
        productionOverrideRevokeNote: null,
      },
    });
  }

  async function seedActiveUnexpiredOverride() {
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: {
        productionOverrideAt: new Date(),
        productionOverrideBy: adminId,
        productionOverrideNote: "Timed pilot",
        productionOverrideExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        productionOverrideRevokedAt: null,
        productionOverrideRevokedBy: null,
        productionOverrideRevokeNote: null,
      },
    });
  }

  async function seedExpiredOverride() {
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: {
        productionOverrideAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        productionOverrideBy: adminId,
        productionOverrideNote: "Timed pilot",
        productionOverrideExpiresAt: new Date(Date.now() - 60_000),
        productionOverrideRevokedAt: null,
        productionOverrideRevokedBy: null,
        productionOverrideRevokeNote: null,
      },
    });
  }

  async function seedRevokedOverride() {
    await prisma.orgSettings.update({
      where: { id: "default" },
      data: {
        productionOverrideAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        productionOverrideBy: adminId,
        productionOverrideNote: "Timed pilot",
        productionOverrideExpiresAt: null,
        productionOverrideRevokedAt: new Date(),
        productionOverrideRevokedBy: adminId,
        productionOverrideRevokeNote: "Ended pilot",
      },
    });
  }

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `override-exp-admin-${Date.now()}@example.com`,
        name: "Admin",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.ADMIN,
      },
    });
    adminId = admin.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Override Exp Customer",
        propertyAddress: "1 Exp St",
        carrier: "Carrier",
        claimNumber: `OVR-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: adminId,
        evidenceReviewedAt: new Date(),
        isDryRun: false,
      },
    });
    claimId = claim.id;

    const carrier = await prisma.generatedOutput.create({
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
        contentText: "Carrier",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
    carrierOutputId = carrier.id;

    await resetOrgSettingsOverride();
    await prisma.parserCertification.updateMany({
      data: { parserCertified: false },
    });
  });

  beforeEach(async () => {
    await resetOrgSettingsOverride();
  });

  afterEach(async () => {
    await resetOrgSettingsOverride();
  });

  afterAll(async () => {
    await prisma.generatedOutput.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("admin can set override expiration", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await setProductionOverride({
      actorId: adminId,
      actorRole: UserRole.ADMIN,
      overrideNote: "Timed pilot",
      expiresAt,
    });

    const settings = await prisma.orgSettings.findUnique({ where: { id: "default" } });
    expect(settings?.productionOverrideExpiresAt).toBeTruthy();
    expect(settings!.productionOverrideExpiresAt!.getTime()).toBe(expiresAt.getTime());
  });

  it("active unexpired override allows carrier export", async () => {
    await seedActiveUnexpiredOverride();

    const status = await evaluateProductionReadiness();
    expect(status.overrideStatus).toBe("active");
    expect(status.hasAdminOverride).toBe(true);

    const output = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: carrierOutputId },
    });
    const gate = await evaluateExportGate({
      output,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(true);
  });

  it("expired override does not allow carrier export", async () => {
    await seedExpiredOverride();

    const status = await evaluateProductionReadiness();
    expect(status.overrideStatus).toBe("expired");
    expect(status.hasAdminOverride).toBe(false);

    const output = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: carrierOutputId },
    });
    const gate = await evaluateExportGate({
      output,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(false);
  });

  it("dashboard data reflects expired override state", async () => {
    await seedExpiredOverride();

    const data = await getProductionDashboardData();
    expect(data.overrideStatus).toBe("expired");
    expect(data.readiness.hasAdminOverride).toBe(false);
    expect(data.orgSettings.productionOverrideExpiresAt).toBeTruthy();
  });

  it("dashboard UI exposes expiration field and status labels", () => {
    const dashboard = readFileSync(
      join(process.cwd(), "src", "components", "production", "production-dashboard.tsx"),
      "utf8",
    );
    expect(dashboard).toContain("datetime-local");
    expect(dashboard).toContain("productionOverrideExpiresAt");
    expect(dashboard).toContain("Override status: active");
    expect(dashboard).toContain("Override status: expired");
    expect(dashboard).toContain("Override status: revoked");
    expect(dashboard).toContain("expiresAt");
  });

  it("dashboard data reflects revoked override after manual revoke fields", async () => {
    await seedRevokedOverride();

    const data = await getProductionDashboardData();
    expect(data.overrideStatus).toBe("revoked");
    expect(data.readiness.hasAdminOverride).toBe(false);
    expect(data.orgSettings.productionOverrideRevokeNote).toBe("Ended pilot");
  });
});
