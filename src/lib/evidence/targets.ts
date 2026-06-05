import { prisma } from "@/lib/db";

import { AUTO_LINK_BLOCKED_DOCUMENT_TYPES } from "./types";
import type { EvidenceTargetTable } from "./types";
import { isEvidenceTargetTable } from "./types";

export class EvidenceTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceTargetError";
  }
}

export function assertValidTargetTable(table: string): EvidenceTargetTable {
  if (!isEvidenceTargetTable(table)) {
    throw new EvidenceTargetError(`Invalid evidence target table: ${table}`);
  }
  return table;
}

export async function validateEvidenceTarget(input: {
  claimId: string;
  targetTable: string;
  targetId: string;
}): Promise<{ label: string; snippet: string | null }> {
  const targetTable = assertValidTargetTable(input.targetTable);

  switch (targetTable) {
    case "DocumentExtraction": {
      const row = await prisma.documentExtraction.findFirst({
        where: { id: input.targetId, claimId: input.claimId },
      });
      if (!row) {
        throw new EvidenceTargetError("Document extraction not found for this claim.");
      }
      return {
        label: row.fieldName,
        snippet: row.fieldValue ?? row.sourceText ?? null,
      };
    }
    case "EstimateLineItem": {
      const row = await prisma.estimateLineItem.findFirst({
        where: { id: input.targetId, claimId: input.claimId },
      });
      if (!row) {
        throw new EvidenceTargetError("Estimate line item not found for this claim.");
      }
      return {
        label: row.description,
        snippet: `${row.quantity} ${row.unit}`,
      };
    }
    case "MeasurementValue": {
      const row = await prisma.measurementValue.findFirst({
        where: { id: input.targetId, claimId: input.claimId },
      });
      if (!row) {
        throw new EvidenceTargetError("Measurement value not found for this claim.");
      }
      return {
        label: row.key,
        snippet: `${row.value} ${row.unit}`,
      };
    }
    case "ComparisonResult": {
      const row = await prisma.comparisonResult.findFirst({
        where: { id: input.targetId, claimId: input.claimId },
      });
      if (!row) {
        throw new EvidenceTargetError("Comparison result not found for this claim.");
      }
      return {
        label: row.comparisonKey,
        snippet: row.formula,
      };
    }
    case "Document": {
      const row = await prisma.document.findFirst({
        where: { id: input.targetId, claimId: input.claimId, deletedAt: null },
      });
      if (!row) {
        throw new EvidenceTargetError("Document not found for this claim.");
      }
      return {
        label: row.fileName,
        snippet: row.type,
      };
    }
    case "Photo": {
      const row = await prisma.photo.findFirst({
        where: { id: input.targetId, claimId: input.claimId },
      });
      if (!row) {
        throw new EvidenceTargetError("Photo not found for this claim.");
      }
      return {
        label: row.fileName,
        snippet: row.caption,
      };
    }
    case "Calculation": {
      const row = await prisma.calculation.findFirst({
        where: { id: input.targetId, claimId: input.claimId },
      });
      if (!row) {
        throw new EvidenceTargetError("Calculation not found for this claim.");
      }
      return {
        label: row.calculatorType,
        snippet: row.formula,
      };
    }
    case "Rule": {
      const row = await prisma.rule.findUnique({ where: { id: input.targetId } });
      if (!row) {
        throw new EvidenceTargetError("Rule not found.");
      }
      return {
        label: row.title,
        snippet: row.citationText,
      };
    }
    default:
      throw new EvidenceTargetError(`Unsupported target table: ${targetTable}`);
  }
}

export function isAutoLinkBlockedDocumentType(documentType: string): boolean {
  return AUTO_LINK_BLOCKED_DOCUMENT_TYPES.has(documentType);
}
