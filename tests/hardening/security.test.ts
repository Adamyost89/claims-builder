import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ClaimType,
  OutputMode,
  UserRole,
} from "@prisma/client";

import { getClaimDocument } from "@/lib/documents/service";
import {
  evaluateExportGate,
  isExportReadyOutput,
} from "@/lib/export/gate";
import { exportApprovedOutput } from "@/lib/export/service";
import {
  isProductionRuntime,
  shouldUseMockGeneration,
} from "@/lib/generation/service";
import { prisma } from "@/lib/db";
import { isSqliteDatabaseUrl } from "@/lib/db/database-info";
import {
  evaluateProductionReadiness,
} from "@/lib/production/readiness";
import {
  revokeProductionOverride,
  setProductionOverride,
} from "@/lib/production/service";
import {
  canExport,
  canSetProductionOverride,
  PermissionDeniedError,
} from "@/lib/rbac";
import {
  readClaimFile,
  StoragePathError,
} from "@/server/storage/adapter";

describe("post-phase-8 hardening", () => {
  describe("proxy migration", () => {
    it("uses proxy.ts instead of deprecated middleware.ts", () => {
      expect(existsSync(join(process.cwd(), "src", "proxy.ts"))).toBe(true);
      expect(existsSync(join(process.cwd(), "src", "middleware.ts"))).toBe(false);
      const proxy = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
      expect(proxy).toContain("withAuth");
      expect(proxy).toContain("matcher");
    });
  });

  describe("storage safety", () => {
    it("blocks path traversal on readClaimFile", async () => {
      await expect(readClaimFile("../../etc/passwd")).rejects.toBeInstanceOf(
        StoragePathError,
      );
      await expect(readClaimFile("../../../package.json")).rejects.toBeInstanceOf(
        StoragePathError,
      );
      await expect(readClaimFile("claims/../.env")).rejects.toBeInstanceOf(
        StoragePathError,
      );
    });
  });

  describe("sqlite detection", () => {
    it("detects sqlite DATABASE_URL", () => {
      expect(isSqliteDatabaseUrl("file:./dev.db")).toBe(true);
      expect(isSqliteDatabaseUrl("postgresql://localhost/claims")).toBe(false);
    });

    it("production readiness reflects DATABASE_URL provider in test env", async () => {
      const status = await evaluateProductionReadiness();
      expect(status.usesSqlite).toBe(isSqliteDatabaseUrl(process.env.DATABASE_URL));
    });
  });

  describe("openai production safety", () => {
    it("never uses mock generation in production runtime", () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        expect(isProductionRuntime()).toBe(true);
        expect(shouldUseMockGeneration()).toBe(false);
      } finally {
        process.env.NODE_ENV = original;
      }
    });

    it("allows mock generation in test runtime", () => {
      expect(shouldUseMockGeneration()).toBe(true);
    });
  });

  describe("rbac hardening", () => {
    it("supplement writers cannot export", () => {
      expect(canExport(UserRole.SUPPLEMENT_WRITER)).toBe(false);
      expect(canExport(UserRole.MANAGER)).toBe(true);
      expect(canExport(UserRole.ADMIN)).toBe(true);
      expect(canExport(UserRole.VIEWER)).toBe(false);
    });

    it("managers cannot set production override", () => {
      expect(canSetProductionOverride(UserRole.MANAGER)).toBe(false);
      expect(canSetProductionOverride(UserRole.ADMIN)).toBe(true);
    });
  });
});

