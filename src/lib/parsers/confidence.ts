import type { ParserType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { isParserCertified } from "@/lib/parsers/certification";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

/** Cap confidence when parser is not certified — forces human review. */
export const UNCERTIFIED_PARSER_CONFIDENCE_CAP = 0.84;

export async function getConfidenceThreshold(): Promise<number> {
  const settings = await prisma.orgSettings.findUnique({ where: { id: "default" } });
  return settings?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
}

export function scoreMatchConfidence(input: {
  matched: boolean;
  groupsComplete: boolean;
  lineQuality: "strong" | "moderate" | "weak";
}): number {
  if (!input.matched) {
    return 0.3;
  }
  if (!input.groupsComplete) {
    return 0.65;
  }
  switch (input.lineQuality) {
    case "strong":
      return 0.95;
    case "moderate":
      return 0.88;
    case "weak":
      return 0.72;
    default:
      return 0.7;
  }
}

export async function applyParserCertificationToConfidence(
  parserType: ParserType,
  rawConfidence: number,
): Promise<{ confidence: number; needsReview: boolean; parserCertified: boolean }> {
  const parserCertified = await isParserCertified(parserType);
  if (!parserCertified) {
    return {
      confidence: Math.min(rawConfidence, UNCERTIFIED_PARSER_CONFIDENCE_CAP),
      needsReview: true,
      parserCertified: false,
    };
  }
  const threshold = await getConfidenceThreshold();
  return {
    confidence: rawConfidence,
    needsReview: rawConfidence < threshold,
    parserCertified: true,
  };
}

export function isLowConfidence(confidence: number, threshold: number): boolean {
  return confidence < threshold;
}
