import { GOLDEN_CLAIM_FIXTURES } from "./golden";

export type RuleFixtureExpectation = {
  ruleTitlePart: string;
  shouldTriggerOnFixtureIds: string[];
  shouldNotTriggerOnFixtureIds?: string[];
};

/** Maps seeded system rules to golden fixtures that must trigger them. */
export const RULE_FIXTURE_MATRIX: RuleFixtureExpectation[] = [
  {
    ruleTitlePart: "Starter separation",
    shouldTriggerOnFixtureIds: ["starter-omitted-eave", "no-rake-starter-auto"],
  },
  {
    ruleTitlePart: "Felt / underlayment",
    shouldTriggerOnFixtureIds: ["oc-felt-synthetic-review"],
  },
  {
    ruleTitlePart: "Measurement comparison variance",
    shouldTriggerOnFixtureIds: [
      "roof-area-deficiency",
      "ridge-cap-deficiency",
      "drip-edge-deficiency",
      "iws-eave-deficiency",
      "valley-iws-deficiency",
      "siding-wall-deficiency",
      "gutter-guard-deficiency",
      "waste-comparison-deficiency",
      "installation-insufficiency",
    ],
  },
  {
    ruleTitlePart: "Omitted line items",
    shouldTriggerOnFixtureIds: [
      "starter-omitted-eave",
      "omitted-item-measurement-only",
      "estimate-inconsistency-accessories",
    ],
  },
];

export function getFixturesForRule(ruleTitlePart: string) {
  const entry = RULE_FIXTURE_MATRIX.find((r) => r.ruleTitlePart === ruleTitlePart);
  if (!entry) {
    return [];
  }
  return GOLDEN_CLAIM_FIXTURES.filter((f) => entry.shouldTriggerOnFixtureIds.includes(f.id));
}
