"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EvidenceLinkRow = {
  id: string;
  evidenceType: string;
  targetTable: string;
  targetId: string;
  label: string;
  snippet: string | null;
  isRequired: boolean;
  isSatisfied: boolean;
};

type MatrixRow = {
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
  status: string;
  readinessStatus: string;
  exportEligible: boolean;
  requiredEvidenceTypes: string[];
  requirementGroups: string[][];
  linkedEvidence: EvidenceLinkRow[];
  overrideById: string | null;
  overrideNote: string | null;
  overriddenAt: string | Date | null;
  overrideBy: { id: string; name: string | null; email: string } | null;
  evaluation: {
    readinessStatus: string;
    exportEligible: boolean;
    satisfiedGroups: number;
    totalGroups: number;
    isOverridden: boolean;
  };
};

type EvidenceSources = {
  documents: { id: string; fileName: string; type: string }[];
  photos: { id: string; fileName: string; caption: string | null }[];
  extractions: { id: string; fieldName: string; fieldValue: string }[];
  lineItems: { id: string; description: string; quantity: number; unit: string }[];
  measurements: { id: string; key: string; value: number; unit: string }[];
  comparisons: {
    id: string;
    comparisonKey: string;
    formula: string;
    approvedQty: number;
    requestedQty: number;
    difference: number;
  }[];
  calculations: { id: string; calculatorType: string; formula: string }[];
  rules: { id: string; title: string; authorityType: string; citationText: string }[];
};

const READINESS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  NEEDS_EVIDENCE: "destructive",
  PARTIALLY_READY: "secondary",
  READY_FOR_OUTPUT: "default",
  EXCLUDED: "outline",
  NOT_ASSESSED: "outline",
};

const TARGET_TABLE_OPTIONS = [
  "DocumentExtraction",
  "EstimateLineItem",
  "MeasurementValue",
  "ComparisonResult",
  "Document",
  "Photo",
  "Calculation",
  "Rule",
] as const;

function formatGroups(groups: string[][]): string {
  return groups.map((group) => group.join(" or ")).join(" + ");
}

