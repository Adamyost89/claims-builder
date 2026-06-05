import type { GenerationInput, GenerationOutput } from "./schemas";

function sectionBodyForMode(revision: GenerationInput["exportEligibleRevisions"][number], mode: string): string {
  const approved = revision.carrierApprovedQty ?? 0;
  const requested = revision.requestedQty ?? 0;
  const difference = revision.qtyDifference ?? 0;

  if (mode === "MISSING_EVIDENCE_CHECKLIST") {
    return "Evidence checklist item — unresolved revisions only.";
  }
  if (mode === "INTERNAL_AUDIT") {
    return `Internal audit note for ${revision.title}. Required evidence status: ${revision.requiredEvidenceStatus}.`;
  }
  if (mode === "SCOPE_COMPARISON") {
    return `Approved: ${approved} ${revision.carrierApprovedUnit ?? ""} | Requested: ${requested} ${revision.requestedUnit ?? ""} | Difference: ${difference}`;
  }
  if (mode === "SHORT_REPLY") {
    return `The approved estimate does not contain sufficient quantities for ${revision.title}. Please revise the estimate as follows: ${revision.revisionRequired ?? revision.basis ?? "See basis."}`;
  }
  if (mode === "CARRIER_REBUTTAL") {
    return `The approved scope is materially insufficient for ${revision.title}. ${revision.revisionRequired ?? revision.basis ?? ""}`;
  }

  return [
    `The approved scope is materially insufficient.`,
    `Approved quantity: ${approved} ${revision.carrierApprovedUnit ?? ""}`,
    `Requested quantity: ${requested} ${revision.requestedUnit ?? ""}`,
    `Difference: ${difference}`,
    `Basis: ${revision.basis ?? "See linked evidence."}`,
    `Revision required: ${revision.revisionRequired ?? "Add required scope."}`,
    revision.ruleCitations.length > 0
      ? `Manufacturer compliant installation requires compliance with: ${revision.ruleCitations.map((rule) => rule.citationText).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function generateMockOutput(payload: GenerationInput): GenerationOutput {
  const warnings: string[] = ["MOCK_GENERATION: deterministic development/test output only."];

  if (!payload.productionReadiness.productionReady) {
    warnings.push("Production readiness safeguards are active.");
  }

  if (payload.outputMode === "MISSING_EVIDENCE_CHECKLIST") {
    const sections = payload.unresolvedRevisions.map((revision, index) => ({
      revisionItemId: revision.revisionItemId,
      heading: `${index + 1}. Missing evidence — ${revision.title}`,
      body: `Unresolved (${revision.readinessStatus}). Required evidence: ${revision.requiredEvidenceTypes.join(", ") || "unspecified"}.`,
      approvedQty: null,
      requestedQty: null,
      difference: null,
      evidenceIds: [],
      ruleIds: [],
    }));

    return {
      outputMode: payload.outputMode,
      title: `Missing evidence checklist — ${payload.claim.claimNumber}`,
      sections,
      excludedRevisions: payload.excludedRevisions,
      unsupportedClaims: [],
      toneLintPassed: true,
      warnings,
    };
  }

  if (payload.outputMode === "INTERNAL_AUDIT") {
    const sections = [
      ...payload.exportEligibleRevisions.map((revision, index) => ({
        revisionItemId: revision.revisionItemId,
        heading: `${index + 1}. Included — ${revision.title}`,
        body: sectionBodyForMode(revision, payload.outputMode),
        approvedQty: revision.carrierApprovedQty,
        requestedQty: revision.requestedQty,
        difference: revision.qtyDifference,
        evidenceIds: revision.evidence.map((evidence) => evidence.evidenceId),
        ruleIds: revision.ruleCitations.map((rule) => rule.ruleId),
      })),
      ...payload.unresolvedRevisions.map((revision, index) => ({
        revisionItemId: revision.revisionItemId,
        heading: `U${index + 1}. Unresolved — ${revision.title}`,
        body: `Readiness: ${revision.readinessStatus}. Required: ${revision.requiredEvidenceTypes.join(", ")}`,
        approvedQty: null,
        requestedQty: null,
        difference: null,
        evidenceIds: [],
        ruleIds: [],
      })),
    ];

    return {
      outputMode: payload.outputMode,
      title: `Internal audit — ${payload.claim.claimNumber}`,
      sections,
      excludedRevisions: payload.excludedRevisions,
      unsupportedClaims: [],
      toneLintPassed: true,
      warnings,
    };
  }

  const sections = payload.exportEligibleRevisions.map((revision, index) => ({
    revisionItemId: revision.revisionItemId,
    heading:
      payload.outputMode === "FULL_SUPPLEMENT"
        ? `Section ${index + 1}: ${revision.title}`
        : revision.title,
    body: sectionBodyForMode(revision, payload.outputMode),
    approvedQty: revision.carrierApprovedQty,
    requestedQty: revision.requestedQty,
    difference: revision.qtyDifference,
    evidenceIds: revision.evidence.map((evidence) => evidence.evidenceId),
    ruleIds: revision.ruleCitations.map((rule) => rule.ruleId),
  }));

  const titleByMode: Record<string, string> = {
    FULL_SUPPLEMENT: `Supplement request — ${payload.claim.claimNumber}`,
    CARRIER_REBUTTAL: `Carrier rebuttal — ${payload.claim.claimNumber}`,
    SHORT_REPLY: `Short reply — ${payload.claim.claimNumber}`,
    SCOPE_COMPARISON: `Scope comparison — ${payload.claim.claimNumber}`,
  };

  return {
    outputMode: payload.outputMode,
    title: titleByMode[payload.outputMode] ?? `Generated output — ${payload.claim.claimNumber}`,
    sections,
    excludedRevisions: payload.excludedRevisions,
    unsupportedClaims: [],
    toneLintPassed: true,
    warnings,
  };
}
