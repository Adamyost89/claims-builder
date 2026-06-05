"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkflowStage } from "@prisma/client";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CURRENT_SHIPPED_PHASE } from "@/lib/project-phase";
import {
  isWorkflowStageLocked,
  WORKFLOW_STEPS,
} from "@/lib/workflow/stages";

type ClaimHubSidebarProps = {
  claimId: string;
  customerName: string;
  workflowStage: WorkflowStage;
};

export function ClaimHubSidebar({
  claimId,
  customerName,
  workflowStage,
}: ClaimHubSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white p-4">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Workspace
        </p>
        <h2 className="mt-1 text-lg font-semibold leading-tight">{customerName}</h2>
        <Badge variant="outline" className="mt-2">
          {workflowStage.replaceAll("_", " ")}
        </Badge>
      </div>

      <nav className="space-y-1 text-sm">
        <SidebarLink
          href={`/claims/${claimId}`}
          active={pathname === `/claims/${claimId}`}
          label="Overview"
        />
        <SidebarLink
          href={`/claims/${claimId}/notes`}
          active={pathname === `/claims/${claimId}/notes`}
          label="Notes"
        />
        <SidebarLink
          href={`/claims/${claimId}/confidence-queue`}
          active={pathname === `/claims/${claimId}/confidence-queue`}
          label="Confidence queue"
        />
        <SidebarLink
          href={`/claims/${claimId}/outputs`}
          active={pathname === `/claims/${claimId}/outputs`}
          label="Output history"
        />

        <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Workflow
        </p>

        {WORKFLOW_STEPS.map((step) => {
          const locked = isWorkflowStageLocked(workflowStage, step.stage);
          const isCurrent = workflowStage === step.stage;
          const href = step.href(claimId);
          const phaseLocked = step.availableFromPhase > CURRENT_SHIPPED_PHASE;

          if (locked) {
            return (
              <div
                key={step.stage}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-400"
              >
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>{step.label}</span>
              </div>
            );
          }

          return (
            <SidebarLink
              key={step.stage}
              href={href}
              active={pathname === href}
              label={step.label}
              suffix={
                isCurrent ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Current
                  </Badge>
                ) : phaseLocked ? (
                  <span className="text-[10px] text-zinc-400">Phase {step.availableFromPhase}</span>
                ) : null
              }
            />
          );
        })}
      </nav>
    </aside>
  );
}

function SidebarLink({
  href,
  active,
  label,
  suffix,
}: {
  href: string;
  active: boolean;
  label: string;
  suffix?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-3 py-2 transition-colors",
        active
          ? "bg-zinc-100 font-medium text-zinc-900"
          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
      )}
    >
      <span>{label}</span>
      {suffix}
    </Link>
  );
}
