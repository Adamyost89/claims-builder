import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { ApprovalWorkspace } from "@/components/approval/approval-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getApprovalDrafts } from "@/lib/approval/service";
import { getClaimById } from "@/lib/claims/service";
import { canApproveExport } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ApprovePage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const data = await getApprovalDrafts(claimId);
  const canApprove = session?.user ? canApproveExport(session.user.role) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Human approval</h1>
        <p className="text-sm text-zinc-600">
          Review generated drafts section by section. Blocked drafts cannot be approved. Approved
          versions are locked for export.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Draft outputs</CardTitle>
          <CardDescription>
            Approve only unblocked drafts with passing tone lint and no unsupported claims.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApprovalWorkspace
            claimId={claimId}
            canApprove={canApprove}
            drafts={(data?.drafts ?? []).map((draft) => ({
              id: draft.id,
              outputMode: draft.outputMode,
              version: draft.version,
              generationBlocked: draft.generationBlocked,
              toneLintPassed: draft.toneLintPassed,
              isMockGeneration: draft.isMockGeneration,
              revisionIds: draft.revisionIds,
              unsupportedClaims: draft.unsupportedClaims,
              toneViolations: draft.toneViolations,
              approvable: draft.approvable,
              content: draft.content,
              contentText: draft.contentText,
              createdAt: draft.createdAt,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
