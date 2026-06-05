import type { WorkflowStage } from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import { runWorkflowAdvanceGate } from "@/lib/gates/workflow-stage-gates";
import type { Blocker } from "@/lib/gates/types";

import { getNextWorkflowStage, getWorkflowStageIndex } from "./stages";

export class WorkflowAdvanceError extends Error {
  constructor(
    message: string,
    public readonly blockers: Blocker[],
  ) {
    super(message);
    this.name = "WorkflowAdvanceError";
  }
}

export class WorkflowSkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowSkipError";
  }
}

export async function advanceWorkflow(
  claimId: string,
  actorId: string,
): Promise<{ fromStage: WorkflowStage; toStage: WorkflowStage }> {
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) {
    throw new WorkflowAdvanceError("Claim not found.", [
      { code: "CLAIM_NOT_FOUND", message: "Claim not found.", severity: "error" },
    ]);
  }

  const nextStage = getNextWorkflowStage(claim.workflowStage);
  if (!nextStage) {
    throw new WorkflowAdvanceError("Claim is already at the final workflow stage.", [
      {
        code: "FINAL_STAGE",
        message: "No further workflow stage available.",
        severity: "error",
      },
    ]);
  }

  return advanceWorkflowToStage(claimId, nextStage, actorId);
}

export async function advanceWorkflowToStage(
  claimId: string,
  targetStage: WorkflowStage,
  actorId: string,
): Promise<{ fromStage: WorkflowStage; toStage: WorkflowStage }> {
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) {
    throw new WorkflowAdvanceError("Claim not found.", [
      { code: "CLAIM_NOT_FOUND", message: "Claim not found.", severity: "error" },
    ]);
  }

  const fromStage = claim.workflowStage;
  const expectedNext = getNextWorkflowStage(fromStage);

  if (!expectedNext || targetStage !== expectedNext) {
    throw new WorkflowSkipError(
      `Cannot skip workflow stages. Expected ${expectedNext ?? "none"}, got ${targetStage}.`,
    );
  }

  const gate = await runWorkflowAdvanceGate(claimId, fromStage, targetStage);
  if (!gate.passed) {
    await logClaimEvent({
      claimId,
      actorId,
      eventType: "GATE_BLOCKED",
      payload: {
        gateId: gate.gateId,
        blockers: gate.blockers,
        attemptedTransition: { fromStage, toStage: targetStage },
      },
    });
    throw new WorkflowAdvanceError(
      `Workflow advance blocked at ${gate.gateId}.`,
      gate.blockers,
    );
  }

  await prisma.claim.update({
    where: { id: claimId },
    data: { workflowStage: targetStage },
  });

  await logClaimEvent({
    claimId,
    actorId,
    eventType: "WORKFLOW_ADVANCE",
    payload: { fromStage, toStage: targetStage },
  });

  return { fromStage, toStage: targetStage };
}

export function assertConsecutiveStage(
  fromStage: WorkflowStage,
  toStage: WorkflowStage,
): void {
  const fromIndex = getWorkflowStageIndex(fromStage);
  const toIndex = getWorkflowStageIndex(toStage);
  if (toIndex !== fromIndex + 1) {
    throw new WorkflowSkipError(
      `Workflow stages must advance one step at a time (${fromStage} → ${toStage}).`,
    );
  }
}
