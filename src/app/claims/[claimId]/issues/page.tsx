import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { IssuesWorkspace } from "@/components/issues/issues-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import { getClaimIssues } from "@/lib/issues/service";
import { canEditClaims } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimIssuesPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const data = await getClaimIssues(claimId);
  const canEdit = session?.user ? canEditClaims(session.user.role) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rule / issue detection</h1>
        <p className="text-sm text-zinc-600">
          Deterministic issue detection for {claim.customerName}. Revision items are created from
          reviewed comparisons and accepted parsed data only — no AI, no carrier-ready language.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revision items</CardTitle>
          <CardDescription>
            Grouped by category. Include, exclude, or mark needs evidence before sign-off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IssuesWorkspace
            claimId={claimId}
            canEdit={canEdit}
            comparisonReviewedAt={data?.claim.comparisonReviewedAt ?? null}
            issuesReviewedAt={data?.claim.issuesReviewedAt ?? null}
            revisions={(data?.revisions ?? []).map((row) => ({
              id: row.id,
              title: row.title,
              category: row.category,
              carrierApprovedLineItem: row.carrierApprovedLineItem,
              carrierApprovedQty: row.carrierApprovedQty,
              carrierApprovedUnit: row.carrierApprovedUnit,
              requestedLineItem: row.requestedLineItem,
              requestedQty: row.requestedQty,
              requestedUnit: row.requestedUnit,
              qtyDifference: row.qtyDifference,
              calculationMethod: row.calculationMethod,
              basis: row.basis,
              revisionRequired: row.revisionRequired,
              status: row.status,
              readinessStatus: row.readinessStatus,
              exportEligible: row.exportEligible,
              requiredEvidenceTypes: row.requiredEvidenceTypes,
              sourceDetectionType: row.sourceDetectionType,
              comparison: row.comparison
                ? {
                    comparisonKey: row.comparison.comparisonKey,
                    formula: row.comparison.formula,
                    approvedQty: row.comparison.approvedQty,
                    requestedQty: row.comparison.requestedQty,
                    difference: row.comparison.difference,
                  }
                : null,
              rule: row.rule,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
