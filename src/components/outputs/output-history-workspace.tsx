"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type OutputRow = {
  id: string;
  outputMode: string;
  status: string;
  version: number;
  generationBlocked: boolean;
  isMockGeneration: boolean;
  toneLintPassed: boolean;
  createdAt: string | Date;
  approvedAt: string | Date | null;
  locked: boolean;
  approvable: boolean;
  content: {
    title: string;
    sections: { revisionItemId: string; heading: string; body: string }[];
  };
  contentText: string | null;
  approvedBy: { name: string | null; email: string } | null;
  exportedAt: string | Date | null;
  exportedBy: { name: string | null; email: string } | null;
  exportFormat: string | null;
};

export function OutputHistoryWorkspace({
  claimId,
  outputs,
  canDeleteBlocked,
}: {
  claimId: string;
  outputs: OutputRow[];
  canDeleteBlocked: boolean;
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deleteOutput(outputId: string) {
    setBusy(outputId);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/outputs/${outputId}`, {
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
      setBusy(null);
    }
  }

  if (outputs.length === 0) {
    return <p className="text-sm text-zinc-600">No generated outputs yet.</p>;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Blocked</th>
              <th className="px-3 py-2">Mock</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Approved</th>
              <th className="px-3 py-2">Exported</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {outputs.map((output) => (
              <tr key={output.id} className="border-t align-top">
                <td className="px-3 py-2">v{output.version}</td>
                <td className="px-3 py-2">{output.outputMode.replaceAll("_", " ")}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline">{output.status}</Badge>
                </td>
                <td className="px-3 py-2">
                  {output.generationBlocked ? (
                    <Badge variant="destructive">Yes</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </td>
                <td className="px-3 py-2">{output.isMockGeneration ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{new Date(output.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {output.approvedAt ? (
                    <div>
                      <p>{new Date(output.approvedAt).toLocaleString()}</p>
                      <p className="text-xs text-zinc-500">
                        {output.approvedBy?.name ?? output.approvedBy?.email ?? "—"}
                      </p>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {output.exportedAt ? (
                    <div>
                      <p>{new Date(output.exportedAt).toLocaleString()}</p>
                      <p className="text-xs text-zinc-500">
                        {output.exportFormat ?? "—"} by{" "}
                        {output.exportedBy?.name ?? output.exportedBy?.email ?? "—"}
                      </p>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setExpandedId(expandedId === output.id ? null : output.id)
                      }
                    >
                      {expandedId === output.id ? "Hide" : "View"}
                    </Button>
                    {canDeleteBlocked &&
                    output.status === "DRAFT" &&
                    output.generationBlocked ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy !== null}
                        onClick={() => void deleteOutput(output.id)}
                      >
                        Delete blocked draft
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {expandedId ? (
        <div className="rounded-md border p-4">
          {(() => {
            const output = outputs.find((row) => row.id === expandedId);
            if (!output) {
              return null;
            }
            return (
              <>
                <h3 className="font-medium">{output.content.title}</h3>
                {output.locked ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Approved versions are locked and cannot be mutated.
                  </p>
                ) : null}
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm">
                  {output.contentText ?? "No content"}
                </pre>
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
