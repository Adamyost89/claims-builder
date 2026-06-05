import type { AuditEventType } from "@prisma/client";

import { prisma } from "@/lib/db";

export type ClaimEventInput = {
  claimId: string;
  actorId?: string | null;
  eventType: AuditEventType;
  payload: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SystemEventInput = {
  actorId?: string | null;
  eventType: AuditEventType;
  payload: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function logClaimEvent(input: ClaimEventInput) {
  return prisma.claimEvent.create({
    data: {
      claimId: input.claimId,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      payloadJson: JSON.stringify(input.payload),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function logSystemEvent(input: SystemEventInput) {
  return prisma.claimEvent.create({
    data: {
      claimId: null,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      payloadJson: JSON.stringify(input.payload),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}