/** Deterministic comparison keys produced by the Phase 3 engine. */
export const COMPARISON_KEYS = {
  ROOF_AREA_SQ: "roof_area_sq",
  WASTE_COMPARISON: "waste_comparison",
  STARTER_EAVE_LF: "starter_eave_lf",
  RIDGE_CAP_LF: "ridge_cap_lf",
  DRIP_EDGE_LF: "drip_edge_lf",
  ICE_AND_WATER_EAVE_SF: "ice_and_water_eave_sf",
  VALLEY_ICE_AND_WATER_SF: "valley_ice_and_water_sf",
  SYNTHETIC_UNDERLAYMENT_SQ: "synthetic_underlayment_sq",
  SIDING_WALL_AREA_SQ: "siding_wall_area_sq",
  GUTTER_GUARD_LF: "gutter_guard_lf",
  WARNING_MISSING_CARRIER: "warning_missing_carrier_data",
  WARNING_MISSING_MEASUREMENT: "warning_missing_measurement_data",
} as const;

export type ComparisonKey = (typeof COMPARISON_KEYS)[keyof typeof COMPARISON_KEYS];

export const COMPARISON_KEY_LABELS: Record<ComparisonKey, string> = {
  roof_area_sq: "Roof area (SQ)",
  waste_comparison: "Waste %",
  starter_eave_lf: "Starter at eaves (LF)",
  ridge_cap_lf: "Ridge cap (LF)",
  drip_edge_lf: "Drip edge (LF)",
  ice_and_water_eave_sf: "Ice & water at eaves (SF)",
  valley_ice_and_water_sf: "Ice & water at valleys (SF)",
  synthetic_underlayment_sq: "Synthetic underlayment (SQ)",
  siding_wall_area_sq: "Siding wall area (SQ)",
  gutter_guard_lf: "Gutter guard (LF)",
  warning_missing_carrier_data: "Missing carrier data",
  warning_missing_measurement_data: "Missing measurement data",
};
