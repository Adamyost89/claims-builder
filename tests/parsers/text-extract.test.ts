import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  extractPdfText,
  extractTextFromDocument,
} from "@/server/parsers/text-extract";
import { saveClaimFile } from "@/server/storage/adapter";

describe("text extraction", () => {
  it("extracts PDF pages with page numbers", async () => {
    const fixturePath = join(process.cwd(), "tests", "fixtures", "sample.pdf");
    const buffer = readFileSync(fixturePath);
    const result = await extractPdfText(buffer);

    expect(result.pages.length).toBe(2);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[1].pageNumber).toBe(2);
    expect(result.pages[0].text.length).toBeGreaterThan(0);
    expect(result.fullText).toContain(result.pages[0].text);
  });

  it("extracts plain text documents with a single numbered page", async () => {
    const stored = await saveClaimFile({
      claimId: "text-extract-test",
      fileName: "carrier-estimate.txt",
      buffer: Buffer.from("Page one content\nLine 2"),
    });

    const result = await extractTextFromDocument({
      storageKey: stored.storageKey,
      mimeType: "text/plain",
      fileName: "carrier-estimate.txt",
    });

    expect(result.pages).toEqual([
      { pageNumber: 1, text: "Page one content\nLine 2" },
    ]);
  });
});
