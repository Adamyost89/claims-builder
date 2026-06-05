import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { ReadinessChecklist } from "@/components/claim-hub/readiness-checklist";
import { ClaimForm } from "@/components/claims/claim-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import { canEditClaims } from "@/lib/rbac";
import { buildClaimReadinessChecklist } from "@/lib/workflow/readiness";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimOverviewPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const checklist = buildClaimReadinessChecklist(claim);
  const canEdit = session?.user && canEditClaims(session.user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{claim.customerName}</h1>
        <p className="text-sm text-zinc-600">
          {claim.propertyAddress} · {claim.claimNumber} · {claim.carrier}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline">{claim.status}</Badge>
          <Badge variant="secondary">
            {claim.workflowStage.replaceAll("_", " ")}
          </Badge>
          <Badge variant="outline">{claim.claimType}</Badge>
          {claim.isDryRun && <Badge variant="outline">Dry run</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReadinessChecklist items={checklist} />

        <Card>
          <CardHeader>
            <CardTitle>Claim details</CardTitle>
            <CardDescription>Intake metadata for this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Detail label="Date of loss" value={claim.dateOfLoss.toLocaleDateString()} />
            <Detail label="Location" value={`${claim.city}, ${claim.state}${claim.county ? ` (${claim.county})` : ""}`} />
            <Detail label="Policy" value={claim.policyNumber ?? "—"} />
            <Detail label="Manufacturer" value={claim.manufacturerSystem ?? "—"} />
            <Detail label="Assigned to" value={claim.assignedTo?.name ?? "—"} />
            <Detail label="Created by" value={claim.createdBy.name} />
            <Detail label="Documents" value={String(claim._count.documents)} />
            <Detail label="Notes" value={String(claim.notes.length)} />
          </CardContent>
        </Card>
      </div>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Edit claim</CardTitle>
            <CardDescription>Updates are audit-logged.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClaimForm
              mode="edit"
              claimId={claim.id}
              initial={{
                customerName: claim.customerName,
                propertyAddress: claim.propertyAddress,
                carrier: claim.carrier,
                claimNumber: claim.claimNumber,
                policyNumber: claim.policyNumber ?? undefined,
                dateOfLoss: claim.dateOfLoss.toISOString().slice(0, 10),
                state: claim.state,
                city: claim.city,
                county: claim.county ?? undefined,
                manufacturerSystem: claim.manufacturerSystem ?? undefined,
                claimType: claim.claimType,
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium text-zinc-900">{label}:</span> {value}
    </p>
  );
}
