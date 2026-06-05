import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { CertificationWarning } from "@/components/shared/certification-warning";
import { EvidenceMatrixWorkspace } from "@/components/evidence/evidence-matrix-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import { getClaimEvidenceMatrix } from "@/lib/evidence/service";
import { canEditClaims } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function EvidenceMatrixPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const data = await getClaimEvidenceMatrix(claimId);
  const canEdit = session?.user ? canEditClaims(session.user.role) : false;

  return (
    <div className="space-y-6">
      <CertificationWarning phase="Evidence validation (Phase 5)" />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Evidence matrix</h1>
        <p className="text-sm text-zinc-600">
          Link deterministic evidence to each revision before carrier-ready generation. Evidence
          validation is the gate between detected issues and export-eligible arguments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revision evidence readiness</CardTitle>
          <CardDescription>
            Required evidence types are derived from issue category. Auto-links apply for
            comparisons and rules; photos, invoices, and policy documents are never auto-linked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EvidenceMatrixWorkspace
            claimId={claimId}
            canEdit={canEdit}
            issuesReviewedAt={data?.claim.issuesReviewedAt ?? null}
            evidenceReviewedAt={data?.claim.evidenceReviewedAt ?? null}
            sources={
              data?.sources ?? {
                documents: [],
                photos: [],
                extractions: [],
                lineItems: [],
                measurements: [],
                comparisons: [],
                calculations: [],
                rules: [],
              }
            }
            rows={(data?.rows ?? []).map((row) => ({
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
              status: row.status,
              readinessStatus: row.readinessStatus,
              exportEligible: row.exportEligible,
              requiredEvidenceTypes: row.requiredEvidenceTypes,
              requirementGroups: row.requirementGroups.map((group) =>
                group.map((type) => String(type)),
              ),
              linkedEvidence: row.linkedEvidence,
              overrideById: row.overrideById,
              overrideNote: row.overrideNote,
              overriddenAt: row.overriddenAt,
              overrideBy: row.overrideBy,
              evaluation: row.evaluation,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
