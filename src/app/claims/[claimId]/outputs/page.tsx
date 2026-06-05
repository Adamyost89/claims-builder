import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { OutputHistoryWorkspace } from "@/components/outputs/output-history-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOutputHistory } from "@/lib/approval/service";
import { getClaimById } from "@/lib/claims/service";
import { canApproveExport } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function OutputHistoryPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const outputs = await getOutputHistory(claimId);
  const canDeleteBlocked = session?.user ? canApproveExport(session.user.role) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Output history</h1>
        <p className="text-sm text-zinc-600">
          All generated output versions for {claim.customerName}. Approved records are locked and
          cannot be mutated.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generated outputs</CardTitle>
          <CardDescription>
            View draft, approved, and exported versions. Managers and admins may delete blocked
            drafts only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OutputHistoryWorkspace
            claimId={claimId}
            canDeleteBlocked={canDeleteBlocked}
            outputs={outputs.map((output) => ({
              id: output.id,
              outputMode: output.outputMode,
              status: output.status,
              version: output.version,
              generationBlocked: output.generationBlocked,
              isMockGeneration: output.isMockGeneration,
              toneLintPassed: output.toneLintPassed,
              createdAt: output.createdAt,
              approvedAt: output.approvedAt,
              locked: output.locked,
              approvable: output.approvable,
              content: output.content,
              contentText: output.contentText,
              approvedBy: output.approvedBy,
              exportedAt: output.exportedAt,
              exportedBy: output.exportedBy,
              exportFormat: output.exportFormat,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
