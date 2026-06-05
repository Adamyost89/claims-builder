import { OutputMode } from "@prisma/client";
import { z } from "zod";

export const generationEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  evidenceType: z.string().min(1),
  label: z.string().min(1),
  snippet: z.string().nullable(),
  targetTable: z.string().min(1),
  targetId: z.string().min(1),
  isSatisfied: z.boolean(),
});

export const generationRuleCitationSchema = z.object({
  ruleId: z.string().min(1),
  citationText: z.string().min(1),
});

export const generationRevisionSchema = z.object({
  revisionItemId: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  carrierApprovedLineItem: z.string().nullable(),
  carrierApprovedQty: z.number().nullable(),
  carrierApprovedUnit: z.string().nullable(),
  requestedLineItem: z.string().nullable(),
  requestedQty: z.number().nullable(),
  requestedUnit: z.string().nullable(),
  qtyDifference: z.number().nullable(),
  calculationMethod: z.string().nullable(),
  basis: z.string().nullable(),
  revisionRequired: z.string().nullable(),
  requiredEvidenceStatus: z.string().min(1),
  isOverridden: z.boolean(),
  comparisonFormulas: z.array(z.string()),
  evidence: z.array(generationEvidenceSchema),
  ruleCitations: z.array(generationRuleCitationSchema),
});

export const excludedRevisionSummarySchema = z.object({
  revisionItemId: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  excludedReason: z.string().nullable(),
});

export const unresolvedRevisionSummarySchema = z.object({
  revisionItemId: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  readinessStatus: z.string().min(1),
  requiredEvidenceTypes: z.array(z.string()),
});

export const productionReadinessPayloadSchema = z.object({
  productionReady: z.boolean(),
  blockers: z.array(z.string()),
});

export const generationInputSchema = z.object({
  claimId: z.string().min(1),
  outputMode: z.nativeEnum(OutputMode),
  claim: z.object({
    customerName: z.string(),
    propertyAddress: z.string(),
    carrier: z.string(),
    claimNumber: z.string(),
    policyNumber: z.string().nullable(),
    state: z.string(),
    city: z.string(),
    claimType: z.string(),
    manufacturerSystem: z.string().nullable(),
    dateOfLoss: z.string(),
  }),
  productionReadiness: productionReadinessPayloadSchema,
  toneRules: z.array(z.string()),
  bannedPhrases: z.array(z.string()),
  exportEligibleRevisions: z.array(generationRevisionSchema),
  excludedRevisions: z.array(excludedRevisionSummarySchema),
  unresolvedRevisions: z.array(unresolvedRevisionSummarySchema),
});

export const generatedSectionSchema = z.object({
  revisionItemId: z.string().min(1),
  heading: z.string().min(1),
  body: z.string().min(1),
  approvedQty: z.number().nullable(),
  requestedQty: z.number().nullable(),
  difference: z.number().nullable(),
  evidenceIds: z.array(z.string()),
  ruleIds: z.array(z.string()),
});

export const unsupportedClaimSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  sectionRevisionItemId: z.string().optional(),
  field: z.string().optional(),
});

export const generationOutputSchema = z.object({
  outputMode: z.nativeEnum(OutputMode),
  title: z.string().min(1),
  sections: z.array(generatedSectionSchema),
  excludedRevisions: z.array(excludedRevisionSummarySchema),
  unsupportedClaims: z.array(unsupportedClaimSchema),
  toneLintPassed: z.boolean(),
  warnings: z.array(z.string()),
});

export type GenerationEvidence = z.infer<typeof generationEvidenceSchema>;
export type GenerationRuleCitation = z.infer<typeof generationRuleCitationSchema>;
export type GenerationRevision = z.infer<typeof generationRevisionSchema>;
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GeneratedSection = z.infer<typeof generatedSectionSchema>;
export type UnsupportedClaim = z.infer<typeof unsupportedClaimSchema>;
export type GenerationOutput = z.infer<typeof generationOutputSchema>;
