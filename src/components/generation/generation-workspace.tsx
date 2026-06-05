"use client";

import type { OutputMode } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DraftRecord = {
  id: string;
  outputMode: string;
  contentText: string | null;
  contentJson: string | null;
  model: string | null;
  promptVersion: string | null;
  toneLintPassed: boolean;
  toneLintViolations: string | null;
  unsupportedClaimsJson: string;
  generationBlocked: boolean;
  isMockGeneration: boolean;
  createdAt: string | Date;
};

type PayloadPreview = {
  exportEligibleCount: number;
  excludedCount: number;
  unresolvedCount: number;
  payload: Record<string, unknown>;
};

const OUTPUT_MODES: { value: OutputMode; label: string }[] = [
  { value: "FULL_SUPPLEMENT", label: "Full supplement" },
  { value: "CARRIER_REBUTTAL", label: "Carrier rebuttal" },
  { value: "SHORT_REPLY", label: "Short reply" },
  { value: "INTERNAL_AUDIT", label: "Internal audit" },
  { value: "SCOPE_COMPARISON", label: "Scope comparison" },
  { value: "MISSING_EVIDENCE_CHECKLIST", label: "Missing evidence checklist" },
];

export function GenerationWorkspace({
  claimId,
  canEdit,
  evidenceReviewedAt,
  productionReady,
  productionBlockers,
  initialDraft,
  initialPreview,
}: {
  claimId: string;
  canEdit: boolean;
  evidenceReviewedAt: string | Date | null;
  productionReady: boolean;
  productionBlockers: string[];
  initialDraft: DraftRecord | null;
  initialPreview: PayloadPreview;
}) {
  const router = useRouter();
  const [outputMode, setOutputMode] = useState<OutputMode>("FULL_SUPPLEMENT");
  const [preview, setPreview] = useState<PayloadPreview>(initialPreview);
  const [draft, setDraft] = useState<DraftRecord | null>(initialDraft);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedDraft = useMemo(() => {
    if (!draft?.contentJson) {
      return null;
    }
    try {
      return JSON.parse(draft.contentJson) as {
        title?: string;
        warnings?: string[];
        unsupportedClaims?: { code: string; message: string }[];
        sections?: { heading: string; body: string }[];
      };
    } catch {
      return null;
    }
  }, [draft]);

  const unsupportedClaims = useMemo(() => {
    if (parsedDraft?.unsupportedClaims) {
      return parsedDraft.unsupportedClaims;
    }
    if (!draft?.unsupportedClaimsJson) {
      return [];
    }
    try {
      return JSON.parse(draft.unsupportedClaimsJson) as { code: string; message: string }[];
    } catch {
      return [];
    }
  }, [draft, parsedDraft]);

  const toneViolations = useMemo(() => {
    if (!draft?.toneLintViolations) {
      return [];
    }
    try {
      return JSON.parse(draft.toneLintViolations) as string[];
    } catch {
      return [];
    }
  }, [draft]);

  async function loadPreview(mode: OutputMode) {
    setBusy("preview");
    setError(null);
    try {
      const response = await fetch(
        `/api/claims/${claimId}/generation/payload?outputMode=${mode}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load payload preview");
      }
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payload preview");
    } finally {
      setBusy(null);
    }
  }

  async function generateDraft() {
    setBusy("generate");
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/generation/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputMode }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed");
      }
      setDraft(data.output);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {!productionReady ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Production readiness warning</p>
          <p className="mt-1">
            Carrier-ready output should not be sent until production safeguards are satisfied.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {productionBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
        <span>
          Evidence reviewed:{" "}
          {evidenceReviewedAt ? new Date(evidenceReviewedAt).toLocaleString() : "Not yet"}
        </span>
        <span>Export-eligible revisions: {preview.exportEligibleCount}</span>
        <span>Excluded revisions: {preview.excludedCount}</span>
        <span>Unresolved revisions: {preview.unresolvedCount}</span>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[240px_1fr]">
        <label className="text-sm">
          Output mode
          <select
            className="mt-1 w-full rounded border px-2 py-1"
            value={outputMode}
            onChange={(event) => {
              const mode = event.target.value as OutputMode;
              setOutputMode(mode);
              void loadPreview(mode);
            }}
          >
            {OUTPUT_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>

        {canEdit ? (
          <div className="flex items-end gap-2">
            <Button
              disabled={busy !== null || !evidenceReviewedAt}
              onClick={() => void generateDraft()}
            >
              {busy === "generate" ? "Generating…" : "Generate draft"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-md border bg-zinc-50 p-4">
        <h3 className="font-medium">Payload preview</h3>
        <p className="mt-1 text-xs text-zinc-600">
          OpenAI may only assemble language from this structured payload. No facts, quantities, or
          citations outside stored evidence and rule text are permitted.
        </p>
        <pre className="mt-3 max-h-80 overflow-auto rounded border bg-white p-3 text-xs">
          {JSON.stringify(preview.payload, null, 2)}
        </pre>
      </div>

      {draft ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">Generated draft</h3>
            <Badge variant="outline">{draft.outputMode}</Badge>
            {draft.isMockGeneration ? <Badge variant="secondary">Mock generation</Badge> : null}
            {draft.generationBlocked ? (
              <Badge variant="destructive">Blocked</Badge>
            ) : (
              <Badge>Valid draft</Badge>
            )}
          </div>

          <p className="text-xs text-zinc-600">
            Model: {draft.model ?? "—"} · Prompt: {draft.promptVersion ?? "—"} ·{" "}
            {new Date(draft.createdAt).toLocaleString()}
          </p>

          {draft.generationBlocked ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="font-semibold">Draft blocked from workflow advancement</p>
              <p className="mt-1">
                Human approval remains blocked until unsupported claims are resolved and tone lint
                passes.
              </p>
            </div>
          ) : null}

          {!draft.toneLintPassed || toneViolations.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="font-semibold">Tone lint failed</p>
              <ul className="mt-1 list-disc pl-5">
                {toneViolations.map((phrase) => (
                  <li key={phrase}>{phrase}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {unsupportedClaims.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="font-semibold">Unsupported claims detected</p>
              <ul className="mt-1 list-disc pl-5">
                {unsupportedClaims.map((claim) => (
                  <li key={`${claim.code}-${claim.message}`}>
                    {claim.code}: {claim.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {parsedDraft?.warnings && parsedDraft.warnings.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-zinc-700">
              {parsedDraft.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <pre className="max-h-96 overflow-auto rounded border bg-zinc-50 p-3 text-sm whitespace-pre-wrap">
            {draft.contentText ?? "No text content"}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-zinc-600">No generated draft yet.</p>
      )}
    </div>
  );
}
