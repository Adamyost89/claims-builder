import type { UserRole } from "@prisma/client";

import { logClaimEvent, logSystemEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import {
  assertPermission,
  canReviewDryRun,
  canSetProductionOverride,
} from "@/lib/rbac";

import { refreshProductionReadiness } from "./readiness";

export async function setProductionOverride(input: {
  actorId: string;
  actorRole: UserRole;
  overrideNote: string;
  expiresAt?: Date | null;
}) {
  assertPermission(
    canSetProductionOverride(input.actorRole),
    "Only admins can set production override.",
  );

  const note = input.overrideNote.trim();
  if (!note) {
    throw new Error("Production override note is required.");
  }

  const updated = await prisma.orgSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      productionOverrideBy: input.actorId,
      productionOverrideAt: new Date(),
      productionOverrideNote: note,
      productionOverrideExpiresAt: input.expiresAt ?? null,
      productionOverrideRevokedAt: null,
      productionOverrideRevokedBy: null,
      productionOverrideRevokeNote: null,
      productionReady: false,
    },
    update: {
      productionOverrideBy: input.actorId,
      productionOverrideAt: new Date(),
      productionOverrideNote: note,
      productionOverrideExpiresAt: input.expiresAt ?? null,
      productionOverrideRevokedAt: null,
      productionOverrideRevokedBy: null,
      productionOverrideRevokeNote: null,
    },
  });

  await refreshProductionReadiness();

  await logSystemEvent({
    actorId: input.actorId,
    eventType: "PRODUCTION_OVERRIDE",
    payload: {
      overrideNote: note,
      productionOverrideAt: updated.productionOverrideAt?.toISOString(),
      productionOverrideExpiresAt: updated.productionOverrideExpiresAt?.toISOString() ?? null,
      productionOverrideBy: input.actorId,
    },
  });

  return updated;
}

export async function revokeProductionOverride(input: {
  actorId: string;
  actorRole: UserRole;
  revokeNote: string;
}) {
  assertPermission(
    canSetProductionOverride(input.actorRole),
    "Only admins can revoke production override.",
  );

  const note = input.revokeNote.trim();
  if (!note) {
    throw new Error("Production override revoke note is required.");
  }

  const settings = await prisma.orgSettings.findUnique({ where: { id: "default" } });
  if (!settings?.productionOverrideAt) {
    throw new Error("No production override is active to revoke.");
  }
  if (settings.productionOverrideRevokedAt) {
    throw new Error("Production override has already been revoked.");
  }

  const revokedAt = new Date();
  const updated = await prisma.orgSettings.update({
    where: { id: "default" },
    data: {
      productionOverrideRevokedAt: revokedAt,
      productionOverrideRevokedBy: input.actorId,
      productionOverrideRevokeNote: note,
    },
  });

  await refreshProductionReadiness();

  await logSystemEvent({
    actorId: input.actorId,
    eventType: "PRODUCTION_OVERRIDE_REVOKE",
    payload: {
      revokeNote: note,
      productionOverrideRevokedAt: revokedAt.toISOString(),
      productionOverrideRevokedBy: input.actorId,
      originalOverrideAt: settings.productionOverrideAt.toISOString(),
      originalOverrideNote: settings.productionOverrideNote,
    },
  });

  return updated;
}

export async function reviewDryRunClaim(input: {
  claimId: string;
  actorId: string;
  actorRole: UserRole;
  reviewNote?: string;
}) {
  assertPermission(canReviewDryRun(input.actorRole), "Only managers or admins can review dry runs.");

  const claim = await prisma.claim.findUnique({
    where: { id: input.claimId },
    include: {
      generatedOutputs: {
        where: { status: "EXPORTED" },
        take: 1,
      },
    },
  });

  if (!claim) {
    throw new Error("Claim not found.");
  }
  if (!claim.isDryRun) {
    throw new Error("Only dry-run claims can be reviewed for production readiness.");
  }
  if (claim.generatedOutputs.length === 0) {
    throw new Error("Dry-run claim must have at least one exported output before review.");
  }
  if (claim.dryRunReviewedAt) {
    throw new Error("This dry-run claim has already been reviewed.");
  }

  const reviewedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.claim.update({
      where: { id: claim.id },
      data: {
        dryRunReviewedAt: reviewedAt,
        dryRunReviewedById: input.actorId,
      },
    });

    await tx.orgSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        dryRunsReviewedCount: 1,
      },
      update: {
        dryRunsReviewedCount: { increment: 1 },
      },
    });
  });

  await refreshProductionReadiness();

  await logClaimEvent({
    claimId: claim.id,
    actorId: input.actorId,
    eventType: "DRY_RUN_REVIEW",
    payload: {
      reviewNote: input.reviewNote ?? null,
      dryRunReviewedAt: reviewedAt.toISOString(),
      exportedOutputId: claim.generatedOutputs[0]?.id,
    },
  });

  return prisma.claim.findUniqueOrThrow({
    where: { id: claim.id },
    include: {
      dryRunReviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
}
