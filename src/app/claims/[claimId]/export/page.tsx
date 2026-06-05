import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { ExportWorkspace } from "@/components/export/export-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import { getApprovedOutputs } from "@/lib/export/service";
import { evaluateProductionReadiness } from "@/lib/production/readiness";
import { canExport } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ExportPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const [claim, data, productionStatus] = await Promise.all([
    getClaimById(claimId),
    getApprovedOutputs(claimId),
    evaluateProductionReadiness(),
  ]);

  if (!claim) {
    notFound();
  }

  const userCanExport = session?.user ? canExport(session.user.role) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Export</h1>
        <p className="text-sm text-zinc-600">
          Export approved output to clipboard, DOCX, or PDF. Content is taken from the locked
          approved record only — no regeneration and no OpenAI calls during export.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Approved output export</CardTitle>
          <CardDescription>
            Carrier-ready exports require production guard, admin override, or dry-run watermark.
            Previously exported outputs may be re-exported when permitted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportWorkspace
            claimId={claimId}
            canExport={userCanExport}
            claimIsDryRun={claim.isDryRun}
            hasAdminOverride={productionStatus.hasAdminOverride}
            overrideStatus={productionStatus.overrideStatus}
            productionOverrideNote={productionStatus.productionOverrideNote}
            outputs={(data?.outputsWithGate ?? []).map(({ output, gate }) => ({
              id: output.id,
              outputMode: output.outputMode,
              version: output.version,
              status: output.status,
              approvedAt: output.approvedAt,
              exportedAt: output.exportedAt,
              contentText: output.contentText,
              generationBlocked: output.generationBlocked,
              toneLintPassed: output.toneLintPassed,
              isMockGeneration: output.isMockGeneration,
              gateAllowed: gate.allowed,
              gateBlockers: gate.blockers,
              gateWatermarked: gate.watermarked,
              isReExport: gate.isReExport,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
