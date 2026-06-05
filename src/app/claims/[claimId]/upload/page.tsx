import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { UploadWorkspace } from "@/components/documents/upload-workspace";
import { getClaimById } from "@/lib/claims/service";
import { listClaimDocuments } from "@/lib/documents/service";
import { canEditClaims } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimUploadPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const documents = await listClaimDocuments(claimId);
  const canEdit = session?.user ? canEditClaims(session.user.role) : false;

  const listItems = documents.map((doc) => ({
    id: doc.id,
    fileName: doc.fileName,
    type: doc.type,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    parseStatus: doc.parseStatus,
    classificationConfidence: doc.classificationConfidence,
    createdAt: doc.createdAt.toISOString(),
    uploadedBy: { name: doc.uploadedBy.name },
    _count: { extractions: doc._count.extractions },
    metadataJson: doc.metadataJson,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
        <p className="text-sm text-zinc-600">
          Upload, classify, view, and manage documents for {claim.customerName}.
        </p>
      </div>
      <UploadWorkspace
        claimId={claimId}
        documents={listItems}
        canUpload={canEdit}
        canDelete={canEdit}
      />
    </div>
  );
}
