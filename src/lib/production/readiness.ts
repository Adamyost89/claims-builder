import { prisma } from "@/lib/db";
import { isSqliteDatabaseUrl } from "@/lib/db/database-info";
import {
  getIssueDetectionCertification,
  isIssueDetectionCertified,
} from "@/lib/issues/certification";

import {
  getProductionOverrideStatus,
  isActiveProductionOverride,
} from "./override";

export type ProductionReadinessStatus = {
  productionReady: boolean;
  parsersCertified: boolean;
  issueDetectionCertified: boolean;
  dryRunsSatisfied: boolean;
  hasAdminOverride: boolean;
  overrideStatus: "none" | "active" | "revoked" | "expired";
  productionOverrideNote: string | null;
  usesSqlite: boolean;
  dryRunsReviewedCount: number;
  dryRunsRequired: number;
  blockers: string[];
};

export type ParserCertificationRow = {
  parserType: string;
  parserCertified: boolean;
  fixtureAccuracy: number | null;
  requiredAccuracy: number;
  lastCertifiedAt: Date | null;
};

export type ProductionDashboardData = {
  orgSettings: {
    productionReady: boolean;
    dryRunsReviewedCount: number;
    dryRunsRequired: number;
    productionOverrideAt: Date | null;
    productionOverrideBy: string | null;
    productionOverrideNote: string | null;
    productionOverrideExpiresAt: Date | null;
    productionOverrideRevokedAt: Date | null;
    productionOverrideRevokeNote: string | null;
    fixtureTestsPassedAt: Date | null;
  };
  usesSqlite: boolean;
  overrideStatus: "none" | "active" | "revoked" | "expired";
  readiness: ProductionReadinessStatus;
  parsers: ParserCertificationRow[];
  issueDetection: {
    certified: boolean;
    fixtureAccuracy: number | null;
    certifiedAt: Date | null;
    lastRunAt: Date | null;
  };
  carrierExportGuard: {
    allowedWithoutOverride: boolean;
    allowedWithOverride: boolean;
    blockers: string[];
  };
  pendingDryRunClaims: {
    id: string;
    claimNumber: string;
    customerName: string;
    hasExportedOutput: boolean;
  }[];
  overrideByUser: { id: string; name: string; email: string } | null;
};

export async function getParserCertificationStatus(): Promise<boolean> {
  const parsers = await prisma.parserCertification.findMany();
  if (parsers.length === 0) {
    return false;
  }
  return parsers.every((parser) => parser.parserCertified);
}

export async function evaluateProductionReadiness(): Promise<ProductionReadinessStatus> {
  const [settings, parsersCertified, issueDetectionCertified] = await Promise.all([
    prisma.orgSettings.findUnique({ where: { id: "default" } }),
    getParserCertificationStatus(),
    isIssueDetectionCertified(),
  ]);

  const dryRunsReviewedCount = settings?.dryRunsReviewedCount ?? 0;
  const dryRunsRequired = settings?.dryRunsRequired ?? 10;
  const dryRunsSatisfied = dryRunsReviewedCount >= dryRunsRequired;
  const hasAdminOverride = isActiveProductionOverride(settings);
  const overrideStatus = getProductionOverrideStatus(settings);
  const usesSqlite = isSqliteDatabaseUrl(process.env.DATABASE_URL);

  const blockers: string[] = [];
  if (!parsersCertified) {
    blockers.push("One or more parsers are not fixture-certified.");
  }
  if (!issueDetectionCertified) {
    blockers.push("Issue detection is not fixture-certified at 100% accuracy.");
  }
  if (!dryRunsSatisfied) {
    blockers.push(
      `Dry-run review count ${dryRunsReviewedCount}/${dryRunsRequired} not satisfied.`,
    );
  }

  const productionReady =
    parsersCertified && issueDetectionCertified && dryRunsSatisfied;

  return {
    productionReady,
    parsersCertified,
    issueDetectionCertified,
    dryRunsSatisfied,
    hasAdminOverride,
    overrideStatus,
    productionOverrideNote: hasAdminOverride
      ? (settings?.productionOverrideNote ?? null)
      : null,
    usesSqlite,
    dryRunsReviewedCount,
    dryRunsRequired,
    blockers,
  };
}

