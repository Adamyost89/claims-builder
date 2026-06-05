import { WorkflowStage } from "@prisma/client";

export type WorkflowStepConfig = {
  stage: WorkflowStage;
  label: string;
  href: (claimId: string) => string;
  availableFromPhase: number;
  description: string;
};

export const WORKFLOW_STAGE_ORDER: WorkflowStage[] = [
  WorkflowStage.UPLOAD,
  WorkflowStage.PARSE,
  WorkflowStage.HUMAN_REVIEW,
  WorkflowStage.MEASUREMENT_COMPARISON,
  WorkflowStage.RULE_ISSUE_DETECTION,
  WorkflowStage.EVIDENCE_VALIDATION,
  WorkflowStage.GENERATION,
  WorkflowStage.HUMAN_APPROVAL,
  WorkflowStage.EXPORT,
];

export const WORKFLOW_STEPS: WorkflowStepConfig[] = [
  {
    stage: WorkflowStage.UPLOAD,
    label: "Upload",
    href: (id) => `/claims/${id}/upload`,
    availableFromPhase: 2,
    description: "Upload carrier estimates, measurements, and supporting documents.",
  },
  {
    stage: WorkflowStage.PARSE,
    label: "Parse",
    href: (id) => `/claims/${id}/parse`,
    availableFromPhase: 2,
    description: "Parse uploaded documents into structured line items.",
  },
  {
    stage: WorkflowStage.HUMAN_REVIEW,
    label: "Human Review",
    href: (id) => `/claims/${id}/estimates`,
    availableFromPhase: 2,
    description: "Review parsed data and resolve confidence queue items.",
  },
  {
    stage: WorkflowStage.MEASUREMENT_COMPARISON,
    label: "Measurement Comparison",
    href: (id) => `/claims/${id}/comparison`,
    availableFromPhase: 3,
    description: "Compare carrier quantities against third-party measurements.",
  },
  {
    stage: WorkflowStage.RULE_ISSUE_DETECTION,
    label: "Rule/Issue Detection",
    href: (id) => `/claims/${id}/issues`,
    availableFromPhase: 4,
    description: "Detect omitted items, deficiencies, and rule triggers. Review revision items.",
  },
  {
    stage: WorkflowStage.EVIDENCE_VALIDATION,
    label: "Evidence Validation",
    href: (id) => `/claims/${id}/evidence-matrix`,
    availableFromPhase: 5,
    description: "Link evidence and validate revision readiness.",
  },
  {
    stage: WorkflowStage.GENERATION,
    label: "Generation",
    href: (id) => `/claims/${id}/generate`,
    availableFromPhase: 6,
    description: "Assemble carrier-ready draft language from validated evidence payload only.",
  },
  {
    stage: WorkflowStage.HUMAN_APPROVAL,
    label: "Human Approval",
    href: (id) => `/claims/${id}/approve`,
    availableFromPhase: 7,
    description: "Section-level review and manager approval before export.",
  },
  {
    stage: WorkflowStage.EXPORT,
    label: "Export",
    href: (id) => `/claims/${id}/export`,
    availableFromPhase: 7,
    description: "Export approved output to clipboard, DOCX, or PDF.",
  },
];

export function getWorkflowStageIndex(stage: WorkflowStage): number {
  return WORKFLOW_STAGE_ORDER.indexOf(stage);
}

export function getNextWorkflowStage(
  current: WorkflowStage,
): WorkflowStage | null {
  const index = getWorkflowStageIndex(current);
  if (index < 0 || index >= WORKFLOW_STAGE_ORDER.length - 1) {
    return null;
  }
  return WORKFLOW_STAGE_ORDER[index + 1];
}

export function isWorkflowStageLocked(
  currentStage: WorkflowStage,
  stepStage: WorkflowStage,
): boolean {
  return getWorkflowStageIndex(stepStage) > getWorkflowStageIndex(currentStage);
}

export function isWorkflowStepNavigable(
  currentStage: WorkflowStage,
  step: WorkflowStepConfig,
): boolean {
  if (isWorkflowStageLocked(currentStage, step.stage)) {
    return false;
  }
  return step.availableFromPhase <= 1 || step.stage === WorkflowStage.UPLOAD;
}
