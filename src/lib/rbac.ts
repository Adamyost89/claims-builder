import { UserRole } from "@prisma/client";

export { UserRole };

export type AppRole = UserRole;

const ROLE_RANK: Record<UserRole, number> = {
  VIEWER: 1,
  SUPPLEMENT_WRITER: 2,
  MANAGER: 3,
  ADMIN: 4,
};

export function hasRole(role: UserRole, ...allowed: UserRole[]): boolean {
  return allowed.includes(role);
}

export function hasMinimumRole(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function canManageUsers(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export function canManageRules(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export function canViewClaims(role: UserRole): boolean {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.MANAGER ||
    role === UserRole.SUPPLEMENT_WRITER ||
    role === UserRole.VIEWER
  );
}

export function canEditClaims(role: UserRole): boolean {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.MANAGER ||
    role === UserRole.SUPPLEMENT_WRITER
  );
}

export function canCreateClaims(role: UserRole): boolean {
  return canEditClaims(role);
}

export function canAddNotes(role: UserRole): boolean {
  return canEditClaims(role);
}

export function canAdvanceWorkflow(role: UserRole): boolean {
  return canEditClaims(role);
}

export function canApproveExport(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

/** Managers and admins may export approved output; writers and viewers cannot. */
export function canExport(role: UserRole): boolean {
  return canApproveExport(role);
}

export function canViewProductionSettings(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export function canSetProductionOverride(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export function canReviewDryRun(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export class PermissionDeniedError extends Error {
  constructor(message = "Permission denied") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export function assertPermission(
  allowed: boolean,
  message = "Permission denied",
): asserts allowed {
  if (!allowed) {
    throw new PermissionDeniedError(message);
  }
}
