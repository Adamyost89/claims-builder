import type { OrgSettings } from "@prisma/client";

export function isActiveProductionOverride(
  settings: Pick<
    OrgSettings,
    | "productionOverrideAt"
    | "productionOverrideRevokedAt"
    | "productionOverrideExpiresAt"
  > | null,
  now: Date = new Date(),
): boolean {
  if (!settings?.productionOverrideAt) {
    return false;
  }
  if (settings.productionOverrideRevokedAt) {
    return false;
  }
  if (
    settings.productionOverrideExpiresAt &&
    now.getTime() > settings.productionOverrideExpiresAt.getTime()
  ) {
    return false;
  }
  return true;
}

export type ProductionOverrideStatus =
  | "none"
  | "active"
  | "revoked"
  | "expired";

export function getProductionOverrideStatus(
  settings: Pick<
    OrgSettings,
    | "productionOverrideAt"
    | "productionOverrideRevokedAt"
    | "productionOverrideExpiresAt"
  > | null,
  now: Date = new Date(),
): ProductionOverrideStatus {
  if (!settings?.productionOverrideAt) {
    return "none";
  }
  if (settings.productionOverrideRevokedAt) {
    return "revoked";
  }
  if (
    settings.productionOverrideExpiresAt &&
    now.getTime() > settings.productionOverrideExpiresAt.getTime()
  ) {
    return "expired";
  }
  return "active";
}
