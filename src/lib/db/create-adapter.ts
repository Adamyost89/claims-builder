import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

export type DatabaseAdapterKind = "sqlite" | "postgresql";

export class UnsupportedDatabaseUrlError extends Error {
  constructor(databaseUrl: string) {
    const scheme = databaseUrl.includes(":")
      ? `${databaseUrl.split(":")[0]}:`
      : "(missing scheme)";
    super(
      `Unsupported DATABASE_URL scheme "${scheme}". Expected file: (SQLite), postgresql://, or postgres://.`,
    );
    this.name = "UnsupportedDatabaseUrlError";
  }
}

export function getDatabaseAdapterKind(databaseUrl: string): DatabaseAdapterKind {
  const normalized = databaseUrl.trim().toLowerCase();

  if (normalized.startsWith("file:")) {
    return "sqlite";
  }

  if (
    normalized.startsWith("postgresql://") ||
    normalized.startsWith("postgres://")
  ) {
    return "postgresql";
  }

  throw new UnsupportedDatabaseUrlError(databaseUrl);
}

export function createPrismaAdapter(databaseUrl: string) {
  const kind = getDatabaseAdapterKind(databaseUrl);

  if (kind === "sqlite") {
    return new PrismaBetterSqlite3({ url: databaseUrl });
  }

  return new PrismaPg({ connectionString: databaseUrl });
}
