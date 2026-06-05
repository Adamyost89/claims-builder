"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMPARISON_KEY_LABELS,
  type ComparisonKey,
} from "@/lib/comparison/keys";

type SourceDoc = { id: string; fileName: string; type: string };

type ComparisonRow = {
  id: string;
  comparisonKey: string;
  approvedQty: number;
  requestedQty: number;
  difference: number;
  pctDifference: number | null;
  formula: string;
  physicallySufficient: boolean;
  explanation: string;
  isWarning: boolean;
  unit: string;
  sourceDocuments: SourceDoc[];
};

export function ComparisonWorkspace({
  claimId,
  results,
  comparisonReviewedAt,
  canEdit,
}: {
  claimId: string;
  results: ComparisonRow[];
  comparisonReviewedAt: string | Date | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"run" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runComparison() {
    setBusy("run");
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/comparison/run`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Comparison run failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison run failed");
    } finally {
      setBusy(null);
    }
  }

  async function reviewComparison() {
    setBusy("review");
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/comparison/review`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Comparison review failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison review failed");
    } finally {
      setBusy(null);
    }
  }

  const reviewed = Boolean(comparisonReviewedAt);
  const warnings = results.filter((r) => r.isWarning);
  const comparisons = results.filter((r) => !r.isWarning);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {reviewed ? (
            <Badge variant="secondary">
              Reviewed {new Date(comparisonReviewedAt!).toLocaleString()}
            </Badge>
          ) : (
            <Badge variant="outline">Not reviewed</Badge>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={runComparison}
            >
              {busy === "run" ? "Running…" : "Re-run comparison"}
            </Button>
            <Button
              type="button"
              disabled={busy !== null || results.length === 0 || reviewed}
              onClick={reviewComparison}
            >
              {busy === "review" ? "Saving…" : "Review comparison"}
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-sm text-zinc-600">
        Review confirms the comparison engine has run and results are ready for Phase 4
        rule/issue detection — not that you agree with every variance.
      </p>

      {results.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600">
          No comparison results yet.
          {canEdit && (
            <div className="mt-3">
              <Button type="button" disabled={busy !== null} onClick={runComparison}>
                Run comparison
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {warnings.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-amber-800">
                Missing data warnings ({warnings.length})
              </h3>
              <div className="space-y-3">
                {warnings.map((row) => (
                  <ComparisonCard key={row.id} row={row} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold">
              Comparisons ({comparisons.length})
            </h3>
            <div className="space-y-3">
              {comparisons.map((row) => (
                <ComparisonCard key={row.id} row={row} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ComparisonCard({ row }: { row: ComparisonRow }) {
  const label =
    COMPARISON_KEY_LABELS[row.comparisonKey as ComparisonKey] ?? row.comparisonKey;

  return (
    <div
      className={`rounded-md border p-4 ${
        row.isWarning ? "border-amber-200 bg-amber-50/50" : "border-zinc-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-medium">{label}</h4>
        {!row.isWarning && (
          <Badge variant={row.physicallySufficient ? "secondary" : "outline"}>
            {row.physicallySufficient ? "Physically sufficient" : "Insufficient"}
          </Badge>
        )}
        {row.isWarning && <Badge variant="outline">Warning</Badge>}
      </div>

      {!row.isWarning && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <QuantityBlock
            title="Carrier approved"
            qty={row.approvedQty}
            unit={row.unit}
          />
          <QuantityBlock
            title="Measurement supported"
            qty={row.requestedQty}
            unit={row.unit}
          />
          <QuantityBlock
            title="Difference"
            qty={row.difference}
            unit={row.unit}
            pct={row.pctDifference}
          />
        </div>
      )}

      <p className="mt-3 font-mono text-xs text-zinc-700">{row.formula}</p>
      <p className="mt-2 text-sm text-zinc-600">{row.explanation}</p>

      {row.sourceDocuments.length > 0 && (
        <div className="mt-3 text-xs text-zinc-500">
          <span className="font-medium">Sources: </span>
          {row.sourceDocuments.map((doc) => (
            <span key={doc.id} className="mr-2">
              {doc.fileName} ({doc.type.replaceAll("_", " ")})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function QuantityBlock({
  title,
  qty,
  unit,
  pct,
}: {
  title: string;
  qty: number;
  unit: string;
  pct?: number | null;
}) {
  return (
    <div className="rounded-md bg-zinc-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {qty.toFixed(2)} {unit}
      </p>
      {pct != null && (
        <p className="text-xs text-zinc-500">{pct.toFixed(1)}% vs requested</p>
      )}
    </div>
  );
}
