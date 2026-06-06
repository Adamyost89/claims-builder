import { z } from "zod";

/** Line-item action when determinable from carrier estimate text. */
export const lineItemActionSchema = z.enum([
  "tear_out",
  "replace",
  "install",
  "detach_reset",
  "supply",
]);

export const aiCarrierLineItemSchema = z.object({
  lineNumber: z.number().int().positive().nullable(),
  description: z.string().min(1),
  action: lineItemActionSchema.nullable(),
  quantity: z.number().positive().nullable(),
  unit: z.string().min(1).nullable(),
  unitPrice: z.number().nonnegative().nullable(),
  replacementCost: z.number().nonnegative().nullable(),
  depreciation: z.number().nonnegative().nullable(),
  acv: z.number().nonnegative().nullable(),
  sourcePage: z.number().int().positive(),
  sourceText: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const aiCarrierExtractionSchema = z.object({
  lineItems: z.array(aiCarrierLineItemSchema),
  warnings: z.array(z.string()).default([]),
});

export const aiMeasurementExtractionSchema = z.object({
  vendor: z.string().min(1).nullable(),
  roofAreaSqFt: z.number().positive().nullable(),
  eavesLf: z.number().nonnegative().nullable(),
  rakesLf: z.number().nonnegative().nullable(),
  ridgesLf: z.number().nonnegative().nullable(),
  hipsLf: z.number().nonnegative().nullable(),
  valleysLf: z.number().nonnegative().nullable(),
  dripEdgeLf: z.number().nonnegative().nullable(),
  starterLf: z.number().nonnegative().nullable(),
  ridgeCapLf: z.number().nonnegative().nullable(),
  iceWaterLf: z.number().nonnegative().nullable(),
  stepFlashingLf: z.number().nonnegative().nullable(),
  roofToWallFlashingLf: z.number().nonnegative().nullable(),
  predominantPitch: z.string().min(1).nullable(),
  facetCount: z.number().int().positive().nullable(),
  suggestedWastePct: z.number().min(0).max(100).nullable(),
  fields: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.number(),
        unit: z.string().min(1),
        sourcePage: z.number().int().positive(),
        sourceText: z.string().min(1),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
  warnings: z.array(z.string()).default([]),
});

export type AiCarrierLineItem = z.infer<typeof aiCarrierLineItemSchema>;
export type AiCarrierExtraction = z.infer<typeof aiCarrierExtractionSchema>;
export type AiMeasurementExtraction = z.infer<typeof aiMeasurementExtractionSchema>;
