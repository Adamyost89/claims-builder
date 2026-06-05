import { DocumentType, ParserType } from "@prisma/client";

import { scoreMatchConfidence } from "@/lib/parsers/confidence";
import type { DocumentParser, ParserInput, ParseResult } from "@/lib/parsers/types";
import { buildProvenance } from "@/lib/parsers/types";

import { findPageForText, lineItemProvenance } from "./shared";

/** Heuristic Xactimate-style line: description ... qty unit [price] */
const LINE_PATTERN =
  /^(\d{1,4})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(SQ|LF|SF|EA|SQFT|BD|GL|HR|DA|MO|WK|CY|TN|CF|GAL)\b/im;

const ALT_LINE_PATTERN =
  /^(.{10,80}?)\s+(\d+(?:\.\d+)?)\s+(SQ|LF|SF|EA)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/im;

export const carrierEstimateParser: DocumentParser = {
  parserType: ParserType.CARRIER_ESTIMATE,
  supportedTypes: [DocumentType.CARRIER_ESTIMATE, DocumentType.CONTRACTOR_ESTIMATE],
  parse(input: ParserInput): ParseResult {
    const lineItems: ParseResult["lineItems"] = [];
    const warnings: string[] = [];

    for (const page of input.pages) {
      const lines = page.text.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length < 8) {
          continue;
        }

        let description = "";
        let quantity = 0;
        let unit = "";
        let unitPrice: number | undefined;
        let total: number | undefined;
        let lineCode: string | undefined;
        let confidence = 0.7;

        const codeMatch = line.match(LINE_PATTERN);
        if (codeMatch) {
          lineCode = codeMatch[1];
          description = codeMatch[2].trim();
          quantity = Number.parseFloat(codeMatch[3]);
          unit = codeMatch[4];
          confidence = scoreMatchConfidence({
            matched: true,
            groupsComplete: true,
            lineQuality: "strong",
          });
        } else {
          const altMatch = line.match(ALT_LINE_PATTERN);
          if (!altMatch) {
            continue;
          }
          description = altMatch[1].trim();
          quantity = Number.parseFloat(altMatch[2]);
          unit = altMatch[3];
          unitPrice = Number.parseFloat(altMatch[4]);
          total = Number.parseFloat(altMatch[5]);
          confidence = scoreMatchConfidence({
            matched: true,
            groupsComplete: true,
            lineQuality: "moderate",
          });
        }

        if (!description || !Number.isFinite(quantity)) {
          continue;
        }

        const sourceText = line;
        lineItems.push({
          description,
          quantity,
          unit,
          unitPrice,
          total,
          lineCode,
          category: inferCategory(description),
          provenance: lineItemProvenance({
            documentId: input.documentId,
            sourcePage: page.pageNumber,
            sourceText,
            confidence: input.parserCertified ? confidence : Math.min(confidence, 0.84),
            quantity,
          }),
        });
      }
    }

    if (lineItems.length === 0) {
      warnings.push("No estimate line items matched heuristic patterns.");
    }

    const overallConfidence =
      lineItems.length > 0
        ? lineItems.reduce((sum, item) => sum + item.provenance.confidence, 0) /
          lineItems.length
        : 0.4;

    return {
      parserType: ParserType.CARRIER_ESTIMATE,
      lineItems,
      measurements: [],
      fields: [
        {
          fieldName: "line_item_count",
          provenance: buildProvenance({
            value: lineItems.length,
            documentId: input.documentId,
            sourcePage: findPageForText(input.pages, lineItems[0]?.provenance.sourceText ?? ""),
            sourceText: `Detected ${lineItems.length} line items`,
            confidence: overallConfidence,
          }),
        },
      ],
      overallConfidence,
      warnings,
    };
  },
};

function inferCategory(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("shingle") || lower.includes("roof")) {
    return "ROOFING";
  }
  if (lower.includes("drip") || lower.includes("starter") || lower.includes("ridge")) {
    return "ROOFING_ACCESSORY";
  }
  if (lower.includes("siding")) {
    return "SIDING";
  }
  return "GENERAL";
}
