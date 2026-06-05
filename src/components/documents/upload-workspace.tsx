"use client";

import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DocumentList, type DocumentListItem } from "@/components/documents/document-list";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import {
  DocumentViewer,
  type DocumentViewerMeta,
} from "@/components/documents/document-viewer";

export function UploadWorkspace({
  claimId,
  documents,
  canUpload,
  canDelete,
}: {
  claimId: string;
  documents: DocumentListItem[];
  canUpload: boolean;
  canDelete: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    documents[0]?.id ?? null,
  );

  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const viewerDoc: DocumentViewerMeta | null = selected
    ? {
        id: selected.id,
        fileName: selected.fileName,
        mimeType: selected.mimeType,
        type: selected.type,
        fileSize: selected.fileSize,
        parseStatus: selected.parseStatus,
        classificationConfidence: selected.classificationConfidence,
        createdAt: selected.createdAt,
        metadataJson: selected.metadataJson ?? null,
      }
    : null;

  return (
    <div className="space-y-6">
      {canUpload && (
        <Card>
          <CardHeader>
            <CardTitle>Upload document</CardTitle>
            <CardDescription>
              Phase 2A — store and classify only. No parsing or AI extraction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentUploadForm claimId={claimId} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>{documents.length} file(s) on this claim</CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentList
              claimId={claimId}
              documents={documents}
              canDelete={canDelete}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </CardContent>
        </Card>

        <DocumentViewer claimId={claimId} document={viewerDoc} />
      </div>
    </div>
  );
}
