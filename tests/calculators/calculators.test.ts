import { describe, expect, it } from "vitest";

import {
  calculateDripEdgeLf,
  calculateGutterGuardLf,
  calculateIceAndWaterEaveSf,
  calculateRidgeCapLf,
  calculateRoofAreaSq,
  calculateStarterEaveLf,
  calculateValleyIceAndWaterSf,
} from "@/lib/calculators";

describe("calculator library", () => {
  it("roof area calculator returns SQ and formula", () => {
    const result = calculateRoofAreaSq({ roofAreaSq: 24.33 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(24.33);
      expect(result.unit).toBe("SQ");
      expect(result.formula).toBe("roof_area_sq = 24.33");
    }
  });

  it("starter eave calculator returns eave LF", () => {
    const result = calculateStarterEaveLf({ eaveLf: 156 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(156);
      expect(result.formula).toBe("starter_eave_lf = eave_lf (156)");
    }
  });

  it("ridge cap calculator sums ridge and hip LF", () => {
    const result = calculateRidgeCapLf({ ridgeLf: 42, hipLf: 18 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(60);
      expect(result.formula).toBe("ridge_cap_lf = ridge_lf (42) + hip_lf (18)");
    }
  });

  it("IWS eave calculator multiplies eave LF by course width", () => {
    const result = calculateIceAndWaterEaveSf({ eaveLf: 156, courseWidthFt: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(468);
      expect(result.formula).toBe(
        "ice_and_water_eave_sf = eave_lf (156) × course_width_ft (3)",
      );
    }
  });

  it("drip edge calculator sums eave and rake LF", () => {
    const result = calculateDripEdgeLf({ eaveLf: 156, rakeLf: 84 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(240);
    }
  });

  it("valley IWS calculator multiplies valley LF by course width", () => {
    const result = calculateValleyIceAndWaterSf({ valleyLf: 18, courseWidthFt: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(54);
    }
  });

  it("gutter guard calculator equals eave LF", () => {
    const result = calculateGutterGuardLf({ eaveLf: 140 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(140);
    }
  });

  it("rejects missing inputs", () => {
    const result = calculateRoofAreaSq({ roofAreaSq: Number.NaN });
    expect(result.ok).toBe(false);
  });
});
