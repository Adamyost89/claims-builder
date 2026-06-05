import type { ExtractionMethod } from "@prisma/client";

/**
 * Every parsed value in Phase 2B+ must carry full provenance.
 * DocumentExtraction rows persist this shape in the database.
 */
export type ProvenanceValue<T extends string | number = string | number> = {
  value: T;
  sourceDocumentId: string;
  sourcePage: number | null;
  extractionMethod: ExtractionMethod;
  confidence: number;
  sourceText?: string | null;
};

export type ProvenanceField = {
  fieldName: string;
  provenance: ProvenanceValue;
};

export function assertProvenanceComplete(
  provenance: Partial<ProvenanceValue>,
): provenance is ProvenanceValue {
  return (
    provenance.value !== undefined &&
    provenance.value !== null &&
    typeof provenance.sourceDocumentId === "string" &&
    provenance.sourceDocumentId.length > 0 &&
    typeof provenance.extractionMethod === "string" &&
    typeof provenance.confidence === "number" &&
    provenance.confidence >= 0 &&
    provenance.confidence <= 1
  );
}
