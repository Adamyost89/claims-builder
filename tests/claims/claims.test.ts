import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType, UserRole, WorkflowStage } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  createClaim,
  createClaimNote,
  PermissionDeniedError,
  updateClaim,
} from "@/lib/claims/service";
import {
  advanceWorkflow,
  advanceWorkflowToStage,
  WorkflowAdvanceError,
  WorkflowSkipError,
} from "@/lib/workflow/advance-workflow";

describe("claims service", () => {
  let writerId: string;
  let viewerId: string;
  const createdClaimIds: string[] = [];

  beforeAll(async () => {
    const suffix = Date.now();
    const writer = await prisma.user.create({
      data: {
        email: `writer-${suffix}@example.com`,
        name: "Writer User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    writerId = writer.id;

    const viewer = await prisma.user.create({
      data: {
        email: `viewer-${suffix}@example.com`,
        name: "Viewer User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.VIEWER,
      },
    });
    viewerId = viewer.id;
  });

  afterAll(async () => {
    if (createdClaimIds.length > 0) {
      await prisma.claimEvent.deleteMany({
        where: { claimId: { in: createdClaimIds } },
      });
      await prisma.claimNote.deleteMany({
        where: { claimId: { in: createdClaimIds } },
      });
      await prisma.claim.deleteMany({ where: { id: { in: createdClaimIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [writerId, viewerId] } } });
    await prisma.$disconnect();
  });

  const baseInput = {
    customerName: "Test Customer",
    propertyAddress: "123 Main St",
    carrier: "Test Carrier",
    claimNumber: `CLM-${Date.now()}`,
    dateOfLoss: new Date("2024-06-01"),
    state: "MI",
    city: "Detroit",
    claimType: ClaimType.ROOF,
  };

  it("creates claim with UPLOAD workflow stage and logs CLAIM_CREATE", async () => {
    const claim = await createClaim(baseInput, writerId, UserRole.SUPPLEMENT_WRITER);
    createdClaimIds.push(claim.id);

    expect(claim.workflowStage).toBe(WorkflowStage.UPLOAD);
    expect(claim.status).toBe("DRAFT");
    expect(claim.customerName).toBe(baseInput.customerName);

    const event = await prisma.claimEvent.findFirst({
      where: { claimId: claim.id, eventType: "CLAIM_CREATE" },
    });
    expect(event).toBeTruthy();
    expect(event?.actorId).toBe(writerId);
    const payload = JSON.parse(event!.payloadJson);
    expect(payload.customerName).toBe(baseInput.customerName);
  });

  it("blocks viewers from creating claims", async () => {
    await expect(
      createClaim(
        { ...baseInput, claimNumber: `CLM-V-${Date.now()}` },
        viewerId,
        UserRole.VIEWER,
      ),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("logs CLAIM_UPDATE on claim update", async () => {
    const claim = await createClaim(
      { ...baseInput, claimNumber: `CLM-U-${Date.now()}` },
      writerId,
      UserRole.SUPPLEMENT_WRITER,
    );
    createdClaimIds.push(claim.id);

    await updateClaim(
      claim.id,
      { carrier: "Updated Carrier" },
      writerId,
      UserRole.SUPPLEMENT_WRITER,
    );

    const event = await prisma.claimEvent.findFirst({
      where: { claimId: claim.id, eventType: "CLAIM_UPDATE" },
    });
    expect(event).toBeTruthy();
    const payload = JSON.parse(event!.payloadJson);
    expect(payload.fields).toContain("carrier");
  });

  it("logs NOTE_CREATE on note creation", async () => {
    const claim = await createClaim(
      { ...baseInput, claimNumber: `CLM-N-${Date.now()}` },
      writerId,
      UserRole.SUPPLEMENT_WRITER,
    );
    createdClaimIds.push(claim.id);

    const note = await createClaimNote(
      claim.id,
      { body: "Field note from adjuster visit." },
      writerId,
      UserRole.SUPPLEMENT_WRITER,
    );

    expect(note.body).toContain("Field note");

    const event = await prisma.claimEvent.findFirst({
      where: { claimId: claim.id, eventType: "NOTE_CREATE" },
    });
    expect(event).toBeTruthy();
    const payload = JSON.parse(event!.payloadJson);
    expect(payload.noteId).toBe(note.id);
  });

  it("blocks workflow advance when gates fail", async () => {
    const claim = await createClaim(
      { ...baseInput, claimNumber: `CLM-W-${Date.now()}` },
      writerId,
      UserRole.SUPPLEMENT_WRITER,
    );
    createdClaimIds.push(claim.id);

    await expect(advanceWorkflow(claim.id, writerId)).rejects.toBeInstanceOf(
      WorkflowAdvanceError,
    );

    const blocked = await prisma.claimEvent.findFirst({
      where: { claimId: claim.id, eventType: "GATE_BLOCKED" },
    });
    expect(blocked).toBeTruthy();
  });

  it("cannot skip workflow stages", async () => {
    const claim = await createClaim(
      { ...baseInput, claimNumber: `CLM-S-${Date.now()}` },
      writerId,
      UserRole.SUPPLEMENT_WRITER,
    );
    createdClaimIds.push(claim.id);

    await expect(
      advanceWorkflowToStage(claim.id, WorkflowStage.MEASUREMENT_COMPARISON, writerId),
    ).rejects.toBeInstanceOf(WorkflowSkipError);

    const refreshed = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(refreshed?.workflowStage).toBe(WorkflowStage.UPLOAD);
  });
});
