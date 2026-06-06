import type { DocumentType } from "@prisma/client";

import type { ExtractedPage, ParseResult } from "@/lib/parsers/types";

import {
  convertCarrierAiExtraction,
  convertMeasurementAiExtraction,
  mergeAiIntoParseResult,
  type BlockedAiExtraction,
} from "./convert";
import {
  isCarrierDocumentType,
  isMeasurementDocumentType,
  shouldTriggerAiFallback,
} from "./fallback-policy";
import { aiCarrierExtractionSchema, aiMeasurementExtractionSchema } from "./schemas";
import { runAiExtraction } from "./service";

export type AiFallbackResult = {
  parseResult: ParseResult;
  blockedExtractions: BlockedAiExtraction[];
  aiApplied: boolean;
};

export async function runAiParseFallback(input: {
  documentId: string;
  claimId: string;
  documentType: DocumentType;
  pages: ExtractedPage[];
  fullText: string;
  heuristicResult: ParseResult;
  threshold: number;
}): Promise<AiFallbackResult> {
  if (
    !shouldTriggerAiFallback({
      documentType: input.documentType,
      parseResult: input.heuristicResult,
      threshold: input.threshold,
    })
  ) {
    return {
      parseResult: input.heuristicResult,
      blockedExtractions: [],
      aiApplied: false,
    };
  }

  try {
    const raw = await runAiExtraction({
      documentType: input.documentType,
      pages: input.pages,
    });

    if (!raw) {
      return {
        parseResult: {
          ...input.heuristicResult,
          warnings: [
            ...input.heuristicResult.warnings,
            "AI fallback did not return extractable data.",
          ],
        },
        blockedExtractions: [],
        aiApplied: false,
      };
    }

    let converted;
    if (isCarrierDocumentType(input.documentType)) {
      const extraction = aiCarrierExtractionSchema.parse(raw);
      converted = convertCarrierAiExtraction({
        extraction,
        documentId: input.documentId,
        pages: input.pages,
        fullText: input.fullText,
      });
    } else if (isMeasurementDocumentType(input.documentType)) {
      const extraction = aiMeasurementExtractionSchema.parse(raw);
      converted = convertMeasurementAiExtraction({
        extraction,
        documentId: input.documentId,
        pages: input.pages,
        fullText: input.fullText,
      });
    } else {
      return {
        parseResult: input.heuristicResult,
        blockedExtractions: [],
        aiApplied: false,
      };
    }

    const replaceLineItems =
      isCarrierDocumentType(input.documentType) &&
      (input.heuristicResult.lineItems.length === 0 ||
        input.heuristicResult.overallConfidence < input.threshold);

    const supplementMeasurements =
      isMeasurementDocumentType(input.documentType) &&
      input.heuristicResult.measurements.length > 0;

    const merged = mergeAiIntoParseResult({
      heuristic: input.heuristicResult,
      ai: converted,
      replaceLineItems,
      supplementMeasurements,
    });

    return {
      parseResult: merged,
      blockedExtractions: converted.blocked,
      aiApplied: converted.lineItems.length > 0 || converted.measurements.length > 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI extraction failed";
    return {
      parseResult: {
        ...input.heuristicResult,
        warnings: [
          ...input.heuristicResult.warnings,
          `AI fallback failed closed: ${message}`,
        ],
      },
      blockedExtractions: [],
      aiApplied: false,
    };
  }
}

export { shouldTriggerAiFallback };
