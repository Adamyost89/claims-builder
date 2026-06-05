import { describe, expect, it } from "vitest";

import { CARRIER_FIXTURE } from "@/lib/parsers/fixtures/carrier";
import { carrierEstimateParser } from "@/server/parsers/carrier-estimate";

describe("carrier estimate parser", () => {
  it("creates line items with full provenance fields", () => {
    const result = carrierEstimateParser.parse({
      documentId: "doc-1",
      claimId: "claim-1",
      documentType: "CARRIER_ESTIMATE",
      fileName: "estimate.txt",
      pages: CARRIER_FIXTURE.pages,
      fullText: CARRIER_FIXTURE.pages.map((p) => p.text).join("\n"),
      parserCertified: true,
    });

    expect(result.lineItems.length).toBeGreaterThanOrEqual(3);

    const shingle = result.lineItems.find((item) =>
      item.description.toLowerCase().includes("laminated"),
    );
    expect(shingle).toBeTruthy();
    expect(shingle!.quantity).toBe(24);
    expect(shingle!.unit).toBe("SQ");
    expect(shingle!.provenance.sourceDocumentId).toBe("doc-1");
    expect(shingle!.provenance.sourcePage).toBe(1);
    expect(shingle!.provenance.sourceText).toBeTruthy();
    expect(shingle!.provenance.extractionMethod).toBe("HEURISTIC");
    expect(shingle!.provenance.confidence).toBeGreaterThan(0);
  });

  it("caps confidence when parser is not certified", () => {
    const result = carrierEstimateParser.parse({
      documentId: "doc-1",
      claimId: "claim-1",
      documentType: "CARRIER_ESTIMATE",
      fileName: "estimate.txt",
      pages: CARRIER_FIXTURE.pages,
      fullText: CARRIER_FIXTURE.pages.map((p) => p.text).join("\n"),
      parserCertified: false,
    });

    for (const item of result.lineItems) {
      expect(item.provenance.confidence).toBeLessThanOrEqual(0.84);
    }
  });
});
