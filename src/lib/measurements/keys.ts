/** Canonical measurement keys used by parsers and comparison (Phase 3+). */
export const MEASUREMENT_KEYS = {
  ROOF_AREA_SQ: "roof_area_sq",
  EAVE_LF: "eave_lf",
  RAKE_LF: "rake_lf",
  RIDGE_LF: "ridge_lf",
  HIP_LF: "hip_lf",
  VALLEY_LF: "valley_lf",
  WALL_AREA_SQ: "wall_area_sq",
  WASTE_PCT: "waste_pct_recommended",
} as const;

export type MeasurementKey = (typeof MEASUREMENT_KEYS)[keyof typeof MEASUREMENT_KEYS];

export const MEASUREMENT_KEY_LABELS: Record<MeasurementKey, string> = {
  roof_area_sq: "Roof area (SQ)",
  eave_lf: "Eaves (LF)",
  rake_lf: "Rakes (LF)",
  ridge_lf: "Ridge (LF)",
  hip_lf: "Hip (LF)",
  valley_lf: "Valley (LF)",
  wall_area_sq: "Wall area (SQ)",
  waste_pct_recommended: "Recommended waste %",
};

export function isCanonicalMeasurementKey(key: string): key is MeasurementKey {
  return Object.values(MEASUREMENT_KEYS).includes(key as MeasurementKey);
}
