import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { ParsedReviewPanel } from "@/components/parse/parsed-review-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import { getParsedDataForClaim } from "@/lib/parse/service";
import { canEditClaims } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimEstimatesReviewPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const data = await getParsedDataForClaim(claimId);
  const canReview = session?.user ? canEditClaims(session.user.role) : false;

  const measurements = data.reports.flatMap((report) =>
    report.values.map((v) => ({
      ...v,
      reviewedAt: v.reviewedAt,
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Parsed data review</h1>
        <p className="text-sm text-zinc-600">
          Review extracted fields, estimate line items, and measurements for {claim.customerName}.
          Rejected values are excluded from later phases.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Parse status and confidence by uploaded file.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {data.documents.map((doc) => (
              <li key={doc.id} className="flex justify-between gap-4 border-b border-zinc-100 py-2">
                <span>
                  {doc.fileName} · {doc.type.replaceAll("_", " ")}
                </span>
                <span className="text-zinc-600">
                  {doc.parseStatus}
                  {doc.confidence != null ? ` · ${(doc.confidence * 100).toFixed(0)}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review extracted data</CardTitle>
          <CardDescription>
            Every value shows source page, source text, and confidence. Accept, reject, or edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParsedReviewPanel
            claimId={claimId}
            canReview={canReview}
            extractions={data.extractions}
            lineItems={data.lineItems}
            measurements={measurements}
          />
        </CardContent>
      </Card>
    </div>
  );
}
