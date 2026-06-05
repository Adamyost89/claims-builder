import {
  ClaimStatus,
  UserRole,
  WorkflowStage,
  type Prisma,
} from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import {
  assertPermission,
  canAddNotes,
  canCreateClaims,
  canEditClaims,
  PermissionDeniedError,
} from "@/lib/rbac";

import type { CreateClaimInput, CreateNoteInput, UpdateClaimInput } from "./schemas";

export { PermissionDeniedError };

export async function listClaims() {
  return prisma.claim.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      _count: { select: { notes: true, documents: true } },
    },
  });
}

export async function getClaimById(claimId: string) {
  return prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { documents: true, revisionItems: true } },
    },
  });
}

export async function getClaimMetrics() {
  const [total, byStatus, byStage, dryRuns] = await Promise.all([
    prisma.claim.count(),
    prisma.claim.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.claim.groupBy({
      by: ["workflowStage"],
      _count: { _all: true },
    }),
    prisma.claim.count({ where: { isDryRun: true } }),
  ]);

  return { total, byStatus, byStage, dryRuns };
}

export async function createClaim(
  input: CreateClaimInput,
  actorId: string,
  actorRole: UserRole,
) {
  assertPermission(canCreateClaims(actorRole), "Viewers cannot create claims.");

  if (input.assignedToId) {
    const assignee = await prisma.user.findUnique({
      where: { id: input.assignedToId },
    });
    if (!assignee?.active) {
      throw new Error("Assigned user not found or inactive.");
    }
  }

  const { notes: initialNote, ...claimData } = input;

  const claim = await prisma.claim.create({
    data: {
      customerName: claimData.customerName,
      propertyAddress: claimData.propertyAddress,
      carrier: claimData.carrier,
      claimNumber: claimData.claimNumber,
      policyNumber: claimData.policyNumber ?? null,
      dateOfLoss: claimData.dateOfLoss,
      state: claimData.state,
      city: claimData.city,
      county: claimData.county ?? null,
      manufacturerSystem: claimData.manufacturerSystem ?? null,
      claimType: claimData.claimType,
      assignedToId: claimData.assignedToId ?? null,
      isDryRun: claimData.isDryRun ?? false,
      status: ClaimStatus.DRAFT,
      workflowStage: WorkflowStage.UPLOAD,
      createdById: actorId,
    },
  });

  await logClaimEvent({
    claimId: claim.id,
    actorId,
    eventType: "CLAIM_CREATE",
    payload: {
      customerName: claim.customerName,
      claimNumber: claim.claimNumber,
      carrier: claim.carrier,
      workflowStage: claim.workflowStage,
      status: claim.status,
    },
  });

  if (initialNote?.trim()) {
    await createClaimNote(claim.id, { body: initialNote.trim() }, actorId, actorRole);
  }

  return claim;
}

export async function updateClaim(
  claimId: string,
  input: UpdateClaimInput,
  actorId: string,
  actorRole: UserRole,
) {
  assertPermission(canEditClaims(actorRole), "Viewers cannot update claims.");

  const existing = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!existing) {
    throw new Error("Claim not found.");
  }

  if (input.assignedToId) {
    const assignee = await prisma.user.findUnique({
      where: { id: input.assignedToId },
    });
    if (!assignee?.active) {
      throw new Error("Assigned user not found or inactive.");
    }
  }

  const data: Prisma.ClaimUpdateInput = {};
  if (input.customerName !== undefined) data.customerName = input.customerName;
  if (input.propertyAddress !== undefined) data.propertyAddress = input.propertyAddress;
  if (input.carrier !== undefined) data.carrier = input.carrier;
  if (input.claimNumber !== undefined) data.claimNumber = input.claimNumber;
  if (input.policyNumber !== undefined) data.policyNumber = input.policyNumber;
  if (input.dateOfLoss !== undefined) data.dateOfLoss = input.dateOfLoss;
  if (input.state !== undefined) data.state = input.state;
  if (input.city !== undefined) data.city = input.city;
  if (input.county !== undefined) data.county = input.county;
  if (input.manufacturerSystem !== undefined) {
    data.manufacturerSystem = input.manufacturerSystem;
  }
  if (input.claimType !== undefined) data.claimType = input.claimType;
  if (input.assignedToId !== undefined) {
    data.assignedTo = input.assignedToId
      ? { connect: { id: input.assignedToId } }
      : { disconnect: true };
  }
  if (input.isDryRun !== undefined) data.isDryRun = input.isDryRun;

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data,
  });

  await logClaimEvent({
    claimId,
    actorId,
    eventType: "CLAIM_UPDATE",
    payload: {
      fields: Object.keys(input),
      customerName: updated.customerName,
      claimNumber: updated.claimNumber,
    },
  });

  return updated;
}

export async function createClaimNote(
  claimId: string,
  input: CreateNoteInput,
  actorId: string,
  actorRole: UserRole,
) {
  assertPermission(canAddNotes(actorRole), "Viewers cannot add notes.");

  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) {
    throw new Error("Claim not found.");
  }

  const note = await prisma.claimNote.create({
    data: {
      claimId,
      authorId: actorId,
      body: input.body,
    },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });

  await logClaimEvent({
    claimId,
    actorId,
    eventType: "NOTE_CREATE",
    payload: {
      noteId: note.id,
      bodyLength: note.body.length,
    },
  });

  return note;
}
