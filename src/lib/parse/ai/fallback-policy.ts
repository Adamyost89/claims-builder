import { DocumentType } from "@prisma/client";

import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import type { ParseResult } from "@/lib/parsers/types";

export const UNKNOWN_FORMAT_WARNING = "Unknown document format detected.";

const CARRIER_TYPES: DocumentType[] = [
  DocumentType.CARRIER_ESTIMATE,
  DocumentType.CONTRACTOR_ESTIMATE,
];

const MEASUREMENT_TYPES: DocumentType[] = [
  DocumentType.EAGLEVIEW,
  DocumentType.HOVER,
  DocumentType.GAF,
];

export function isCarrierDocumentType(type: DocumentType): boolean {
  return CARRIER_TYPES.includes(type);
}

export function isMeasurementDocumentType(type: DocumentType): boolean {
  return MEASUREMENT_TYPES.includes(type);
}

export function hasUnknownFormatWarning(warnings: string[]): boolean {
  return warnings.some(
    (w) =>
      w.includes(UNKNOWN_FORMAT_WARNING) ||
      w.toLowerCase().includes("unknown format"),
  );
}

export function shouldTriggerAiFallback(input: {
  documentType: DocumentType;
  parseResult: ParseResult;
  threshold: number;
}): boolean {
  const { documentType, parseResult, threshold } = input;

  if (isCarrierDocumentType(documentType)) {
    if (parseResult.lineItems.length === 0) {
      return true;
    }
    if (parseResult.overallConfidence < threshold) {
      return true;
    }
    if (hasUnknownFormatWarning(parseResult.warnings)) {
      return true;
    }
    return false;
  }

  if (isMeasurementDocumentType(documentType)) {
    if (parseResult.measurements.length === 0) {
      return true;
    }
    const hasRoofArea = parseResult.measurements.some(
      (m) => m.key === MEASUREMENT_KEYS.ROOF_AREA_SQ,
    );
    if (!hasRoofArea) {
      return true;
    }
    if (parseResult.overallConfidence < threshold) {
      return true;
    }
    if (hasUnknownFormatWarning(parseResult.warnings)) {
      return true;
    }
    return false;
  }

  return false;
}
