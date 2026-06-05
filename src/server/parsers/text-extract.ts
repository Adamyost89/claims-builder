import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";

import { readClaimFile } from "@/server/storage/adapter";

import type { ExtractedPage, TextExtractionResult } from "@/lib/parsers/types";

export async function extractTextFromDocument(input: {
  storageKey: string;
  mimeType: string;
  fileName: string;
}): Promise<TextExtractionResult> {
  const buffer = await readClaimFile(input.storageKey);

  if (input.mimeType === "application/pdf") {
    return extractPdfText(buffer);
  }

  if (
    input.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText(buffer);
  }

  if (
    input.mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return extractXlsxText(buffer);
  }

  if (input.mimeType === "text/plain" || input.fileName.endsWith(".txt")) {
    const fullText = buffer.toString("utf8");
    return { pages: [{ pageNumber: 1, text: fullText }], fullText };
  }

  throw new Error(`Text extraction not supported for MIME type: ${input.mimeType}`);
}

export async function extractPdfText(buffer: Buffer): Promise<TextExtractionResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [String(text ?? "")];

  const pages: ExtractedPage[] = pageTexts.map((pageText, index) => ({
    pageNumber: index + 1,
    text: pageText,
  }));

  if (pages.length === 0 && totalPages > 0) {
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      pages.push({ pageNumber, text: "" });
    }
  }

  const fullText = pages.map((p) => p.text).join("\n\n");
  return { pages, fullText };
}

async function extractDocxText(buffer: Buffer): Promise<TextExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  const fullText = result.value ?? "";
  return { pages: [{ pageNumber: 1, text: fullText }], fullText };
}

function extractXlsxText(buffer: Buffer): TextExtractionResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const pages: ExtractedPage[] = [];
  let pageNumber = 1;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    pages.push({
      pageNumber,
      text: `Sheet: ${sheetName}\n${csv}`,
    });
    pageNumber += 1;
  }

  const fullText = pages.map((p) => p.text).join("\n\n");
  return { pages, fullText };
}
