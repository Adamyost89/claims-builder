import type { EvidenceType } from "@prisma/client";

/** Tables allowed as EvidenceLink targets in Phase 5. */
export const EVIDENCE_TARGET_TABLES = [
  "DocumentExtraction",
  "EstimateLineItem",
  "MeasurementValue",
  "ComparisonResult",
  "Document",
  "Photo",
  "Calculation",
  "Rule",
] as const;

export type EvidenceTargetTable = (typeof EVIDENCE_TARGET_TABLES)[number];

export function isEvidenceTargetTable(value: string): value is EvidenceTargetTable {
  return (EVIDENCE_TARGET_TABLES as readonly string[]).includes(value);
}

/** Document types that must never be auto-linked as evidence. */
export const AUTO_LINK_BLOCKED_DOCUMENT_TYPES = new Set([
  "PHOTO",
  "INVOICE",
  "POLICY_JACKET",
]);

export type EvidenceRequirementSpec = {
  /** Each inner array is satisfied if any listed type is linked; all groups must pass. */
  groups: EvidenceType[][];
};
