import { describe, expect, it } from "vitest";

import {
  UnsupportedDatabaseUrlError,
  createPrismaAdapter,
  getDatabaseAdapterKind,
} from "@/lib/db/create-adapter";

describe("database adapter selection", () => {
  it("file: URL selects SQLite", () => {
    expect(getDatabaseAdapterKind("file:./dev.db")).toBe("sqlite");

    const adapter = createPrismaAdapter("file:./dev.db");
    expect(adapter.provider).toBe("sqlite");
  });

  it("postgresql:// selects PostgreSQL", () => {
    const url = "postgresql://claims:claims@localhost:5432/claims_builder";
    expect(getDatabaseAdapterKind(url)).toBe("postgresql");

    const adapter = createPrismaAdapter(url);
    expect(adapter.provider).toBe("postgres");
  });

  it("postgres:// selects PostgreSQL", () => {
    const url = "postgres://claims:claims@localhost:5432/claims_builder";
    expect(getDatabaseAdapterKind(url)).toBe("postgresql");

    const adapter = createPrismaAdapter(url);
    expect(adapter.provider).toBe("postgres");
  });

  it("unsupported scheme throws a clear error", () => {
    expect(() => getDatabaseAdapterKind("mysql://localhost/claims")).toThrow(
      UnsupportedDatabaseUrlError,
    );
    expect(() => getDatabaseAdapterKind("mysql://localhost/claims")).toThrow(
      /Unsupported DATABASE_URL scheme "mysql:"/,
    );
    expect(() => getDatabaseAdapterKind("mysql://localhost/claims")).toThrow(
      /file: \(SQLite\), postgresql:\/\/, or postgres:\/\//,
    );

    expect(() => createPrismaAdapter("mysql://localhost/claims")).toThrow(
      UnsupportedDatabaseUrlError,
    );
  });
});
