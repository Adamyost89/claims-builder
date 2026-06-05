"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type DocumentListItem = {
  id: string;
  fileName: string;
  type: string;
  mimeType: string;
  fileSize: number;
  parseStatus: string;
  classificationConfidence: number | null;
  createdAt: string;
  uploadedBy: { name: string };
  _count: { extractions: number };
  metadataJson?: string | null;
};

export function DocumentList({
  claimId,
  documents,
  canDelete,
  selectedId,
  onSelect,
}: {
  claimId: string;
  documents: DocumentListItem[];
  canDelete: boolean;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(documentId: string) {
    if (!confirm("Delete this document? This cannot be undone.")) {
      return;
    }
    setDeletingId(documentId);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/documents/${documentId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Delete failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  if (documents.length === 0) {
    return <p className="text-sm text-zinc-600">No documents uploaded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${
              selectedId === doc.id ? "bg-zinc-50" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(doc.id)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate font-medium text-zinc-900">{doc.fileName}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline">{doc.type.replaceAll("_", " ")}</Badge>
                <Badge variant="secondary">{doc.parseStatus}</Badge>
                <span className="text-xs text-zinc-500">
                  {(doc.fileSize / 1024).toFixed(1)} KB · {doc.uploadedBy.name}
                </span>
              </div>
            </button>
            {canDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deletingId === doc.id}
                onClick={() => handleDelete(doc.id)}
              >
                {deletingId === doc.id ? "Deleting…" : "Delete"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
