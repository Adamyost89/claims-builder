import type { Claim, WorkflowStage } from "@prisma/client";

export type ReadinessItem = {
  id: string;
  label: string;
  status: "complete" | "current" | "locked" | "unavailable";
  detail: string;
};

export function buildClaimReadinessChecklist(claim: Claim): ReadinessItem[] {
  const stage = claim.workflowStage;

  return [
    {
      id: "intake",
      label: "Claim intake",
      status: "complete",
      detail: `Workspace: ${claim.customerName} · ${claim.claimNumber}`,
    },
    {
      id: "upload",
      label: "Document upload",
      status:
        stage === "UPLOAD"
          ? "current"
          : stageIndex(stage) > stageIndex("UPLOAD")
            ? "complete"
            : "unavailable",
      detail:
        stage === "UPLOAD"
          ? "Ready to upload documents once Phase 2 is enabled."
          : "Not available until Phase 2.",
    },
    {
      id: "parse",
      label: "Parse documents",
      status: readinessForStage(stage, "PARSE", 2),
      detail: "Not available until Phase 2.",
    },
    {
      id: "human-review",
      label: "Human review",
      status: readinessForStage(stage, "HUMAN_REVIEW", 2),
      detail: "Not available until Phase 2.",
    },
    {
      id: "comparison",
      label: "Measurement comparison",
      status: readinessForStage(stage, "MEASUREMENT_COMPARISON", 3),
      detail: "Not available until Phase 3.",
    },
    {
      id: "issues",
      label: "Rule/issue detection",
      status: readinessForStage(stage, "RULE_ISSUE_DETECTION", 4),
      detail: "Not available until Phase 4.",
    },
    {
      id: "evidence",
      label: "Evidence validation",
      status: readinessForStage(stage, "EVIDENCE_VALIDATION", 5),
      detail: "Not available until Phase 5.",
    },
    {
      id: "generation",
      label: "Output generation",
      status: readinessForStage(stage, "GENERATION", 6),
      detail: "Not available until Phase 6.",
    },
    {
      id: "approval",
      label: "Human approval",
      status: readinessForStage(stage, "HUMAN_APPROVAL", 7),
      detail: "Not available until Phase 7.",
    },
    {
      id: "export",
      label: "Export",
      status: readinessForStage(stage, "EXPORT", 7),
      detail: "Not available until Phase 7.",
    },
  ];
}

function stageIndex(stage: WorkflowStage): number {
  const order: WorkflowStage[] = [
    "UPLOAD",
    "PARSE",
    "HUMAN_REVIEW",
    "MEASUREMENT_COMPARISON",
    "RULE_ISSUE_DETECTION",
    "EVIDENCE_VALIDATION",
    "GENERATION",
    "HUMAN_APPROVAL",
    "EXPORT",
  ];
  return order.indexOf(stage);
}

function readinessForStage(
  current: WorkflowStage,
  step: WorkflowStage,
  phase: number,
): ReadinessItem["status"] {
  const currentIdx = stageIndex(current);
  const stepIdx = stageIndex(step);

  if (current === step) {
    return "current";
  }
  if (currentIdx > stepIdx) {
    return "complete";
  }
  if (phase > 1) {
    return "unavailable";
  }
  return "locked";
}
