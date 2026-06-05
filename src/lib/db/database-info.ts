export function isSqliteDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) {
    return false;
  }
  const normalized = databaseUrl.trim().toLowerCase();
  return normalized.startsWith("file:") || normalized.includes("sqlite");
}

export function isPostgresDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) {
    return false;
  }
  const normalized = databaseUrl.trim().toLowerCase();
  return (
    normalized.startsWith("postgresql://") ||
    normalized.startsWith("postgres://")
  );
}
