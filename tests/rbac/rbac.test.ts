import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";

import {
  assertPermission,
  canApproveExport,
  canEditClaims,
  canExport,
  canManageRules,
  canManageUsers,
  canSetProductionOverride,
  hasRole,
  PermissionDeniedError,
} from "@/lib/rbac";

describe("rbac", () => {
  it("hasRole matches allowed roles", () => {
    expect(hasRole(UserRole.MANAGER, UserRole.MANAGER, UserRole.ADMIN)).toBe(true);
    expect(hasRole(UserRole.VIEWER, UserRole.ADMIN)).toBe(false);
  });

  it("enforces management permissions", () => {
    expect(canManageUsers(UserRole.ADMIN)).toBe(true);
    expect(canManageUsers(UserRole.MANAGER)).toBe(false);
    expect(canManageRules(UserRole.MANAGER)).toBe(true);
    expect(canManageRules(UserRole.SUPPLEMENT_WRITER)).toBe(false);
    expect(canEditClaims(UserRole.SUPPLEMENT_WRITER)).toBe(true);
    expect(canEditClaims(UserRole.VIEWER)).toBe(false);
    expect(canApproveExport(UserRole.ADMIN)).toBe(true);
    expect(canApproveExport(UserRole.SUPPLEMENT_WRITER)).toBe(false);
    expect(canExport(UserRole.SUPPLEMENT_WRITER)).toBe(false);
    expect(canExport(UserRole.MANAGER)).toBe(true);
    expect(canSetProductionOverride(UserRole.MANAGER)).toBe(false);
  });

  it("assertPermission throws when denied", () => {
    expect(() => assertPermission(false, "nope")).toThrow(PermissionDeniedError);
    expect(() => assertPermission(true)).not.toThrow();
  });
});