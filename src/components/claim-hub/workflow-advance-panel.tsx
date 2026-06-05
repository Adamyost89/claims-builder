"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkflowStage } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getNextWorkflowStage,
  getWorkflowStepForStage,
  WORKFLOW_STEPS,
} from "@/lib/workflow/stages";

type WorkflowBlocker = {
  code: string;
  message: string;
  severity: string;
};

type WorkflowAdvancePanelProps = {
  claimId: string;
  workflowStage: WorkflowStage;
  canAdvance: boolean;
};

export function WorkflowAdvancePanel({
  claimId,
  workflowStage,
  canAdvance,
}: WorkflowAdvancePanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [blockers, setBlockers] = useState<WorkflowBlocker[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pageStep = WORKFLOW_STEPS.find((step) => pathname === step.href(claimId));
  if (!pageStep) {
    return null;
  }

  const currentStep = getWorkflowStepForStage(workflowStage);
  const nextStage = getNextWorkflowStage(workflowStage);
  const nextStep = nextStage ? getWorkflowStepForStage(nextStage) : null;
  const onCurrentStagePage = pageStep.stage === workflowStage;
  const showAdvanceButton = canAdvance && onCurrentStagePage && nextStage !== null;

  async function handleAdvance() {
    setLoading(true);
    setBlockers([]);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/claims/${claimId}/workflow/advance`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        blockers?: WorkflowBlocker[];
        toStage?: WorkflowStage;
      };

      if (!response.ok) {
        setErrorMessage(data.error ?? "Workflow advance failed.");
        if (data.blockers?.length) {
          setBlockers(data.blockers);
        }
        return;
      }

      router.refresh();
      const destination =
        nextStep?.href(claimId) ??
        (data.toStage ? getWorkflowStepForStage(data.toStage)?.href(claimId) : null);
      if (destination) {
        router.push(destination);
      }
    } catch {
      setErrorMessage("Network error while advancing workflow.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-6 border-zinc-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Workflow progression</CardTitle>
        <CardDescription>
          {pageStep.label} — advance one stage at a time when gates pass.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-500">Current stage:</span>
          <Badge variant="secondary">
            {currentStep?.label ?? workflowStage.replaceAll("_", " ")}
          </Badge>
          {nextStep ? (
            <>
              <span className="text-zinc-500">Next stage:</span>
              <Badge variant="outline">{nextStep.label}</Badge>
            </>
          ) : (
            <span className="text-zinc-500">No further stages</span>
          )}
        </div>

        {!onCurrentStagePage && (
          <p className="text-zinc-600">
            To advance, open the{" "}
            <span className="font-medium">{currentStep?.label ?? workflowStage}</span>{" "}
            step while the claim is at that stage.
          </p>
        )}

        {showAdvanceButton && (
          <Button type="button" onClick={handleAdvance} disabled={loading}>
            {loading
              ? "Advancing…"
              : `Advance to ${nextStep?.label ?? nextStage?.replaceAll("_", " ")}`}
          </Button>
        )}

        {!canAdvance && onCurrentStagePage && nextStage && (
          <p className="text-zinc-600">Your role cannot advance workflow.</p>
        )}

        {errorMessage && (
          <p className="font-medium text-red-700" role="alert">
            {errorMessage}
          </p>
        )}

        {blockers.length > 0 && (
          <div
            className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-950"
            role="alert"
          >
            <p className="font-medium">Workflow blocked</p>
            <ul className="space-y-2">
              {blockers.map((blocker) => (
                <li key={blocker.code} className="rounded border border-red-100 bg-white p-2">
                  <p className="font-mono text-xs text-red-800">{blocker.code}</p>
                  <p className="mt-1">{blocker.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
