import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { ComparisonWorkspace } from "@/components/comparison/comparison-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import { getClaimComparisons } from "@/lib/comparison/service";
import { canEditClaims } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimComparisonPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const data = await getClaimComparisons(claimId);
  const canEdit = session?.user ? canEditClaims(session.user.role) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Measurement comparison</h1>
        <p className="text-sm text-zinc-600">
          Deterministic comparison of carrier-approved quantities vs measurement-supported
          requests for {claim.customerName}. Only accepted or edited parsed data is used.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparison results</CardTitle>
          <CardDescription>
            Formulas are deterministic. Re-run after accepting or editing new parsed data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComparisonWorkspace
            claimId={claimId}
            canEdit={canEdit}
            comparisonReviewedAt={data?.claim.comparisonReviewedAt ?? null}
            results={(data?.results ?? []).map((row) => ({
              id: row.id,
              comparisonKey: row.comparisonKey,
              approvedQty: row.approvedQty,
              requestedQty: row.requestedQty,
              difference: row.difference,
              pctDifference: row.pctDifference,
              formula: row.formula,
              physicallySufficient: row.physicallySufficient,
              explanation: row.explanation,
              isWarning: row.isWarning,
              unit: row.unit,
              sourceDocuments: row.sourceDocuments,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
