import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { ClaimHubSidebar } from "@/components/claim-hub/sidebar";
import { WorkflowAdvancePanel } from "@/components/claim-hub/workflow-advance-panel";
import { getClaimById } from "@/lib/claims/service";
import { canAdvanceWorkflow } from "@/lib/rbac";

export default async function ClaimHubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const [claim, session] = await Promise.all([
    getClaimById(claimId),
    getServerSession(authOptions),
  ]);
  if (!claim) {
    notFound();
  }

  const canAdvance = session?.user
    ? canAdvanceWorkflow(session.user.role)
    : false;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1">
      <ClaimHubSidebar
        claimId={claim.id}
        customerName={claim.customerName}
        workflowStage={claim.workflowStage}
      />
      <div className="min-w-0 flex-1 p-6">
        <WorkflowAdvancePanel
          claimId={claim.id}
          workflowStage={claim.workflowStage}
          canAdvance={canAdvance}
        />
        {children}
      </div>
    </div>
  );
}
