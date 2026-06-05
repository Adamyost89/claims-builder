import type { ExtractionMethod } from "@prisma/client";

import { prisma } from "@/lib/db";

import type { ProvenanceValue } from "./types";
import { assertProvenanceComplete } from "./types";

export type CreateExtractionInput = {
  documentId: string;
  claimId: string;
  fieldName: string;
  provenance: ProvenanceValue;
};

/**
 * Persist a provenance-backed extraction row (Phase 2B parsers call this).
 */
export async function createDocumentExtraction(input: CreateExtractionInput) {
  if (!assertProvenanceComplete(input.provenance)) {
    throw new Error(
      `Extraction for ${input.fieldName} is missing required provenance fields.`,
    );
  }

  return prisma.documentExtraction.create({
    data: {
      documentId: input.documentId,
      claimId: input.claimId,
      fieldName: input.fieldName,
      fieldValue: String(input.provenance.value),
      sourcePage: input.provenance.sourcePage,
      sourceText: input.provenance.sourceText ?? null,
      confidence: input.provenance.confidence,
      extractionMethod: input.provenance.extractionMethod,
    },
  });
}

export async function getExtractionsForDocument(documentId: string) {
  return prisma.documentExtraction.findMany({
    where: { documentId },
    orderBy: [{ fieldName: "asc" }, { sourcePage: "asc" }],
  });
}

export function toProvenanceValue(extraction: {
  fieldValue: string;
  documentId: string;
  sourcePage: number | null;
  extractionMethod: ExtractionMethod;
  confidence: number;
  sourceText: string | null;
}): ProvenanceValue {
  const numeric = Number(extraction.fieldValue);
  const value = Number.isFinite(numeric) ? numeric : extraction.fieldValue;

  return {
    value: value as string & number,
    sourceDocumentId: extraction.documentId,
    sourcePage: extraction.sourcePage,
    extractionMethod: extraction.extractionMethod,
    confidence: extraction.confidence,
    sourceText: extraction.sourceText,
  };
}
