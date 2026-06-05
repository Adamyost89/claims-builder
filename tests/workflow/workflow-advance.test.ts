import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType, UserRole, WorkflowStage } from "@prisma/client";

import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import {
  advanceWorkflow,
  WorkflowAdvanceError,
} from "@/lib/workflow/advance-workflow";
import {
  getNextWorkflowStage,
  getWorkflowStepForStage,
  isWorkflowStageLocked,
  WORKFLOW_STEPS,
  WORKFLOW_STAGE_ORDER,
} from "@/lib/workflow/stages";

describe("workflow advance integration", () => {
  let writerId: string;
  const claimIds: string[] = [];

  beforeAll(async () => {
    const writer = await prisma.user.create({
      data: {
        email: `wf-adv-${Date.now()}@example.com`,
        name: "Workflow Writer",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    writerId = writer.id;
  });

  afterAll(async () => {
    if (claimIds.length > 0) {
      await prisma.claimEvent.deleteMany({ where: { claimId: { in: claimIds } } });
      await prisma.document.deleteMany({ where: { claimId: { in: claimIds } } });
      await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });
    }
    await prisma.user.deleteMany({ where: { id: writerId } });
    await prisma.$disconnect();
  });

  async function createUploadClaim(suffix: string) {
    const claim = await prisma.claim.create({
      data: {
        customerName: "Workflow Customer",
        propertyAddress: "1 Workflow St",
        carrier: "Carrier",
        claimNumber: `WF-ADV-${suffix}-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: writerId,
        workflowStage: WorkflowStage.UPLOAD,
      },
    });
    claimIds.push(claim.id);
    return claim;
  }

  it("blocks UPLOAD to PARSE advance without active documents", async () => {
    const claim = await createUploadClaim("blocked");

    await expect(advanceWorkflow(claim.id, writerId)).rejects.toMatchObject({
      name: "WorkflowAdvanceError",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "NO_DOCUMENTS" }),
      ]),
    });

    const refreshed = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(refreshed.workflowStage).toBe(WorkflowStage.UPLOAD);
  });

  it("returns API-shaped blocker payload for blocked advance", async () => {
    const claim = await createUploadClaim("api-error");

    try {
      await advanceWorkflow(claim.id, writerId);
      expect.fail("Expected WorkflowAdvanceError");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowAdvanceError);
      const response = apiError(error);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBeTruthy();
      expect(body.blockers.some((b: { code: string }) => b.code === "NO_DOCUMENTS")).toBe(
        true,
      );
    }
  });

  it("advances UPLOAD to PARSE when an active document exists", async () => {
    const claim = await createUploadClaim("success");

    await prisma.document.create({
      data: {
        claimId: claim.id,
        type: "CARRIER_ESTIMATE",
        fileName: "carrier.pdf",
        mimeType: "application/pdf",
        storageKey: `claims/${claim.id}/carrier.pdf`,
        fileSize: 128,
        uploadedById: writerId,
      },
    });

    const result = await advanceWorkflow(claim.id, writerId);
    expect(result).toEqual({
      fromStage: WorkflowStage.UPLOAD,
      toStage: WorkflowStage.PARSE,
    });

    const refreshed = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(refreshed.workflowStage).toBe(WorkflowStage.PARSE);

    const event = await prisma.claimEvent.findFirst({
      where: { claimId: claim.id, eventType: "WORKFLOW_ADVANCE" },
      orderBy: { createdAt: "desc" },
    });
    expect(event).toBeTruthy();
    const payload = JSON.parse(event!.payloadJson);
    expect(payload.fromStage).toBe(WorkflowStage.UPLOAD);
    expect(payload.toStage).toBe(WorkflowStage.PARSE);
  });

  it("unlocks Parse in sidebar after advancing from Upload", async () => {
    const claim = await createUploadClaim("sidebar");

    expect(isWorkflowStageLocked(WorkflowStage.UPLOAD, WorkflowStage.PARSE)).toBe(true);

    await prisma.document.create({
      data: {
        claimId: claim.id,
        type: "CARRIER_ESTIMATE",
        fileName: "carrier-sidebar.pdf",
        mimeType: "application/pdf",
        storageKey: `claims/${claim.id}/carrier-sidebar.pdf`,
        fileSize: 128,
        uploadedById: writerId,
      },
    });

    await advanceWorkflow(claim.id, writerId);

    const refreshed = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(isWorkflowStageLocked(refreshed.workflowStage, WorkflowStage.PARSE)).toBe(false);
    expect(isWorkflowStageLocked(refreshed.workflowStage, WorkflowStage.HUMAN_REVIEW)).toBe(
      true,
    );
  });

  it("maps every workflow stage to a hub page", () => {
    for (const stage of WORKFLOW_STAGE_ORDER) {
      const step = getWorkflowStepForStage(stage);
      expect(step).toBeTruthy();
      expect(step!.href("test-claim-id")).toMatch(/^\/claims\/test-claim-id\//);
    }
    expect(WORKFLOW_STEPS).toHaveLength(WORKFLOW_STAGE_ORDER.length);
  });

  it("defines the next stage for each non-final workflow step", () => {
    for (let index = 0; index < WORKFLOW_STAGE_ORDER.length - 1; index += 1) {
      const current = WORKFLOW_STAGE_ORDER[index];
      const expectedNext = WORKFLOW_STAGE_ORDER[index + 1];
      expect(getNextWorkflowStage(current)).toBe(expectedNext);
      expect(getWorkflowStepForStage(expectedNext)?.label).toBeTruthy();
    }
    expect(getNextWorkflowStage(WorkflowStage.EXPORT)).toBeNull();
  });
});
