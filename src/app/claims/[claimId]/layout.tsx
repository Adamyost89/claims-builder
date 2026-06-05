import { notFound } from "next/navigation";

import { ClaimHubSidebar } from "@/components/claim-hub/sidebar";
import { getClaimById } from "@/lib/claims/service";

export default async function ClaimHubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1">
      <ClaimHubSidebar
        claimId={claim.id}
        customerName={claim.customerName}
        workflowStage={claim.workflowStage}
      />
      <div className="min-w-0 flex-1 p-6">{children}</div>
    </div>
  );
}