export function EvidenceMatrixWorkspace({
  claimId,
  rows,
  sources,
  issuesReviewedAt,
  evidenceReviewedAt,
  canEdit,
}: {
  claimId: string;
  rows: MatrixRow[];
  sources: EvidenceSources;
  issuesReviewedAt: string | Date | null;
  evidenceReviewedAt: string | Date | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);
  const [targetTable, setTargetTable] =
    useState<(typeof TARGET_TABLE_OPTIONS)[number]>("ComparisonResult");
  const [targetId, setTargetId] = useState("");
  const [evidenceType, setEvidenceType] = useState("MEASUREMENT");
  const [overrideNote, setOverrideNote] = useState("");

  const activeRevision = useMemo(
    () => rows.find((row) => row.id === activeRevisionId) ?? null,
    [rows, activeRevisionId],
  );

  const targetOptions = useMemo(() => {
    switch (targetTable) {
      case "Document":
        return sources.documents.map((d) => ({
          id: d.id,
          label: `${d.fileName} (${d.type})`,
        }));
      case "Photo":
        return sources.photos.map((p) => ({
          id: p.id,
          label: p.caption ? `${p.fileName} — ${p.caption}` : p.fileName,
        }));
      case "DocumentExtraction":
        return sources.extractions.map((e) => ({
          id: e.id,
          label: `${e.fieldName}: ${e.fieldValue ?? "—"}`,
        }));
      case "EstimateLineItem":
        return sources.lineItems.map((l) => ({
          id: l.id,
          label: `${l.description} (${l.quantity} ${l.unit})`,
        }));
      case "MeasurementValue":
        return sources.measurements.map((m) => ({
          id: m.id,
          label: `${m.key}: ${m.value} ${m.unit}`,
        }));
      case "ComparisonResult":
        return sources.comparisons.map((c) => ({
          id: c.id,
          label: `${c.comparisonKey} Δ${c.difference}`,
        }));
      case "Calculation":
        return sources.calculations.map((c) => ({
          id: c.id,
          label: `${c.calculatorType}: ${c.formula}`,
        }));
      case "Rule":
        return sources.rules.map((r) => ({
          id: r.id,
          label: `${r.title} (${r.authorityType})`,
        }));
      default:
        return [];
    }
  }, [targetTable, sources]);

  async function linkEvidence() {
    if (!activeRevisionId || !targetId) {
      return;
    }
    setBusy("link");
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/evidence/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revisionItemId: activeRevisionId,
          evidenceType,
          targetTable,
          targetId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to link evidence");
      }
      setTargetId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link evidence");
    } finally {
      setBusy(null);
    }
  }

  async function unlinkEvidence(linkId: string) {
    setBusy(`unlink-${linkId}`);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/evidence/links/${linkId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to remove evidence link");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove evidence link");
    } finally {
      setBusy(null);
    }
  }

  async function applyOverride(revisionId: string) {
    if (!overrideNote.trim()) {
      setError("Override note is required.");
      return;
    }
    setBusy(`override-${revisionId}`);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/evidence/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId, overrideNote }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Override failed");
      }
      setOverrideNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setBusy(null);
    }
  }

  async function reviewEvidence() {
    setBusy("review");
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/evidence/review`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Evidence review failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evidence review failed");
    } finally {
      setBusy(null);
    }
  }

  const includedRows = rows.filter((row) => row.status !== "EXCLUDED");
  const readyCount = includedRows.filter(
    (row) =>
      row.evaluation.isOverridden ||
      row.evaluation.readinessStatus === "READY_FOR_OUTPUT",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
        <span>
          Issues reviewed:{" "}
          {issuesReviewedAt ? new Date(issuesReviewedAt).toLocaleString() : "Not yet"}
        </span>
        <span>
          Evidence reviewed:{" "}
          {evidenceReviewedAt ? new Date(evidenceReviewedAt).toLocaleString() : "Not yet"}
        </span>
        <span>
          Ready: {readyCount}/{includedRows.length} included revisions
        </span>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy !== null || !issuesReviewedAt}
            onClick={() => void reviewEvidence()}
          >
            {busy === "review" ? "Signing off…" : "Sign off evidence validation"}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Revision item</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Approved qty</th>
              <th className="px-3 py-2">Requested qty</th>
              <th className="px-3 py-2">Difference</th>
              <th className="px-3 py-2">Required evidence</th>
              <th className="px-3 py-2">Linked evidence</th>
              <th className="px-3 py-2">Readiness</th>
              <th className="px-3 py-2">Override</th>
              <th className="px-3 py-2">Export</th>
              {canEdit ? <th className="px-3 py-2">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="px-3 py-2">
                  <p className="font-medium">{row.title}</p>
                  {row.status === "EXCLUDED" ? (
                    <p className="text-xs text-zinc-500">Excluded from export</p>
                  ) : null}
                </td>
                <td className="px-3 py-2">{row.category.replaceAll("_", " ")}</td>
                <td className="px-3 py-2">
                  {row.carrierApprovedQty != null
                    ? `${row.carrierApprovedQty} ${row.carrierApprovedUnit ?? ""}`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {row.requestedQty != null
                    ? `${row.requestedQty} ${row.requestedUnit ?? ""}`
                    : "—"}
                </td>
                <td className="px-3 py-2">{row.qtyDifference ?? "—"}</td>
                <td className="px-3 py-2">
                  <p>{formatGroups(row.requirementGroups)}</p>
                  <p className="text-xs text-zinc-500">
                    Types: {row.requiredEvidenceTypes.join(", ") || "—"}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <ul className="space-y-1">
                    {row.linkedEvidence.map((link) => (
                      <li key={link.id} className="text-xs">
                        <span className="font-medium">{link.evidenceType}</span>: {link.label}
                        {link.isSatisfied ? (
                          <Badge className="ml-1" variant="outline">
                            satisfied
                          </Badge>
                        ) : null}
                        {canEdit && row.status !== "EXCLUDED" ? (
                          <button
                            className="ml-2 text-red-600 underline"
                            disabled={busy !== null}
                            onClick={() => void unlinkEvidence(link.id)}
                            type="button"
                          >
                            remove
                          </button>
                        ) : null}
                      </li>
                    ))}
                    {row.linkedEvidence.length === 0 ? (
                      <li className="text-xs text-zinc-500">No links</li>
                    ) : null}
                  </ul>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={READINESS_VARIANT[row.evaluation.readinessStatus] ?? "outline"}>
                    {row.evaluation.readinessStatus.replaceAll("_", " ")}
                  </Badge>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.evaluation.satisfiedGroups}/{row.evaluation.totalGroups} groups
                  </p>
                </td>
                <td className="px-3 py-2">
                  {row.evaluation.isOverridden ? (
                    <div className="space-y-1">
                      <Badge variant="secondary">Overridden</Badge>
                      <p className="text-xs text-amber-800">{row.overrideNote}</p>
                      <p className="text-xs text-zinc-500">
                        by {row.overrideBy?.name ?? row.overrideBy?.email ?? "unknown"}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.exportEligible ? (
                    <Badge>Eligible</Badge>
                  ) : (
                    <Badge variant="outline">Blocked</Badge>
                  )}
                  {row.evaluation.isOverridden ? (
                    <p className="mt-1 text-xs font-medium text-amber-800">
                      Export allowed via manual override
                    </p>
                  ) : null}
                </td>
                {canEdit ? (
                  <td className="px-3 py-2">
                    {row.status !== "EXCLUDED" ? (
                      <div className="space-y-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveRevisionId(row.id)}
                        >
                          Link evidence
                        </Button>
                        {!row.evaluation.isOverridden &&
                        row.evaluation.readinessStatus !== "READY_FOR_OUTPUT" ? (
                          <div className="space-y-1">
                            <Input
                              placeholder="Override note (required)"
                              value={activeRevisionId === row.id ? overrideNote : ""}
                              onChange={(event) => {
                                setActiveRevisionId(row.id);
                                setOverrideNote(event.target.value);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy !== null}
                              onClick={() => void applyOverride(row.id)}
                            >
                              Override export block
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && activeRevision ? (
        <div className="rounded-md border bg-zinc-50 p-4">
          <h3 className="font-medium">Link evidence to: {activeRevision.title}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="text-sm">
              Target table
              <select
                className="mt-1 w-full rounded border px-2 py-1"
                value={targetTable}
                onChange={(event) => {
                  setTargetTable(event.target.value as (typeof TARGET_TABLE_OPTIONS)[number]);
                  setTargetId("");
                }}
              >
                {TARGET_TABLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Evidence type
              <select
                className="mt-1 w-full rounded border px-2 py-1"
                value={evidenceType}
                onChange={(event) => setEvidenceType(event.target.value)}
              >
                {[
                  "MEASUREMENT",
                  "CARRIER_INCONSISTENCY",
                  "CODE",
                  "MANUFACTURER",
                  "PHOTO",
                  "INVOICE",
                  "POLICY",
                  "CALCULATION",
                  "FIELD_NOTE",
                ].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              Source
              <select
                className="mt-1 w-full rounded border px-2 py-1"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="">Select source…</option>
                {targetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button disabled={busy !== null || !targetId} onClick={() => void linkEvidence()}>
              {busy === "link" ? "Linking…" : "Add evidence link"}
            </Button>
            <Button variant="outline" onClick={() => setActiveRevisionId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
