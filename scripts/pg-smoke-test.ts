import { isPostgresDatabaseUrl } from "@/lib/db/database-info";
import { prisma } from "@/lib/db";
import { getProductionDashboardData } from "@/lib/production/readiness";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (!isPostgresDatabaseUrl(databaseUrl)) {
    throw new Error(
      `DATABASE_URL must use postgresql:// or postgres:// for this smoke test (received "${databaseUrl.split(":")[0]}:").`,
    );
  }
  console.log("✓ DATABASE_URL uses PostgreSQL");

  await prisma.$queryRaw`SELECT 1`;
  console.log("✓ Prisma connects to PostgreSQL");

  const orgSettings = await prisma.orgSettings.findUnique({
    where: { id: "default" },
  });
  if (!orgSettings) {
    throw new Error(
      'OrgSettings row "default" is missing. Run `npm run db:seed` after `npm run db:migrate`.',
    );
  }
  console.log("✓ OrgSettings exists after seed");

  const dashboard = await getProductionDashboardData();
  if (!dashboard.orgSettings) {
    throw new Error("Production dashboard data did not include orgSettings.");
  }
  if (dashboard.readiness.usesSqlite) {
    throw new Error("Production dashboard incorrectly reports SQLite while on PostgreSQL.");
  }
  console.log("✓ Production dashboard data loads");

  console.log("PostgreSQL smoke test passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
