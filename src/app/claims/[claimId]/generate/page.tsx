import { OutputMode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { CertificationWarning } from "@/components/shared/certification-warning";
import { GenerationWorkspace } from "@/components/generation/generation-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import {
  getGenerationPreview,
  getLatestGeneratedDraft,
} from "@/lib/generation/service";
import { evaluateProductionReadiness } from "@/lib/production/readiness";
import { canEditClaims } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function GeneratePage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const canEdit = session?.user ? canEditClaims(session.user.role) : false;
  const [production, draft] = await Promise.all([
    evaluateProductionReadiness(),
    getLatestGeneratedDraft(claimId),
  ]);

  let preview = {
    exportEligibleCount: 0,
    excludedCount: 0,
    unresolvedCount: 0,
    payload: {},
  };

  if (claim.evidenceReviewedAt) {
    try {
      preview = await getGenerationPreview(claimId, OutputMode.FULL_SUPPLEMENT);
    } catch {
      preview = {
        exportEligibleCount: 0,
        excludedCount: 0,
        unresolvedCount: 0,
        payload: {},
      };
    }
  }

  return (
    <div className="space-y-6">
      <CertificationWarning phase="Generation (Phase 6)" />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generation</h1>
        <p className="text-sm text-zinc-600">
          Assemble carrier-ready draft language from export-eligible revisions and linked evidence
          only. OpenAI cannot invent facts, quantities, citations, or revisions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Output generation</CardTitle>
          <CardDescription>
            Select an output mode, review the payload preview, and generate a DRAFT. Approval and
            export are not available in Phase 6.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerationWorkspace
            claimId={claimId}
            canEdit={canEdit}
            evidenceReviewedAt={claim.evidenceReviewedAt}
            productionReady={production.productionReady}
            productionBlockers={production.blockers}
            initialDraft={draft}
            initialPreview={preview}
          />
        </CardContent>
      </Card>
    </div>
  );
}