describe("export re-export and override revoke integration", () => {
  let adminId: string;
  let managerId: string;
  let writerId: string;
  let claimId: string;
  let outputId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `harden-admin-${Date.now()}@example.com`,
        name: "Admin",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.ADMIN,
      },
    });
    adminId = admin.id;

    const manager = await prisma.user.create({
      data: {
        email: `harden-mgr-${Date.now()}@example.com`,
        name: "Manager",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.MANAGER,
      },
    });
    managerId = manager.id;

    const writer = await prisma.user.create({
      data: {
        email: `harden-writer-${Date.now()}@example.com`,
        name: "Writer",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    writerId = writer.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Harden Customer",
        propertyAddress: "1 Harden St",
        carrier: "Carrier",
        claimNumber: `HARDEN-${Date.now()}`,
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

    const output = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.INTERNAL_AUDIT,
        status: "APPROVED",
        version: 1,
        contentJson: JSON.stringify({
          outputMode: "INTERNAL_AUDIT",
          title: "Audit",
          sections: [],
          excludedRevisions: [],
          unsupportedClaims: [],
          toneLintPassed: true,
          warnings: [],
        }),
        contentText: "Re-export content",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: managerId,
        approvedAt: new Date(),
        isMockGeneration: false,
      },
    });
    outputId = output.id;

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
    await prisma.parserCertification.updateMany({
      data: { parserCertified: false },
    });
  });

  afterAll(async () => {
    await prisma.generatedOutput.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, managerId, writerId] } },
    });
    await prisma.$disconnect();
  });

  it("supplement writer cannot export approved output", async () => {
    await expect(
      exportApprovedOutput({
        claimId,
        outputId,
        format: "clipboard",
        actorId: writerId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("exported outputs remain export-ready for re-export", async () => {
    await exportApprovedOutput({
      claimId,
      outputId,
      format: "clipboard",
      actorId: managerId,
      actorRole: UserRole.MANAGER,
    });

    const exported = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: outputId },
    });
    expect(exported.status).toBe("EXPORTED");
    expect(isExportReadyOutput(exported)).toBe(true);

    const gate = await evaluateExportGate({
      output: exported,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.isReExport).toBe(true);

    const beforeText = exported.contentText;
    await exportApprovedOutput({
      claimId,
      outputId,
      format: "clipboard",
      actorId: managerId,
      actorRole: UserRole.MANAGER,
    });
    const after = await prisma.generatedOutput.findUniqueOrThrow({
      where: { id: outputId },
    });
    expect(after.contentText).toBe(beforeText);
    expect(after.status).toBe("EXPORTED");
  });

  it("revoked override no longer allows carrier-ready export", async () => {
    const carrier = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "APPROVED",
        version: 2,
        contentJson: JSON.stringify({
          outputMode: "FULL_SUPPLEMENT",
          title: "Supplement",
          sections: [],
          excludedRevisions: [],
          unsupportedClaims: [],
          toneLintPassed: true,
          warnings: [],
        }),
        contentText: "Carrier content",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: managerId,
        approvedAt: new Date(),
      },
    });

    await setProductionOverride({
      actorId: adminId,
      actorRole: UserRole.ADMIN,
      overrideNote: "Temporary pilot",
    });

    let gate = await evaluateExportGate({
      output: carrier,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(true);

    await revokeProductionOverride({
      actorId: adminId,
      actorRole: UserRole.ADMIN,
      revokeNote: "Pilot ended",
    });

    const status = await evaluateProductionReadiness();
    expect(status.hasAdminOverride).toBe(false);
    expect(status.overrideStatus).toBe("revoked");

    gate = await evaluateExportGate({
      output: carrier,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(gate.allowed).toBe(false);

    const revokeEvent = await prisma.claimEvent.findFirst({
      where: { claimId: null, eventType: "PRODUCTION_OVERRIDE_REVOKE" },
      orderBy: { createdAt: "desc" },
    });
    expect(revokeEvent).toBeTruthy();
  });

  it("blocks mock carrier export unless claim is dry run", async () => {
    const mockOutput = await prisma.generatedOutput.create({
      data: {
        claimId,
        outputMode: OutputMode.FULL_SUPPLEMENT,
        status: "APPROVED",
        version: 3,
        contentJson: "{}",
        contentText: "Mock carrier",
        toneLintPassed: true,
        unsupportedClaimsJson: "[]",
        generationBlocked: false,
        revisionIdsIncluded: "[]",
        approvedById: managerId,
        approvedAt: new Date(),
        isMockGeneration: true,
      },
    });

    const blocked = await evaluateExportGate({
      output: mockOutput,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: false,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockers.some((b) => b.includes("Mock-generated"))).toBe(true);

    await prisma.claim.update({
      where: { id: claimId },
      data: { isDryRun: true },
    });

    const allowed = await evaluateExportGate({
      output: mockOutput,
      claimEvidenceReviewedAt: new Date(),
      claimIsDryRun: true,
    });
    expect(allowed.allowed).toBe(true);
  });

  it("soft-deleted documents are not retrievable via getClaimDocument", async () => {
    const deleted = await prisma.document.create({
      data: {
        claimId,
        type: "OTHER",
        fileName: "deleted.pdf",
        mimeType: "application/pdf",
        storageKey: "claims/fake/deleted.pdf",
        fileSize: 10,
        uploadedById: adminId,
        deletedAt: new Date(),
        deletedById: adminId,
      },
    });

    const found = await getClaimDocument(claimId, deleted.id);
    expect(found).toBeNull();
  });
});
