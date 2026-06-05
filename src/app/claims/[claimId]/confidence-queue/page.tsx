import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { ConfidenceQueuePanel } from "@/components/parse/confidence-queue-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listConfidenceQueue } from "@/lib/confidence/queue";
import { getClaimById } from "@/lib/claims/service";
import { canEditClaims } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ConfidenceQueuePage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const items = await listConfidenceQueue(claimId);
  const canResolve = session?.user ? canEditClaims(session.user.role) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Confidence review queue</h1>
        <p className="text-sm text-zinc-600">
          Low-confidence and uncertified-parser results must be resolved before measurement comparison.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending items</CardTitle>
          <CardDescription>
            {items.filter((i) => i.resolution === "PENDING").length} item(s) blocking downstream work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfidenceQueuePanel
            claimId={claimId}
            canResolve={canResolve}
            items={items.map((i) => ({
              id: i.id,
              reviewType: i.reviewType,
              relatedTable: i.relatedTable,
              relatedId: i.relatedId,
              confidence: i.confidence,
              reason: i.reason,
              resolution: i.resolution,
              blocksOutput: i.blocksOutput,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
