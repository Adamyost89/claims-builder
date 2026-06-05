import path from "node:path";
import { defineConfig } from "prisma/config";

function resolveDatasourceUrl(): string {
  // Prisma 7: CLI migrations use DIRECT_URL when set (direct connection), else DATABASE_URL.
  return (
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    "postgresql://claims:claims@localhost:5432/claims_builder"
  );
}

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatasourceUrl(),
  },
});