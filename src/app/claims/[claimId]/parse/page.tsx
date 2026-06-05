import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { ParseDocumentsPanel } from "@/components/parse/parse-documents-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import { listClaimDocuments } from "@/lib/documents/service";
import { canEditClaims } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimParsePage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const documents = await listClaimDocuments(claimId);
  const canParse = session?.user ? canEditClaims(session.user.role) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Parse</h1>
        <p className="text-sm text-zinc-600">
          Heuristic parsing only — no AI. Results require human review before later phases.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Run deterministic parsers on uploaded carrier estimates and measurement reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParseDocumentsPanel
            claimId={claimId}
            canParse={canParse}
            documents={documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              type: d.type,
              parseStatus: d.parseStatus,
              confidence: d.confidence,
              parseError: d.parseError,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
