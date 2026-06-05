import { DocumentType, ParserType } from "@prisma/client";

import type { DocumentParser, ParserInput, ParseResult } from "@/lib/parsers/types";
import { buildProvenance } from "@/lib/parsers/types";

/**
 * ITEL framework stub — no reliable fixture yet.
 * Returns structured placeholder requiring human review.
 */
export const itelParser: DocumentParser = {
  parserType: ParserType.ITEL,
  supportedTypes: [DocumentType.ITEL],
  parse(input: ParserInput): ParseResult {
    const hasItelMarker = /itel|pricing\s+system|test\s+report/i.test(input.fullText);

    return {
      parserType: ParserType.ITEL,
      lineItems: [],
      measurements: [],
      fields: [
        {
          fieldName: "itel_framework_status",
          provenance: buildProvenance({
            value: hasItelMarker ? "detected_marker" : "no_marker",
            documentId: input.documentId,
            sourcePage: input.pages[0]?.pageNumber ?? 1,
            sourceText: hasItelMarker
              ? "ITEL marker text detected — manual review required"
              : "ITEL parser framework only — no fields extracted",
            confidence: 0.5,
          }),
        },
      ],
      overallConfidence: 0.5,
      warnings: [
        "ITEL parser is framework-only until fixture tests are available. All values require human review.",
      ],
    };
  },
};
