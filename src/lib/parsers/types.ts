import type { DocumentType, ExtractionMethod, ParserType } from "@prisma/client";

import type { ProvenanceValue } from "@/lib/provenance/types";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export type TextExtractionResult = {
  pages: ExtractedPage[];
  fullText: string;
};

export type ParserInput = {
  documentId: string;
  claimId: string;
  documentType: DocumentType;
  fileName: string;
  pages: ExtractedPage[];
  fullText: string;
  parserCertified: boolean;
};

export type ParsedLineItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  total?: number;
  category?: string;
  lineCode?: string;
  provenance: ProvenanceValue;
};

export type ParsedMeasurement = {
  key: string;
  value: number;
  unit: string;
  provenance: ProvenanceValue;
};

export type ParsedField = {
  fieldName: string;
  provenance: ProvenanceValue;
};

export type ParseResult = {
  parserType: ParserType;
  lineItems: ParsedLineItem[];
  measurements: ParsedMeasurement[];
  fields: ParsedField[];
  overallConfidence: number;
  warnings: string[];
};

export type DocumentParser = {
  parserType: ParserType;
  supportedTypes: DocumentType[];
  parse(input: ParserInput): ParseResult;
};

export type FixtureCase = {
  id: string;
  parserType: ParserType;
  pages: ExtractedPage[];
  expected: {
    lineItemDescriptions?: string[];
    measurementKeys?: string[];
    fieldNames?: string[];
  };
};

export function buildProvenance(input: {
  value: string | number;
  documentId: string;
  sourcePage: number | null;
  sourceText: string;
  confidence: number;
  method?: ExtractionMethod;
}): ProvenanceValue<string | number> {
  return {
    value: input.value,
    sourceDocumentId: input.documentId,
    sourcePage: input.sourcePage,
    sourceText: input.sourceText,
    confidence: input.confidence,
    extractionMethod: input.method ?? "HEURISTIC",
  };
}
