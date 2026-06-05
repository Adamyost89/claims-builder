import { ClaimType } from "@prisma/client";
import { z } from "zod";

export const claimTypeSchema = z.nativeEnum(ClaimType);

export const createClaimSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  propertyAddress: z.string().min(1, "Property address is required"),
  carrier: z.string().min(1, "Carrier is required"),
  claimNumber: z.string().min(1, "Claim number is required"),
  dateOfLoss: z.coerce.date(),
  state: z.string().min(1, "State is required"),
  city: z.string().min(1, "City is required"),
  claimType: claimTypeSchema,
  policyNumber: z.string().optional(),
  county: z.string().optional(),
  manufacturerSystem: z.string().optional(),
  assignedToId: z.string().optional(),
  notes: z.string().optional(),
  isDryRun: z.boolean().optional(),
});

export const updateClaimSchema = createClaimSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update",
  });

export const createNoteSchema = z.object({
  body: z.string().min(1, "Note body is required"),
});

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
