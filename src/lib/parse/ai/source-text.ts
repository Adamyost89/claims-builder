import type { ExtractedPage } from "@/lib/parsers/types";

/** Collapse whitespace for fuzzy substring matching against OCR/noisy PDF text. */
export function normalizeSourceText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function sourceTextExistsInDocument(
  pages: ExtractedPage[],
  fullText: string,
  sourceText: string,
): boolean {
  const needle = normalizeSourceText(sourceText);
  if (needle.length === 0) {
    return false;
  }

  if (normalizeSourceText(fullText).includes(needle)) {
    return true;
  }

  for (const page of pages) {
    if (normalizeSourceText(page.text).includes(needle)) {
      return true;
    }
  }

  return false;
}

export function findSourcePage(
  pages: ExtractedPage[],
  sourceText: string,
): number | null {
  const needle = normalizeSourceText(sourceText);
  for (const page of pages) {
    if (normalizeSourceText(page.text).includes(needle)) {
      return page.pageNumber;
    }
  }
  return pages[0]?.pageNumber ?? null;
}
