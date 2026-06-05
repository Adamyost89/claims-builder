import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType } from "@prisma/client";

import { logClaimEvent, logSystemEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";

describe("audit log-event", () => {
  let userId: string;
  let claimId: string;

  beforeAll(async () => {
    const email = `audit-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Audit Test User",
        passwordHash: await bcrypt.hash("test-password", 8),
        role: "VIEWER",
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Audit Customer",
        propertyAddress: "1 Test St",
        carrier: "Test Carrier",
        claimNumber: `CLM-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "TX",
        city: "Austin",
        claimType: ClaimType.ROOF,
        createdById: userId,
      },
    });
    claimId = claim.id;
  });

  afterAll(async () => {
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("writes claim and system events", async () => {
    const claimEvent = await logClaimEvent({
      claimId,
      actorId: userId,
      eventType: "GATE_BLOCKED",
      payload: { gateId: "G1", reason: "test" },
    });

    expect(claimEvent.id).toBeTruthy();
    expect(claimEvent.claimId).toBe(claimId);
    expect(claimEvent.eventType).toBe("GATE_BLOCKED");
    expect(JSON.parse(claimEvent.payloadJson)).toEqual({
      gateId: "G1",
      reason: "test",
    });

    const systemEvent = await logSystemEvent({
      actorId: userId,
      eventType: "WORKFLOW_ADVANCE",
      payload: { phase: 0 },
    });

    expect(systemEvent.claimId).toBeNull();
    expect(systemEvent.eventType).toBe("WORKFLOW_ADVANCE");
  });
});