import { DocumentType, MeasurementVendor, ParserType } from "@prisma/client";

import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import { scoreMatchConfidence } from "@/lib/parsers/confidence";
import type {
  DocumentParser,
  ParsedMeasurement,
  ParserInput,
  ParseResult,
} from "@/lib/parsers/types";
import { buildProvenance } from "@/lib/parsers/types";

import { extractMeasurementFromText } from "./shared";

const MEASUREMENT_PATTERNS = [
  {
    regex: /(?:Total\s+Roof\s+Area|Roof\s+Area|Total\s+Area)\s*[:\s]+([\d,]+(?:\.\d+)?)\s*(?:SQ|squares?)/i,
    key: MEASUREMENT_KEYS.ROOF_AREA_SQ,
    unit: "SQ",
  },
  {
    regex: /(?:Eaves?|Eave\s+Length)\s*[:\s]+([\d,]+(?:\.\d+)?)\s*(?:LF|ft|')/i,
    key: MEASUREMENT_KEYS.EAVE_LF,
    unit: "LF",
  },
  {
    regex: /(?:Rakes?|Rake\s+Length)\s*[:\s]+([\d,]+(?:\.\d+)?)\s*(?:LF|ft|')/i,
    key: MEASUREMENT_KEYS.RAKE_LF,
    unit: "LF",
  },
  {
    regex: /(?:Ridges?|Ridge\s+Length)\s*[:\s]+([\d,]+(?:\.\d+)?)\s*(?:LF|ft|')/i,
    key: MEASUREMENT_KEYS.RIDGE_LF,
    unit: "LF",
  },
  {
    regex: /(?:Hips?|Hip\s+Length)\s*[:\s]+([\d,]+(?:\.\d+)?)\s*(?:LF|ft|')/i,
    key: MEASUREMENT_KEYS.HIP_LF,
    unit: "LF",
  },
  {
    regex: /(?:Valleys?|Valley\s+Length)\s*[:\s]+([\d,]+(?:\.\d+)?)\s*(?:LF|ft|')/i,
    key: MEASUREMENT_KEYS.VALLEY_LF,
    unit: "LF",
  },
  {
    regex: /(?:Waste|Suggested\s+Waste)\s*[:\s]+([\d,]+(?:\.\d+)?)\s*%/i,
    key: MEASUREMENT_KEYS.WASTE_PCT,
    unit: "PCT",
  },
];

function createMeasurementParser(
  parserType: ParserType,
  vendor: MeasurementVendor,
  supportedTypes: DocumentType[],
): DocumentParser {
  return {
    parserType,
    supportedTypes,
    parse(input: ParserInput): ParseResult {
      const raw = extractMeasurementFromText({
        pages: input.pages,
        documentId: input.documentId,
        patterns: MEASUREMENT_PATTERNS,
      });

      const measurements: ParsedMeasurement[] = raw.map((item) => {
        const confidence = scoreMatchConfidence({
          matched: true,
          groupsComplete: true,
          lineQuality: "strong",
        });
        const adjusted = input.parserCertified ? confidence : Math.min(confidence, 0.84);
        return {
          key: item.key,
          value: item.value,
          unit: item.unit,
          provenance: buildProvenance({
            value: item.value,
            documentId: input.documentId,
            sourcePage: item.sourcePage,
            sourceText: item.sourceText,
            confidence: adjusted,
          }),
        };
      });

      const overallConfidence =
        measurements.length > 0
          ? measurements.reduce((s, m) => s + m.provenance.confidence, 0) / measurements.length
          : 0.35;

      return {
        parserType,
        lineItems: [],
        measurements,
        fields: [
          {
            fieldName: "measurement_vendor",
            provenance: buildProvenance({
              value: vendor,
              documentId: input.documentId,
              sourcePage: 1,
              sourceText: vendor,
              confidence: 1,
            }),
          },
        ],
        overallConfidence,
        warnings:
          measurements.length === 0
            ? [`No ${vendor} measurement keys matched heuristic patterns.`]
            : [],
      };
    },
  };
}

export const eagleviewParser = createMeasurementParser(
  ParserType.EAGLEVIEW,
  MeasurementVendor.EAGLEVIEW,
  [DocumentType.EAGLEVIEW],
);

export const hoverParser = createMeasurementParser(
  ParserType.HOVER,
  MeasurementVendor.HOVER,
  [DocumentType.HOVER],
);

export const gafParser = createMeasurementParser(
  ParserType.GAF,
  MeasurementVendor.GAF,
  [DocumentType.GAF],
);
