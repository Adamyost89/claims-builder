import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canSetProductionOverride,
  canViewProductionSettings,
} from "@/lib/rbac";
import { UserRole } from "@prisma/client";

describe("production dashboard access", () => {
  it("blocks non-admin override controls via rbac", () => {
    expect(canViewProductionSettings(UserRole.ADMIN)).toBe(true);
    expect(canViewProductionSettings(UserRole.MANAGER)).toBe(true);
    expect(canViewProductionSettings(UserRole.SUPPLEMENT_WRITER)).toBe(false);
    expect(canViewProductionSettings(UserRole.VIEWER)).toBe(false);

    expect(canSetProductionOverride(UserRole.ADMIN)).toBe(true);
    expect(canSetProductionOverride(UserRole.MANAGER)).toBe(false);
  });

  it("production banner links to dashboard for admin/manager", () => {
    const banner = readFileSync(
      join(process.cwd(), "src", "components", "shared", "production-warning-banner.tsx"),
      "utf8",
    );
    expect(banner).toContain("/settings/production");
    expect(banner).toContain("canViewProductionSettings");
  });

  it("uses proxy.ts for auth route protection", () => {
    const proxy = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
    expect(proxy).toContain("withAuth");
    expect(proxy).toContain("signIn");
  });

  it("production settings page restricts viewers and writers", () => {
    const page = readFileSync(
      join(process.cwd(), "src", "app", "settings", "production", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("canViewProductionSettings");
    expect(page).toContain("redirect");
  });
});
