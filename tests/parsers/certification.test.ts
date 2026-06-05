import { describe, expect, it } from "vitest";
import { ParserType } from "@prisma/client";

import {
  evaluateParserCertified,
  PARSER_CERTIFICATION_THRESHOLDS,
} from "@/lib/parsers/certification";

describe("parser certification", () => {
  it("defines required fixture accuracy thresholds", () => {
    expect(PARSER_CERTIFICATION_THRESHOLDS.CARRIER_ESTIMATE).toBe(0.95);
    expect(PARSER_CERTIFICATION_THRESHOLDS.EAGLEVIEW).toBe(0.99);
    expect(PARSER_CERTIFICATION_THRESHOLDS.HOVER).toBe(0.99);
    expect(PARSER_CERTIFICATION_THRESHOLDS.GAF).toBe(0.99);
    expect(PARSER_CERTIFICATION_THRESHOLDS.ITEL).toBe(0.95);
  });

  it("marks parser uncertified when below threshold", () => {
    expect(evaluateParserCertified(ParserType.EAGLEVIEW, 0.98)).toBe(false);
    expect(evaluateParserCertified(ParserType.EAGLEVIEW, 0.99)).toBe(true);
    expect(evaluateParserCertified(ParserType.CARRIER_ESTIMATE, 0.94)).toBe(false);
    expect(evaluateParserCertified(ParserType.CARRIER_ESTIMATE, 0.95)).toBe(true);
    expect(evaluateParserCertified(ParserType.ITEL, null)).toBe(false);
  });
});
