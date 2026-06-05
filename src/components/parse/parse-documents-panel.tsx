"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DocRow = {
  id: string;
  fileName: string;
  type: string;
  parseStatus: string;
  confidence: number | null;
  parseError: string | null;
};

export function ParseDocumentsPanel({
  claimId,
  documents,
  canParse,
}: {
  claimId: string;
  documents: DocRow[];
  canParse: boolean;
}) {
  const router = useRouter();
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseableTypes = new Set([
    "CARRIER_ESTIMATE",
    "CONTRACTOR_ESTIMATE",
    "EAGLEVIEW",
    "HOVER",
    "GAF",
    "ITEL",
  ]);

  async function parseDocument(documentId: string) {
    setParsingId(documentId);
    setError(null);
    try {
      const response = await fetch(
        `/api/claims/${claimId}/documents/${documentId}/parse`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Parse failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsingId(null);
    }
  }

  const parseable = documents.filter((d) => parseableTypes.has(d.type));

  if (parseable.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        Upload a carrier estimate or measurement report before parsing.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
        {parseable.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{doc.fileName}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline">{doc.type.replaceAll("_", " ")}</Badge>
                <Badge variant="secondary">{doc.parseStatus}</Badge>
                {doc.confidence != null && (
                  <span className="text-xs text-zinc-500">
                    {(doc.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
              {doc.parseError && (
                <p className="mt-1 text-xs text-red-600">{doc.parseError}</p>
              )}
            </div>
            {canParse && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={parsingId === doc.id || doc.parseStatus === "PROCESSING"}
                onClick={() => parseDocument(doc.id)}
              >
                {parsingId === doc.id ? "Parsing…" : "Parse"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
