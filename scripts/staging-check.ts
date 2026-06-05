import { ParserType } from "@prisma/client";

import { env } from "@/lib/env";
import { isPostgresDatabaseUrl } from "@/lib/db/database-info";
import { prisma } from "@/lib/db";
import { getProductionDashboardData } from "@/lib/production/readiness";
import { ensureStorageReady } from "@/server/storage/adapter";

const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_NAME",
  "STORAGE_DIR",
] as const;

async function checkEnvironment(): Promise<void> {
  for (const key of REQUIRED_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  console.log("✓ Required environment variables are set");

  if (!isPostgresDatabaseUrl(env.DATABASE_URL)) {
    throw new Error(
      "Staging requires PostgreSQL DATABASE_URL (postgresql:// or postgres://).",
    );
  }
  console.log("✓ DATABASE_URL uses PostgreSQL");

  if (process.env.DIRECT_URL?.trim()) {
    console.log("✓ DIRECT_URL is set for migration CLI");
  } else {
    console.log("ℹ DIRECT_URL not set (OK when DATABASE_URL is a direct connection)");
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    console.log("✓ OPENAI_API_KEY is set");
  } else {
    console.log("ℹ OPENAI_API_KEY is empty — mock generation in non-production runtimes");
  }
}

async function checkDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  console.log("✓ Prisma connects to PostgreSQL");

  const migrations = await prisma.$queryRaw<{ migration_count: bigint }[]>`
    SELECT COUNT(*)::bigint AS migration_count FROM "_prisma_migrations"
  `;
  const migrationCount = Number(migrations[0]?.migration_count ?? 0);
  if (migrationCount < 1) {
    throw new Error(
      'No applied migrations found. Run `npm run db:migrate` before staging validation.',
    );
  }
  console.log(`✓ Prisma migrations applied (${migrationCount})`);
}

async function checkSeed(): Promise<void> {
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { id: "default" },
  });
  if (!orgSettings) {
    throw new Error(
      'OrgSettings row "default" missing. Run `npm run db:seed` after migrate.',
    );
  }
  console.log("✓ OrgSettings default row exists");

  const adminEmail = env.ADMIN_EMAIL.trim().toLowerCase();
  const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!adminUser) {
    throw new Error(`Admin user "${adminEmail}" missing. Run \`npm run db:seed\`.`);
  }
  console.log("✓ Seed admin user exists");

  const parserRows = await prisma.parserCertification.count();
  const expectedParsers = Object.values(ParserType).length;
  if (parserRows < expectedParsers) {
    throw new Error(
      `ParserCertification rows incomplete (${parserRows}/${expectedParsers}). Run \`npm run db:seed\`.`,
    );
  }
  console.log(`✓ ParserCertification rows present (${parserRows})`);

  const issueCert = await prisma.issueDetectionCertification.findUnique({
    where: { id: "default" },
  });
  if (!issueCert) {
    throw new Error("IssueDetectionCertification default row missing. Run `npm run db:seed`.");
  }
  console.log("✓ IssueDetectionCertification default row exists");
}

async function checkProductionDashboard(): Promise<void> {
  const dashboard = await getProductionDashboardData();
  if (!dashboard.orgSettings) {
    throw new Error("Production dashboard data did not include orgSettings.");
  }
  if (dashboard.readiness.usesSqlite) {
    throw new Error("Production dashboard reports SQLite on a PostgreSQL staging target.");
  }
  console.log("✓ Production readiness dashboard data loads");
  console.log(
    `  dryRunsReviewedCount: ${dashboard.orgSettings.dryRunsReviewedCount} / ${dashboard.orgSettings.dryRunsRequired}`,
  );
  console.log(`  productionReady: ${dashboard.readiness.productionReady}`);
}

async function checkStorage(): Promise<void> {
  const root = await ensureStorageReady();
  console.log(`✓ STORAGE_DIR is writable (${root})`);
}

async function main() {
  await checkEnvironment();
  await checkDatabase();
  await checkSeed();
  await checkProductionDashboard();
  await checkStorage();
  console.log("Staging automated checks passed.");
  console.log("Next: complete manual E2E — docs/STAGING_E2E_CHECKLIST.md");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
