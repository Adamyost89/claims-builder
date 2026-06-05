import { describe, expect, it } from "vitest";

import {
  runAllExportGates,
  runAllGenerationGates,
  runGenerationGateG1,
} from "@/lib/gates/workflow-gates";

const missingClaimId = "non-existent-claim-id";

describe("workflow gates", () => {
  it("returns gate result structure for a missing claim", async () => {
    const result = await runGenerationGateG1(missingClaimId);
    expect(result.gateId).toBe("G1");
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0]).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
      severity: "error",
    });
  });

  it("returns arrays for bundled generation and export gates", async () => {
    const generation = await runAllGenerationGates(missingClaimId);
    const exportGates = await runAllExportGates(missingClaimId);

    expect(generation).toHaveLength(5);
    expect(exportGates).toHaveLength(5);

    for (const gate of [...generation, ...exportGates]) {
      expect(gate).toMatchObject({
        gateId: expect.stringMatching(/^[GE][1-5]$/),
        passed: expect.any(Boolean),
        blockers: expect.any(Array),
      });
    }
  });
});