"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DraftRow = {
  id: string;
  outputMode: string;
  version: number;
  generationBlocked: boolean;
  toneLintPassed: boolean;
  isMockGeneration: boolean;
  revisionIds: string[];
  unsupportedClaims: { code: string; message: string }[];
  toneViolations: string[];
  approvable: boolean;
  content: {
    title: string;
    sections: { revisionItemId: string; heading: string; body: string }[];
  };
  contentText: string | null;
  createdAt: string | Date;
};

export function ApprovalWorkspace({
  claimId,
  drafts,
  canApprove,
}: {
  claimId: string;
  drafts: DraftRow[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(drafts[0]?.id ?? null);
  const [sectionApprovals, setSectionApprovals] = useState<Record<string, boolean>>({});
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => drafts.find((draft) => draft.id === selectedId) ?? null,
    [drafts, selectedId],
  );

  function selectDraft(draft: DraftRow) {
    setSelectedId(draft.id);
    const initial: Record<string, boolean> = {};
    for (const section of draft.content.sections) {
      initial[section.revisionItemId] = false;
    }
    setSectionApprovals(initial);
    setFinalConfirmed(false);
    setError(null);
  }

  async function approveDraft() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const approvedSections = selected.content.sections.map((section) => ({
        revisionItemId: section.revisionItemId,
        heading: section.heading,
        approved: sectionApprovals[section.revisionItemId] ?? false,
      }));

      const response = await fetch(`/api/claims/${claimId}/approval/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outputId: selected.id,
          approvedSections,
          finalApprovalConfirmed: finalConfirmed,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Approval failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  if (drafts.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        No DRAFT outputs available. Generate a valid unblocked draft first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {drafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                selectedId === draft.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"
              }`}
              onClick={() => selectDraft(draft)}
            >
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-medium">v{draft.version}</span>
                <Badge variant="outline">{draft.outputMode.replaceAll("_", " ")}</Badge>
                {draft.generationBlocked ? (
                  <Badge variant="destructive">Blocked</Badge>
                ) : (
                  <Badge>Valid</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {new Date(draft.createdAt).toLocaleString()}
              </p>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{selected.content.title || "Generated draft"}</h3>
              {selected.isMockGeneration ? (
                <Badge variant="secondary">Mock generation</Badge>
              ) : null}
            </div>

            <p className="text-xs text-zinc-600">
              Included revisions: {selected.revisionIds.join(", ") || "none"}
            </p>

            {!selected.toneLintPassed || selected.toneViolations.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-semibold">Tone lint failed</p>
                <ul className="mt-1 list-disc pl-5">
                  {selected.toneViolations.map((phrase) => (
                    <li key={phrase}>{phrase}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-green-800">Tone lint passed.</p>
            )}

            {selected.unsupportedClaims.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-semibold">Unsupported claims</p>
                <ul className="mt-1 list-disc pl-5">
                  {selected.unsupportedClaims.map((claim) => (
                    <li key={`${claim.code}-${claim.message}`}>
                      {claim.code}: {claim.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-green-800">No unsupported claims.</p>
            )}

            {selected.generationBlocked ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Blocked drafts cannot be approved. Regenerate after resolving issues.
              </div>
            ) : null}

            <div className="space-y-3">
              {selected.content.sections.map((section) => (
                <div key={section.revisionItemId} className="rounded border p-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!canApprove || !selected.approvable}
                      checked={sectionApprovals[section.revisionItemId] ?? false}
                      onChange={(event) =>
                        setSectionApprovals((current) => ({
                          ...current,
                          [section.revisionItemId]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <span className="font-medium">{section.heading}</span>
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-700">
                        {section.body}
                      </pre>
                    </span>
                  </label>
                </div>
              ))}
            </div>

            {canApprove && selected.approvable ? (
              <div className="space-y-3 border-t pt-4">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={finalConfirmed}
                    onChange={(event) => setFinalConfirmed(event.target.checked)}
                  />
                  <span>
                    I reviewed this output against the evidence matrix and approve it for export.
                  </span>
                </label>
                <Button disabled={busy || !finalConfirmed} onClick={() => void approveDraft()}>
                  {busy ? "Approving…" : "Approve for export"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
