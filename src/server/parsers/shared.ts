import type { ExtractedPage } from "@/lib/parsers/types";
import { buildProvenance } from "@/lib/parsers/types";

export function findPageForText(pages: ExtractedPage[], snippet: string): number | null {
  for (const page of pages) {
    if (page.text.includes(snippet)) {
      return page.pageNumber;
    }
  }
  return pages[0]?.pageNumber ?? null;
}

export function extractMeasurementFromText(input: {
  pages: ExtractedPage[];
  documentId: string;
  patterns: { regex: RegExp; key: string; unit: string; group?: number }[];
}): {
  key: string;
  value: number;
  unit: string;
  sourceText: string;
  sourcePage: number | null;
  confidence: number;
}[] {
  const fullText = input.pages.map((p) => p.text).join("\n");
  const results: ReturnType<typeof extractMeasurementFromText> = [];

  for (const pattern of input.patterns) {
    const match = fullText.match(pattern.regex);
    if (!match) {
      continue;
    }
    const rawValue = match[pattern.group ?? 1];
    const value = Number.parseFloat(rawValue.replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      continue;
    }
    const sourceText = match[0].trim();
    results.push({
      key: pattern.key,
      value,
      unit: pattern.unit,
      sourceText,
      sourcePage: findPageForText(input.pages, sourceText),
      confidence: 0.9,
    });
  }

  return results;
}

export function lineItemProvenance(input: {
  documentId: string;
  sourcePage: number | null;
  sourceText: string;
  confidence: number;
  quantity: number;
}) {
  return buildProvenance({
    value: input.quantity,
    documentId: input.documentId,
    sourcePage: input.sourcePage,
    sourceText: input.sourceText,
    confidence: input.confidence,
  });
}