export async function refreshProductionReadiness(): Promise<ProductionReadinessStatus> {
  const status = await evaluateProductionReadiness();
  await prisma.orgSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      productionReady: status.productionReady,
    },
    update: {
      productionReady: status.productionReady,
      fixtureTestsPassedAt: status.issueDetectionCertified ? new Date() : null,
    },
  });
  return status;
}

/** @deprecated Use refreshProductionReadiness */
export const syncOrgProductionReadyFlag = refreshProductionReadiness;

export type CarrierReadyGuardInput = {
  claimIsDryRun?: boolean;
};

export type CarrierReadyGuardResult = {
  allowed: boolean;
  watermarked: boolean;
  blockers: string[];
};

export async function assertCarrierReadyOutputAllowed(
  input: CarrierReadyGuardInput = {},
): Promise<CarrierReadyGuardResult> {
  const status = await evaluateProductionReadiness();
  const allowed =
    status.productionReady || status.hasAdminOverride || Boolean(input.claimIsDryRun);

  if (!allowed) {
    throw new Error(
      `Carrier-ready output blocked: ${status.blockers.join(" ")}`,
    );
  }

  return {
    allowed: true,
    watermarked: Boolean(input.claimIsDryRun) && !status.productionReady,
    blockers: status.blockers,
  };
}

export async function getProductionDashboardData(): Promise<ProductionDashboardData> {
  const [settings, readiness, parsers, issueRecord, pendingDryRuns] = await Promise.all([
    prisma.orgSettings.findUnique({ where: { id: "default" } }),
    evaluateProductionReadiness(),
    prisma.parserCertification.findMany({ orderBy: { parserType: "asc" } }),
    getIssueDetectionCertification(),
    prisma.claim.findMany({
      where: {
        isDryRun: true,
        dryRunReviewedAt: null,
      },
      select: {
        id: true,
        claimNumber: true,
        customerName: true,
        generatedOutputs: {
          where: { status: "EXPORTED" },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  let overrideByUser: ProductionDashboardData["overrideByUser"] = null;
  if (settings?.productionOverrideBy) {
    const user = await prisma.user.findUnique({
      where: { id: settings.productionOverrideBy },
      select: { id: true, name: true, email: true },
    });
    overrideByUser = user;
  }

  return {
    orgSettings: {
      productionReady: settings?.productionReady ?? false,
      dryRunsReviewedCount: settings?.dryRunsReviewedCount ?? 0,
      dryRunsRequired: settings?.dryRunsRequired ?? 10,
      productionOverrideAt: settings?.productionOverrideAt ?? null,
      productionOverrideBy: settings?.productionOverrideBy ?? null,
      productionOverrideNote: settings?.productionOverrideNote ?? null,
      productionOverrideExpiresAt: settings?.productionOverrideExpiresAt ?? null,
      productionOverrideRevokedAt: settings?.productionOverrideRevokedAt ?? null,
      productionOverrideRevokeNote: settings?.productionOverrideRevokeNote ?? null,
      fixtureTestsPassedAt: settings?.fixtureTestsPassedAt ?? null,
    },
    usesSqlite: readiness.usesSqlite,
    overrideStatus: readiness.overrideStatus,
    readiness,
    parsers: parsers.map((parser) => ({
      parserType: parser.parserType,
      parserCertified: parser.parserCertified,
      fixtureAccuracy: parser.fixtureAccuracy,
      requiredAccuracy: parser.requiredAccuracy,
      lastCertifiedAt: parser.lastCertifiedAt,
    })),
    issueDetection: {
      certified: issueRecord?.certified ?? false,
      fixtureAccuracy: issueRecord?.fixtureAccuracy ?? null,
      certifiedAt: issueRecord?.certifiedAt ?? null,
      lastRunAt: issueRecord?.lastRunAt ?? null,
    },
    carrierExportGuard: {
      allowedWithoutOverride: readiness.productionReady,
      allowedWithOverride: readiness.productionReady || readiness.hasAdminOverride,
      blockers: readiness.blockers,
    },
    pendingDryRunClaims: pendingDryRuns.map((claim) => ({
      id: claim.id,
      claimNumber: claim.claimNumber,
      customerName: claim.customerName,
      hasExportedOutput: claim.generatedOutputs.length > 0,
    })),
    overrideByUser,
  };
}
