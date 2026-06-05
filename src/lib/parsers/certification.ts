import type { ParserType } from "@prisma/client";

import { prisma } from "@/lib/db";

/** Minimum fixture accuracy required before a parser may feed generation. */
export const PARSER_CERTIFICATION_THRESHOLDS: Record<ParserType, number> = {
  CARRIER_ESTIMATE: 0.95,
  EAGLEVIEW: 0.99,
  HOVER: 0.99,
  GAF: 0.99,
  ITEL: 0.95,
};

export function evaluateParserCertified(
  parserType: ParserType,
  fixtureAccuracy: number | null | undefined,
): boolean {
  const required = PARSER_CERTIFICATION_THRESHOLDS[parserType];
  if (fixtureAccuracy == null) {
    return false;
  }
  return fixtureAccuracy >= required;
}

export async function getParserCertification(parserType: ParserType) {
  return prisma.parserCertification.findUnique({ where: { parserType } });
}

export async function isParserCertified(parserType: ParserType): Promise<boolean> {
  const record = await getParserCertification(parserType);
  return record?.parserCertified ?? false;
}

export async function assertParserCertified(parserType: ParserType): Promise<void> {
  const certified = await isParserCertified(parserType);
  if (!certified) {
    throw new Error(
      `Parser ${parserType} is not certified for production use. Fixture accuracy must meet ${PARSER_CERTIFICATION_THRESHOLDS[parserType] * 100}%.`,
    );
  }
}

export async function updateParserCertification(
  parserType: ParserType,
  fixtureAccuracy: number,
  notes?: string,
) {
  const requiredAccuracy = PARSER_CERTIFICATION_THRESHOLDS[parserType];
  const parserCertified = evaluateParserCertified(parserType, fixtureAccuracy);

  return prisma.parserCertification.upsert({
    where: { parserType },
    create: {
      parserType,
      requiredAccuracy,
      fixtureAccuracy,
      parserCertified,
      lastCertifiedAt: parserCertified ? new Date() : null,
      notes,
    },
    update: {
      fixtureAccuracy,
      parserCertified,
      lastCertifiedAt: parserCertified ? new Date() : null,
      notes,
    },
  });
}
