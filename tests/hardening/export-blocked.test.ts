import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ClaimType,
  OutputMode,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { exportApprovedOutput } from "@/lib/export/service";
import { PermissionDeniedError } from "@/lib/rbac";

describe("export blocked audit logging", () => {
  let adminId: string;
  let writerId: string;
  let claimId: string;
  let carrierOutputId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `export-block-admin-${Date.now()}@example.com`,
        name: "Admin",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.ADMIN,
      },
    });
    adminId = admin.id;

    const writer = await prisma.user.create({
      data: {
        email: `export-block-writer-${Date.now()}@example.com`,
        name: "Writer",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    writerId = writer.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Export Block Customer",
        propertyAddress: "1 Block St",
        carrier: "Carrier",
        claimNumber: `BLK-${Date.now()}`,
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
        contentText: "Carrier supplement",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
    carrierOutputId = carrier.id;

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
      },
    });
    await prisma.parserCertification.updateMany({
      data: { parserCertified: false },
    });
  });

  afterAll(async () => {
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.generatedOutput.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, writerId] } } });
    await prisma.$disconnect();
  });

  async function latestBlockedEvent() {
    return prisma.claimEvent.findFirst({
      where: { claimId, eventType: "EXPORT_BLOCKED" },
      orderBy: { createdAt: "desc" },
    });
  }

  it("logs EXPORT_BLOCKED for production guard carrier export failure", async () => {
    await expect(
      exportApprovedOutput({
        claimId,
        outputId: carrierOutputId,
        format: "pdf",
        actorId: adminId,
        actorRole: UserRole.ADMIN,
      }),
    ).rejects.toThrow(/Carrier-ready/i);

    const event = await latestBlockedEvent();
    expect(event).toBeTruthy();
    const payload = JSON.parse(event!.payloadJson);
    expect(payload.outputId).toBe(carrierOutputId);
    expect(payload.format).toBe("pdf");
    expect(payload.userId).toBe(adminId);
    expect(payload.reason).toBe("EXPORT_GATE_BLOCKED");
    expect(payload.blockers.some((b: string) => b.includes("Carrier-ready"))).toBe(true);
    expect(payload.contentText).toBeUndefined();
    expect(payload.contentJson).toBeUndefined();
  });

  it("logs EXPORT_BLOCKED for missing outputId", async () => {
    await expect(
      exportApprovedOutput({
        claimId,
        outputId: "   ",
        format: "clipboard",
        actorId: adminId,
        actorRole: UserRole.ADMIN,
      }),
    ).rejects.toThrow(/outputId is required/i);

    const event = await latestBlockedEvent();
    const payload = JSON.parse(event!.payloadJson);
    expect(payload.reason).toBe("MISSING_OUTPUT_ID");
    expect(payload.outputId).toBeNull();
    expect(payload.format).toBe("clipboard");
  });

  it("logs EXPORT_BLOCKED for RBAC export denial", async () => {
    await expect(
      exportApprovedOutput({
        claimId,
        outputId: carrierOutputId,
        format: "docx",
        actorId: writerId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    const event = await latestBlockedEvent();
    const payload = JSON.parse(event!.payloadJson);
    expect(payload.reason).toBe("RBAC_DENIED");
    expect(payload.userId).toBe(writerId);
    expect(payload.blockers[0]).toMatch(/managers or admins/i);
  });
});
