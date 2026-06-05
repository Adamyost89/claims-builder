"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ComparisonRef = {
  comparisonKey: string;
  formula: string;
  approvedQty: number;
  requestedQty: number;
  difference: number;
};

type RuleRef = {
  id: string;
  title: string;
  authorityType: string;
} | null;

type RevisionRow = {
  id: string;
  title: string;
  category: string;
  carrierApprovedLineItem: string | null;
  carrierApprovedQty: number | null;
  carrierApprovedUnit: string | null;
  requestedLineItem: string | null;
  requestedQty: number | null;
  requestedUnit: string | null;
  qtyDifference: number | null;
  calculationMethod: string | null;
  basis: string | null;
  revisionRequired: string | null;
  status: string;
  readinessStatus: string;
  exportEligible: boolean;
  requiredEvidenceTypes: string[];
  sourceDetectionType: string | null;
  comparison: ComparisonRef | null;
  rule: RuleRef;
};

const CATEGORY_ORDER = [
  "OMITTED_ITEM",
  "MEASUREMENT_DEFICIENCY",
  "ESTIMATE_INCONSISTENCY",
  "CODE_MANUFACTURER",
  "INSTALLATION_INSUFFICIENCY",
];

export function IssuesWorkspace({
  claimId,
  revisions,
  comparisonReviewedAt,
  issuesReviewedAt,
  canEdit,
}: {
  claimId: string;
  revisions: RevisionRow[];
  comparisonReviewedAt: string | Date | null;
  issuesReviewedAt: string | Date | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDetection() {
    setBusy("detect");
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/issues/detect`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Detection failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setBusy(null);
    }
  }

  async function reviewIssues(noIssuesFound = false) {
    setBusy("review");
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/issues/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noIssuesFound }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Review failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setBusy(null);
    }
  }

  async function updateRevision(
    revisionId: string,
    body: Record<string, unknown>,
  ) {
    setBusy(revisionId);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/issues/${revisionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Update failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: revisions.filter((r) => r.category === category),
  })).filter((g) => g.items.length > 0);

  const reviewed = Boolean(issuesReviewedAt);
  const comparisonReady = Boolean(comparisonReviewedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {comparisonReady ? (
            <Badge variant="secondary">Comparison reviewed</Badge>
          ) : (
            <Badge variant="outline">Comparison not reviewed</Badge>
          )}
          {reviewed ? (
            <Badge variant="secondary">
              Issues reviewed {new Date(issuesReviewedAt!).toLocaleString()}
            </Badge>
          ) : (
            <Badge variant="outline">Issues not reviewed</Badge>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!comparisonReady || busy !== null}
              onClick={runDetection}
            >
              {busy === "detect" ? "Detecting…" : "Run issue detection"}
            </Button>
            <Button
              type="button"
              disabled={busy !== null || reviewed}
              onClick={() => reviewIssues(revisions.length === 0)}
            >
              {busy === "review"
                ? "Saving…"
                : revisions.length === 0
                  ? "Sign off: No issues found"
                  : "Review issues"}
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-sm text-zinc-600">
        Issue review confirms detection has run and items are ready for evidence validation.
        This page does not generate carrier-ready language or exports.
      </p>

      {revisions.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No revision items yet. Run detection after comparison review is complete.
        </p>
      ) : (
        grouped.map((group) => (
          <section key={group.category}>
            <h3 className="mb-3 text-sm font-semibold">
              {group.category.replaceAll("_", " ")}{" "}
              <span className="font-normal text-zinc-500">({group.items.length})</span>
            </h3>
            <div className="space-y-3">
              {group.items.map((row) => (
                <RevisionCard
                  key={row.id}
                  row={row}
                  busy={busy === row.id}
                  canEdit={canEdit && !reviewed}
                  onAction={(body) => updateRevision(row.id, body)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function RevisionCard({
  row,
  busy,
  canEdit,
  onAction,
}: {
  row: RevisionRow;
  busy: boolean;
  canEdit: boolean;
  onAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(row.title);
  const [revisionRequired, setRevisionRequired] = useState(row.revisionRequired ?? "");

  return (
    <div className="rounded-md border border-zinc-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-medium">{row.title}</h4>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{row.status}</Badge>
          <Badge variant="secondary">{row.readinessStatus}</Badge>
          {row.exportEligible ? (
            <Badge>Export eligible</Badge>
          ) : (
            <Badge variant="outline">Not export eligible</Badge>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <p className="text-xs font-medium text-zinc-500">Carrier approved</p>
          <p>{row.carrierApprovedLineItem ?? "—"}</p>
          <p className="font-mono tabular-nums">
            {row.carrierApprovedQty ?? "—"} {row.carrierApprovedUnit ?? ""}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">Requested</p>
          <p>{row.requestedLineItem ?? "—"}</p>
          <p className="font-mono tabular-nums">
            {row.requestedQty ?? "—"} {row.requestedUnit ?? ""}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">Difference</p>
          <p className="font-mono tabular-nums">{row.qtyDifference ?? "—"}</p>
        </div>
      </div>

      {row.calculationMethod && (
        <p className="mt-2 font-mono text-xs text-zinc-700">{row.calculationMethod}</p>
      )}
      {row.basis && <p className="mt-2 text-sm text-zinc-600">{row.basis}</p>}
      {row.revisionRequired && (
        <p className="mt-1 text-sm text-zinc-700">
          <span className="font-medium">Revision required:</span> {row.revisionRequired}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
        {row.rule && <span>Rule: {row.rule.title}</span>}
        {row.comparison && <span>Comparison: {row.comparison.comparisonKey}</span>}
        {row.sourceDetectionType && <span>Source: {row.sourceDetectionType}</span>}
      </div>

      {row.requiredEvidenceTypes.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          Evidence required: {row.requiredEvidenceTypes.join(", ")}
        </p>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => onAction({ action: "include" })}>
            Include
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAction({ action: "exclude", excludedReason: "Excluded by reviewer" })}
          >
            Exclude
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAction({ action: "needs_evidence" })}
          >
            Needs evidence
          </Button>
          <Input className="h-8 max-w-xs" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input
            className="h-8 max-w-md"
            value={revisionRequired}
            onChange={(e) => setRevisionRequired(e.target.value)}
            placeholder="Revision required note"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              onAction({
                action: "edit",
                title,
                revisionRequired,
              })
            }
          >
            Save edit
          </Button>
        </div>
      )}
    </div>
  );
}
