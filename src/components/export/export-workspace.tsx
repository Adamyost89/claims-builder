"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRY_RUN_WATERMARK } from "@/lib/export/constants";

type ApprovedOutput = {
  id: string;
  outputMode: string;
  version: number;
  status: string;
  approvedAt: string | Date | null;
  exportedAt: string | Date | null;
  contentText: string | null;
  generationBlocked: boolean;
  toneLintPassed: boolean;
  isMockGeneration: boolean;
  gateAllowed: boolean;
  gateBlockers: string[];
  gateWatermarked: boolean;
  isReExport: boolean;
};

export function ExportWorkspace({
  claimId,
  outputs,
  canExport,
  claimIsDryRun,
  hasAdminOverride,
  overrideStatus,
  productionOverrideNote,
}: {
  claimId: string;
  outputs: ApprovedOutput[];
  canExport: boolean;
  claimIsDryRun: boolean;
  hasAdminOverride: boolean;
  overrideStatus: "none" | "active" | "revoked" | "expired";
  productionOverrideNote: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(outputs[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => outputs.find((output) => output.id === selectedId) ?? null,
    [outputs, selectedId],
  );

  const exportDisabled = !selected?.gateAllowed;

  async function runExport(format: "clipboard" | "docx" | "pdf") {
    if (!selectedId) {
      setError("outputId is required.");
      return;
    }
    setBusy(format);
    setError(null);
    setClipboardMessage(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId: selectedId, format }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Export failed");
      }

      if (format === "clipboard") {
        const data = (await response.json()) as { text: string; watermarked?: boolean };
        await navigator.clipboard.writeText(data.text);
        setClipboardMessage(
          data.watermarked
            ? "Copied to clipboard with dry-run watermark."
            : "Copied to clipboard.",
        );
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const fileName =
        disposition?.match(/filename="(.+)"/)?.[1] ??
        `export-${selectedId}.${format === "docx" ? "docx" : "pdf"}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  if (outputs.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        No approved outputs available. Approve a valid draft before export.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {hasAdminOverride ? (
        <div
          role="alert"
          className="rounded-md border-2 border-amber-500 bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950"
        >
          <p className="text-base font-bold uppercase tracking-wide">
            Production override active — carrier-ready export permitted
          </p>
          <p className="mt-1">
            Carrier-ready export is allowed despite production blockers. This does not certify
            parsers, issue detection, or dry-run counts.
          </p>
          {productionOverrideNote ? (
            <p className="mt-2 text-xs">Override note: {productionOverrideNote}</p>
          ) : null}
          <Link className="mt-2 inline-block text-xs underline" href="/settings/production">
            View production dashboard
          </Link>
        </div>
      ) : overrideStatus === "revoked" || overrideStatus === "expired" ? (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Production override is {overrideStatus}. Carrier-ready export follows normal production
          guards.
        </div>
      ) : null}

      {claimIsDryRun ? (
        <div
          role="alert"
          className="rounded-md border-2 border-blue-500 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-950"
        >
          DRY RUN — NOT FOR CARRIER SUBMISSION. Allowed carrier-ready exports will include:{" "}
          <span className="font-mono text-xs">{DRY_RUN_WATERMARK}</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {clipboardMessage ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {clipboardMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Select</th>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Gate status</th>
              <th className="px-3 py-2">Approved</th>
            </tr>
          </thead>
          <tbody>
            {outputs.map((output) => (
              <tr key={output.id} className="border-t align-top">
                <td className="px-3 py-2">
                  <input
                    type="radio"
                    name="export-output"
                    checked={selectedId === output.id}
                    onChange={() => setSelectedId(output.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  v{output.version}
                  {output.isMockGeneration ? (
                    <Badge className="ml-2" variant="destructive">
                      Mock
                    </Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2">{output.outputMode.replaceAll("_", " ")}</td>
                <td className="px-3 py-2">
                  {output.gateAllowed ? (
                    <div className="space-y-1">
                      <Badge>Export allowed</Badge>
                      {output.isReExport ? (
                        <p className="text-xs text-zinc-600">
                          Re-export allowed (previously exported
                          {output.exportedAt
                            ? ` ${new Date(output.exportedAt).toLocaleString()}`
                            : ""}
                          ).
                        </p>
                      ) : null}
                      {output.gateWatermarked ? (
                        <p className="text-xs font-semibold text-blue-900">
                          {DRY_RUN_WATERMARK}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Badge variant="destructive">Export blocked</Badge>
                      <ul className="list-disc pl-4 text-xs text-red-800">
                        {output.gateBlockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {output.approvedAt
                    ? new Date(output.approvedAt).toLocaleString()
                    : "approved"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canExport ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy !== null || exportDisabled}
            onClick={() => void runExport("clipboard")}
          >
            {busy === "clipboard" ? "Copying…" : "Copy to clipboard"}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null || exportDisabled}
            onClick={() => void runExport("docx")}
          >
            {busy === "docx" ? "Exporting…" : "Download DOCX"}
          </Button>
          <Button
            disabled={busy !== null || exportDisabled}
            onClick={() => void runExport("pdf")}
          >
            {busy === "pdf" ? "Exporting…" : "Download PDF"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-zinc-600">
          Only managers and admins can export output.
        </p>
      )}

      {selected ? (
        <div className="rounded-md border p-4">
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge>{selected.outputMode.replaceAll("_", " ")}</Badge>
            <Badge variant="outline">v{selected.version}</Badge>
            <Badge variant="outline">{selected.status}</Badge>
            {selected.isMockGeneration ? (
              <Badge variant="destructive">Mock generation</Badge>
            ) : null}
            {selected.gateAllowed ? (
              <Badge>Gate passed</Badge>
            ) : (
              <Badge variant="destructive">Gate blocked</Badge>
            )}
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm">
            {selected.contentText ?? "No content"}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
