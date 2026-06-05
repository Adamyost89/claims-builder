import type { DocumentType, ParserType } from "@prisma/client";

import type { DocumentParser } from "@/lib/parsers/types";

import { carrierEstimateParser } from "./carrier-estimate";
import { eagleviewParser, gafParser, hoverParser } from "./measurement-report";
import { itelParser } from "./itel";

const PARSERS: DocumentParser[] = [
  carrierEstimateParser,
  eagleviewParser,
  hoverParser,
  gafParser,
  itelParser,
];

const DOCUMENT_TYPE_TO_PARSER: Partial<Record<DocumentType, ParserType>> = {
  CARRIER_ESTIMATE: "CARRIER_ESTIMATE",
  CONTRACTOR_ESTIMATE: "CARRIER_ESTIMATE",
  EAGLEVIEW: "EAGLEVIEW",
  HOVER: "HOVER",
  GAF: "GAF",
  ITEL: "ITEL",
};

export function resolveParserType(documentType: DocumentType): ParserType | null {
  return DOCUMENT_TYPE_TO_PARSER[documentType] ?? null;
}

export function getParser(parserType: ParserType): DocumentParser | null {
  return PARSERS.find((p) => p.parserType === parserType) ?? null;
}

export function getParserForDocumentType(documentType: DocumentType): DocumentParser | null {
  const parserType = resolveParserType(documentType);
  if (!parserType) {
    return null;
  }
  return getParser(parserType);
}

export function listRegisteredParsers(): DocumentParser[] {
  return PARSERS;
}
