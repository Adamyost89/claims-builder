"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type DocumentViewerMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  type: string;
  fileSize: number;
  parseStatus: string;
  classificationConfidence: number | null;
  createdAt: string;
  metadataJson: string | null;
};

export function DocumentViewer({
  claimId,
  document,
}: {
  claimId: string;
  document: DocumentViewerMeta | null;
}) {
  if (!document) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>File viewer</CardTitle>
          <CardDescription>Select a document to preview.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fileUrl = `/api/claims/${claimId}/documents/${document.id}/file`;
  const isPdf = document.mimeType === "application/pdf";
  const isImage =
    document.mimeType === "image/jpeg" || document.mimeType === "image/png";

  let metadata: Record<string, unknown> = {};
  if (document.metadataJson) {
    try {
      metadata = JSON.parse(document.metadataJson) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{document.fileName}</CardTitle>
        <CardDescription>
          {document.type.replaceAll("_", " ")} · {document.mimeType} ·{" "}
          {(document.fileSize / 1024).toFixed(1)} KB
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-zinc-500">Parse status</dt>
          <dd>{document.parseStatus}</dd>
          <dt className="text-zinc-500">Classification confidence</dt>
          <dd>
            {document.classificationConfidence != null
              ? `${(document.classificationConfidence * 100).toFixed(0)}% (manual)`
              : "—"}
          </dd>
          <dt className="text-zinc-500">Uploaded</dt>
          <dd>{new Date(document.createdAt).toLocaleString()}</dd>
          {metadata.classificationMethod != null && (
            <>
              <dt className="text-zinc-500">Classification method</dt>
              <dd>{String(metadata.classificationMethod)}</dd>
            </>
          )}
        </dl>

        {isPdf && (
          <iframe
            src={fileUrl}
            title={document.fileName}
            className="h-[480px] w-full rounded-md border border-zinc-200"
          />
        )}

        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileUrl}
            alt={document.fileName}
            className="max-h-[480px] w-full rounded-md border border-zinc-200 object-contain"
          />
        )}

        {!isPdf && !isImage && (
          <p className="text-sm text-zinc-600">
            Preview not available for this file type.{" "}
            <a href={fileUrl} className="font-medium text-zinc-900 underline" download>
              Download {document.fileName}
            </a>
          </p>
        )}

        <p className="text-xs text-zinc-500">
          Extraction and provenance drill-down ship in Phase 2B. No parsing has been run.
        </p>
      </CardContent>
    </Card>
  );
}
