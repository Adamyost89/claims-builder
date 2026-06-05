import { describe, expect, it } from "vitest";

import { isPostgresDatabaseUrl } from "@/lib/db/database-info";
import { prisma } from "@/lib/db";
import { getProductionDashboardData } from "@/lib/production/readiness";

const databaseUrl = process.env.DATABASE_URL;
const isPostgresTarget = isPostgresDatabaseUrl(databaseUrl);

describe.skipIf(!isPostgresTarget)("PostgreSQL smoke", () => {
  it("connects, has OrgSettings, and loads production dashboard data", async () => {
    expect(isPostgresDatabaseUrl(databaseUrl)).toBe(true);

    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeTruthy();

    const orgSettings = await prisma.orgSettings.findUnique({
      where: { id: "default" },
    });
    expect(orgSettings).toBeTruthy();

    const dashboard = await getProductionDashboardData();
    expect(dashboard.orgSettings).toBeTruthy();
    expect(dashboard.readiness.usesSqlite).toBe(false);
  });
});
