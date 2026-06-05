import { CARRIER_READY_MODES } from "./constants";
import type { GenerationInput, GenerationOutput, UnsupportedClaim } from "./schemas";

function revisionById(payload: GenerationInput, revisionItemId: string) {
  return payload.exportEligibleRevisions.find(
    (revision) => revision.revisionItemId === revisionItemId,
  );
}

function qtyEqual(a: number | null, b: number | null): boolean {
  if (a === null && b === null) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return Math.abs(a - b) < 0.0001;
}

function buildAllowedTextCorpus(payload: GenerationInput): string[] {
  const corpus: string[] = [];

  for (const revision of payload.exportEligibleRevisions) {
    corpus.push(revision.title);
    if (revision.basis) {
      corpus.push(revision.basis);
    }
    if (revision.revisionRequired) {
      corpus.push(revision.revisionRequired);
    }
    if (revision.calculationMethod) {
      corpus.push(revision.calculationMethod);
    }
    for (const formula of revision.comparisonFormulas) {
      corpus.push(formula);
    }
    for (const evidence of revision.evidence) {
      corpus.push(evidence.label);
      if (evidence.snippet) {
        corpus.push(evidence.snippet);
      }
    }
    for (const rule of revision.ruleCitations) {
      corpus.push(rule.citationText);
    }
    if (revision.carrierApprovedQty != null) {
      corpus.push(String(revision.carrierApprovedQty));
    }
    if (revision.requestedQty != null) {
      corpus.push(String(revision.requestedQty));
    }
    if (revision.qtyDifference != null) {
      corpus.push(String(revision.qtyDifference));
    }
  }

  return corpus.filter((entry) => entry.trim().length > 0);
}

function containsUnsupportedCitation(body: string, allowedCorpus: string[]): boolean {
  const codePatterns = body.match(/\bR\d{3}(?:\.\d+)*\b/gi) ?? [];
  const manufacturerPatterns = body.match(/\bIRC\b|\bIBC\b|\bASTM\b/gi) ?? [];

  const markers = [...codePatterns, ...manufacturerPatterns];
  if (markers.length === 0) {
    return false;
  }

  const corpusText = allowedCorpus.join(" ").toLowerCase();
  return markers.some((marker) => !corpusText.includes(marker.toLowerCase()));
}

export function detectUnsupportedClaims(
  output: GenerationOutput,
  payload: GenerationInput,
): UnsupportedClaim[] {
  const claims: UnsupportedClaim[] = [];
  const allowedRevisionIds = new Set([
    ...payload.exportEligibleRevisions.map((revision) => revision.revisionItemId),
    ...(payload.outputMode === "INTERNAL_AUDIT" ||
    payload.outputMode === "MISSING_EVIDENCE_CHECKLIST"
      ? payload.unresolvedRevisions.map((revision) => revision.revisionItemId)
      : []),
  ]);
  const excludedRevisionIds = new Set(
    payload.excludedRevisions.map((revision) => revision.revisionItemId),
  );
  const allowedEvidenceIds = new Set(
    payload.exportEligibleRevisions.flatMap((revision) =>
      revision.evidence.map((evidence) => evidence.evidenceId),
    ),
  );
  const allowedRuleIds = new Set(
    payload.exportEligibleRevisions.flatMap((revision) =>
      revision.ruleCitations.map((rule) => rule.ruleId),
    ),
  );
  const allowedCorpus = buildAllowedTextCorpus(payload);
  const carrierReady = CARRIER_READY_MODES.has(payload.outputMode);

  for (const section of output.sections) {
    if (!allowedRevisionIds.has(section.revisionItemId)) {
      claims.push({
        code: "UNKNOWN_REVISION",
        message: `Section references unknown revisionItemId ${section.revisionItemId}.`,
        sectionRevisionItemId: section.revisionItemId,
      });
      continue;
    }

    if (carrierReady && excludedRevisionIds.has(section.revisionItemId)) {
      claims.push({
        code: "EXCLUDED_IN_CARRIER_SECTION",
        message: `Excluded revision ${section.revisionItemId} appears in carrier-ready section.`,
        sectionRevisionItemId: section.revisionItemId,
      });
    }

    const revision = revisionById(payload, section.revisionItemId);
    if (!revision) {
      if (
        payload.outputMode === "INTERNAL_AUDIT" ||
        payload.outputMode === "MISSING_EVIDENCE_CHECKLIST"
      ) {
        const unresolved = payload.unresolvedRevisions.find(
          (row) => row.revisionItemId === section.revisionItemId,
        );
        if (unresolved) {
          continue;
        }
      }
      continue;
    }

    if (!qtyEqual(section.approvedQty, revision.carrierApprovedQty)) {
      claims.push({
        code: "QUANTITY_MISMATCH",
        message: `approvedQty for ${section.revisionItemId} does not match payload.`,
        sectionRevisionItemId: section.revisionItemId,
        field: "approvedQty",
      });
    }
    if (!qtyEqual(section.requestedQty, revision.requestedQty)) {
      claims.push({
        code: "QUANTITY_MISMATCH",
        message: `requestedQty for ${section.revisionItemId} does not match payload.`,
        sectionRevisionItemId: section.revisionItemId,
        field: "requestedQty",
      });
    }
    if (!qtyEqual(section.difference, revision.qtyDifference)) {
      claims.push({
        code: "QUANTITY_MISMATCH",
        message: `difference for ${section.revisionItemId} does not match payload.`,
        sectionRevisionItemId: section.revisionItemId,
        field: "difference",
      });
    }

    for (const evidenceId of section.evidenceIds) {
      if (!allowedEvidenceIds.has(evidenceId)) {
        claims.push({
          code: "UNKNOWN_EVIDENCE",
          message: `Unknown evidenceId ${evidenceId} in section ${section.revisionItemId}.`,
          sectionRevisionItemId: section.revisionItemId,
          field: "evidenceIds",
        });
      }
    }

    for (const ruleId of section.ruleIds) {
      if (!allowedRuleIds.has(ruleId)) {
        claims.push({
          code: "UNKNOWN_RULE",
          message: `Unknown ruleId ${ruleId} in section ${section.revisionItemId}.`,
          sectionRevisionItemId: section.revisionItemId,
          field: "ruleIds",
        });
      }
    }

    if (containsUnsupportedCitation(section.body, allowedCorpus)) {
      claims.push({
        code: "UNSUPPORTED_CITATION",
        message: `Section ${section.revisionItemId} introduces unsupported code/manufacturer language.`,
        sectionRevisionItemId: section.revisionItemId,
        field: "body",
      });
    }
  }

  return claims;
}

export function isValidGenerationDraft(input: {
  generationBlocked: boolean;
  toneLintPassed: boolean;
  unsupportedClaims: UnsupportedClaim[];
}): boolean {
  return (
    !input.generationBlocked &&
    input.toneLintPassed &&
    input.unsupportedClaims.length === 0
  );
}
