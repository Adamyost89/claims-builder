import { describe, expect, it } from "vitest";

import { GOLDEN_CLAIM_FIXTURES } from "@/lib/issues/fixtures/golden";
import {
  assertRejectedPendingExcluded,
  runGoldenFixture,
} from "@/lib/issues/fixtures/runner";
import { RULE_FIXTURE_MATRIX } from "@/lib/issues/fixtures/rule-matrix";

describe("golden claim fixtures", () => {
  it("defines all 15 required scenarios", () => {
    expect(GOLDEN_CLAIM_FIXTURES).toHaveLength(15);
    const ids = GOLDEN_CLAIM_FIXTURES.map((f) => f.id);
    expect(ids).toContain("starter-omitted-eave");
    expect(ids).toContain("no-rake-starter-auto");
    expect(ids).toContain("oc-felt-synthetic-review");
    expect(ids).toContain("zero-issue-claim");
  });

  for (const fixture of GOLDEN_CLAIM_FIXTURES) {
    it(`passes golden fixture: ${fixture.id}`, () => {
      const { result } = runGoldenFixture(fixture);
      if (result.failures.length > 0) {
        const details = result.failures.map((f) => `${f.type}: ${f.message}`).join("; ");
        throw new Error(`Fixture ${fixture.id} failed: ${details}`);
      }
      expect(result.accuracy).toBe(1);
    });
  }

  it("excludes rejected and pending parsed rows from fixture context", () => {
    for (const fixture of GOLDEN_CLAIM_FIXTURES) {
      expect(assertRejectedPendingExcluded(fixture)).toBe(true);
    }
  });

  it("rule fixture matrix references valid golden fixtures", () => {
    const ids = new Set(GOLDEN_CLAIM_FIXTURES.map((f) => f.id));
    for (const row of RULE_FIXTURE_MATRIX) {
      for (const fixtureId of row.shouldTriggerOnFixtureIds) {
        expect(ids.has(fixtureId)).toBe(true);
      }
    }
  });
});
