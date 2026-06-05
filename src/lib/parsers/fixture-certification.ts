import type { ParserType } from "@prisma/client";

import {
  evaluateParserCertified,
  PARSER_CERTIFICATION_THRESHOLDS,
  updateParserCertification,
} from "@/lib/parsers/certification";
import type { FixtureCase } from "@/lib/parsers/types";
import { getParser } from "@/server/parsers/registry";

import { CARRIER_FIXTURE } from "./fixtures/carrier";
import { EAGLEVIEW_FIXTURE } from "./fixtures/eagleview";
import { GAF_FIXTURE } from "./fixtures/gaf";
import { HOVER_FIXTURE } from "./fixtures/hover";

export const PARSER_FIXTURES: FixtureCase[] = [
  CARRIER_FIXTURE,
  EAGLEVIEW_FIXTURE,
  HOVER_FIXTURE,
  GAF_FIXTURE,
];

export type FixtureRunResult = {
  parserType: ParserType;
  accuracy: number;
  passed: number;
  total: number;
  parserCertified: boolean;
  requiredAccuracy: number;
};

export function runFixtureCase(fixture: FixtureCase): FixtureRunResult {
  const parser = getParser(fixture.parserType);
  if (!parser) {
    throw new Error(`No parser for ${fixture.parserType}`);
  }

  const result = parser.parse({
    documentId: "fixture-doc",
    claimId: "fixture-claim",
    documentType: parser.supportedTypes[0],
    fileName: `${fixture.id}.txt`,
    pages: fixture.pages,
    fullText: fixture.pages.map((p) => p.text).join("\n"),
    parserCertified: true,
  });

  let passed = 0;
  let total = 0;

  if (fixture.expected.lineItemDescriptions?.length) {
    for (const expectedDesc of fixture.expected.lineItemDescriptions) {
      total += 1;
      if (
        result.lineItems.some((item) =>
          item.description.toLowerCase().includes(expectedDesc.toLowerCase()),
        )
      ) {
        passed += 1;
      }
    }
  }

  if (fixture.expected.measurementKeys?.length) {
    for (const key of fixture.expected.measurementKeys) {
      total += 1;
      if (result.measurements.some((m) => m.key === key)) {
        passed += 1;
      }
    }
  }

  if (fixture.expected.fieldNames?.length) {
    for (const field of fixture.expected.fieldNames) {
      total += 1;
      if (result.fields.some((f) => f.fieldName === field)) {
        passed += 1;
      }
    }
  }

  const accuracy = total > 0 ? passed / total : 0;
  const requiredAccuracy = PARSER_CERTIFICATION_THRESHOLDS[fixture.parserType];
  const parserCertified = evaluateParserCertified(fixture.parserType, accuracy);

  return {
    parserType: fixture.parserType,
    accuracy,
    passed,
    total,
    parserCertified,
    requiredAccuracy,
  };
}

export async function certifyParserFromFixtures(parserType: ParserType) {
  const fixtures = PARSER_FIXTURES.filter((f) => f.parserType === parserType);
  if (fixtures.length === 0) {
    return null;
  }

  const results = fixtures.map(runFixtureCase);
  const passed = results.reduce((s, r) => s + r.passed, 0);
  const total = results.reduce((s, r) => s + r.total, 0);
  const accuracy = total > 0 ? passed / total : 0;

  return updateParserCertification(
    parserType,
    accuracy,
    `Fixture run: ${passed}/${total} checks passed.`,
  );
}

export async function certifyAllParserFixtures() {
  const types = [...new Set(PARSER_FIXTURES.map((f) => f.parserType))];
  return Promise.all(types.map((t) => certifyParserFromFixtures(t)));
}
