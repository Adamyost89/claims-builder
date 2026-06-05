import { describe, expect, it } from "vitest";

import { EAGLEVIEW_FIXTURE } from "@/lib/parsers/fixtures/eagleview";
import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import { eagleviewParser } from "@/server/parsers/measurement-report";

describe("measurement report parser", () => {
  it("maps values to canonical measurement keys with provenance", () => {
    const result = eagleviewParser.parse({
      documentId: "doc-ev",
      claimId: "claim-1",
      documentType: "EAGLEVIEW",
      fileName: "eagleview.txt",
      pages: EAGLEVIEW_FIXTURE.pages,
      fullText: EAGLEVIEW_FIXTURE.pages.map((p) => p.text).join("\n"),
      parserCertified: true,
    });

    const keys = result.measurements.map((m) => m.key);
    expect(keys).toContain(MEASUREMENT_KEYS.ROOF_AREA_SQ);
    expect(keys).toContain(MEASUREMENT_KEYS.EAVE_LF);
    expect(keys).toContain(MEASUREMENT_KEYS.RIDGE_LF);
    expect(keys).toContain(MEASUREMENT_KEYS.VALLEY_LF);

    const roofArea = result.measurements.find(
      (m) => m.key === MEASUREMENT_KEYS.ROOF_AREA_SQ,
    );
    expect(roofArea?.value).toBe(24.33);
    expect(roofArea?.unit).toBe("SQ");
    expect(roofArea?.provenance.sourceDocumentId).toBe("doc-ev");
    expect(roofArea?.provenance.sourceText).toMatch(/Total Roof Area/i);
  });
});
