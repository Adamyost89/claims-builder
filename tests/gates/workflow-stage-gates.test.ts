import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType, WorkflowStage } from "@prisma/client";

import { prisma } from "@/lib/db";
import { runWorkflowAdvanceGate } from "@/lib/gates/workflow-stage-gates";

describe("workflow stage gates", () => {
  let userId: string;
  let claimId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `wf-gate-${Date.now()}@example.com`,
        name: "Gate Test",
        passwordHash: await bcrypt.hash("password", 8),
        role: "SUPPLEMENT_WRITER",
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Gate Customer",
        propertyAddress: "1 Gate St",
        carrier: "Carrier",
        claimNumber: `GATE-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "TX",
        city: "Austin",
        claimType: ClaimType.ROOF,
        createdById: userId,
        workflowStage: WorkflowStage.UPLOAD,
      },
    });
    claimId = claim.id;
  });

  afterAll(async () => {
    await prisma.comparisonResult.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("blocks UPLOAD to PARSE without documents", async () => {
    const result = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.UPLOAD,
      WorkflowStage.PARSE,
    );
    expect(result.passed).toBe(false);
    expect(result.blockers.some((b) => b.code === "NO_DOCUMENTS")).toBe(true);
  });

  it("allows UPLOAD to PARSE when an active document exists", async () => {
    const document = await prisma.document.create({
      data: {
        claimId,
        type: "CARRIER_ESTIMATE",
        fileName: "estimate.pdf",
        mimeType: "application/pdf",
        storageKey: "claims/test/estimate.pdf",
        fileSize: 100,
        uploadedById: userId,
      },
    });

    const result = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.UPLOAD,
      WorkflowStage.PARSE,
    );
    expect(result.passed).toBe(true);

    await prisma.document.delete({ where: { id: document.id } });
  });

  it("blocks HUMAN_REVIEW to MEASUREMENT_COMPARISON until reviews are complete", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: { workflowStage: WorkflowStage.HUMAN_REVIEW },
    });

    const document = await prisma.document.create({
      data: {
        claimId,
        type: "CARRIER_ESTIMATE",
        fileName: "parsed.pdf",
        mimeType: "application/pdf",
        storageKey: "claims/test/parsed.pdf",
        fileSize: 100,
        uploadedById: userId,
        parseStatus: "COMPLETE",
      },
    });

    const line = await prisma.estimateLineItem.create({
      data: {
        claimId,
        documentId: document.id,
        description: "Drip edge",
        quantity: 156,
        unit: "LF",
        reviewStatus: "PENDING",
      },
    });

    const blocked = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.HUMAN_REVIEW,
      WorkflowStage.MEASUREMENT_COMPARISON,
    );
    expect(blocked.passed).toBe(false);
    expect(
      blocked.blockers.some((b) => b.code === "PARSED_DATA_UNREVIEWED"),
    ).toBe(true);

    await prisma.estimateLineItem.update({
      where: { id: line.id },
      data: { reviewStatus: "ACCEPTED" },
    });

    const allowed = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.HUMAN_REVIEW,
      WorkflowStage.MEASUREMENT_COMPARISON,
    );
    expect(allowed.passed).toBe(true);

    await prisma.estimateLineItem.deleteMany({ where: { claimId } });
    await prisma.document.deleteMany({ where: { claimId } });
    await prisma.claim.update({
      where: { id: claimId },
      data: { workflowStage: WorkflowStage.UPLOAD },
    });
  });

  it("blocks MEASUREMENT_COMPARISON to RULE_ISSUE_DETECTION until comparisonReviewedAt", async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        workflowStage: WorkflowStage.MEASUREMENT_COMPARISON,
        comparisonReviewedAt: null,
      },
    });

    await prisma.comparisonResult.create({
      data: {
        claimId,
        comparisonKey: "roof_area_sq",
        approvedQty: 20,
        requestedQty: 24,
        difference: -4,
        pctDifference: -16.67,
        formula: "roof_area_sq = 24",
        explanation: "Test comparison",
        sourceDocumentIds: "[]",
        measurementValueIds: "[]",
        unit: "SQ",
      },
    });

    const blocked = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.MEASUREMENT_COMPARISON,
      WorkflowStage.RULE_ISSUE_DETECTION,
    );
    expect(blocked.passed).toBe(false);
    expect(
      blocked.blockers.some((b) => b.code === "COMPARISON_NOT_REVIEWED"),
    ).toBe(true);

    await prisma.claim.update({
      where: { id: claimId },
      data: { comparisonReviewedAt: new Date() },
    });

    const allowed = await runWorkflowAdvanceGate(
      claimId,
      WorkflowStage.MEASUREMENT_COMPARISON,
      WorkflowStage.RULE_ISSUE_DETECTION,
    );
    expect(allowed.passed).toBe(true);

    await prisma.comparisonResult.deleteMany({ where: { claimId } });
    await prisma.claim.update({
      where: { id: claimId },
      data: { workflowStage: WorkflowStage.UPLOAD, comparisonReviewedAt: null },
    });
  });
});
