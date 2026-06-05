"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MEASUREMENT_KEY_LABELS, type MeasurementKey } from "@/lib/measurements/keys";
import { isCanonicalMeasurementKey } from "@/lib/measurements/keys";

type ReviewRow = {
  id: string;
  reviewStatus: string;
  confidence: number;
  reviewedBy?: { name: string } | null;
  reviewedAt?: string | Date | null;
};

type ExtractionRow = ReviewRow & {
  fieldName: string;
  fieldValue: string;
  originalFieldValue: string | null;
  sourcePage: number | null;
  sourceText: string | null;
  extractionMethod: string;
  document: { fileName: string; type: string };
};

type LineItemRow = ReviewRow & {
  description: string;
  originalDescription: string | null;
  quantity: number;
  originalQuantity: number | null;
  unit: string;
  sourcePage: number | null;
  rawText: string | null;
  extractionMethod: string;
  document: { fileName: string; type: string };
};

type MeasurementRow = ReviewRow & {
  key: string;
  value: number;
  originalValue: number | null;
  unit: string;
  sourcePage: number | null;
  rawText: string | null;
  extractionMethod: string;
};

export function ParsedReviewPanel({
  claimId,
  extractions,
  lineItems,
  measurements,
  canReview,
}: {
  claimId: string;
  extractions: ExtractionRow[];
  lineItems: LineItemRow[];
  measurements: MeasurementRow[];
  canReview: boolean;
}) {
  const router = useRouter();

  async function postReview(
    url: string,
    body: Record<string, unknown>,
  ) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Review action failed");
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <ReviewSection title="Extracted fields" count={extractions.length}>
        {extractions.map((row) => (
          <ExtractionReviewCard
            key={row.id}
            row={row}
            canReview={canReview}
            onAccept={() =>
              postReview(`/api/claims/${claimId}/review/extraction`, {
                extractionId: row.id,
                action: "accept",
              })
            }
            onReject={() =>
              postReview(`/api/claims/${claimId}/review/extraction`, {
                extractionId: row.id,
                action: "reject",
              })
            }
            onEdit={(newValue) =>
              postReview(`/api/claims/${claimId}/review/extraction`, {
                extractionId: row.id,
                action: "edit",
                newValue,
              })
            }
          />
        ))}
      </ReviewSection>

      <ReviewSection title="Estimate line items" count={lineItems.length}>
        {lineItems.map((row) => (
          <LineItemReviewCard
            key={row.id}
            row={row}
            canReview={canReview}
            onAccept={() =>
              postReview(`/api/claims/${claimId}/review/line-item`, {
                lineItemId: row.id,
                action: "accept",
              })
            }
            onReject={() =>
              postReview(`/api/claims/${claimId}/review/line-item`, {
                lineItemId: row.id,
                action: "reject",
              })
            }
            onEdit={(description, quantity, unit) =>
              postReview(`/api/claims/${claimId}/review/line-item`, {
                lineItemId: row.id,
                action: "edit",
                description,
                quantity,
                unit,
              })
            }
          />
        ))}
      </ReviewSection>

      <ReviewSection title="Measurement values" count={measurements.length}>
        {measurements.map((row) => (
          <MeasurementReviewCard
            key={row.id}
            row={row}
            canReview={canReview}
            onAccept={() =>
              postReview(`/api/claims/${claimId}/review/measurement`, {
                valueId: row.id,
                action: "accept",
              })
            }
            onReject={() =>
              postReview(`/api/claims/${claimId}/review/measurement`, {
                valueId: row.id,
                action: "reject",
              })
            }
            onEdit={(value) =>
              postReview(`/api/claims/${claimId}/review/measurement`, {
                valueId: row.id,
                action: "edit",
                value,
              })
            }
          />
        ))}
      </ReviewSection>
    </div>
  );
}

function ReviewSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">
        {title} <span className="font-normal text-zinc-500">({count})</span>
      </h3>
      {count === 0 ? (
        <p className="text-sm text-zinc-600">No rows yet. Run parse on uploaded documents.</p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline">{status}</Badge>;
}

function ProvenanceBlock({
  sourcePage,
  sourceText,
  confidence,
  method,
}: {
  sourcePage: number | null;
  sourceText: string | null;
  confidence: number;
  method: string;
}) {
  return (
    <div className="mt-2 rounded-md bg-zinc-50 p-2 text-xs text-zinc-600">
      <p>
        <span className="font-medium">Page:</span> {sourcePage ?? "—"} ·{" "}
        <span className="font-medium">Confidence:</span> {(confidence * 100).toFixed(0)}% ·{" "}
        <span className="font-medium">Method:</span> {method}
      </p>
      {sourceText && (
        <p className="mt-1 font-mono text-[11px] break-all">{sourceText}</p>
      )}
    </div>
  );
}

function ExtractionReviewCard({
  row,
  canReview,
  onAccept,
  onReject,
  onEdit,
}: {
  row: ExtractionRow;
  canReview: boolean;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onEdit: (value: string) => Promise<void>;
}) {
  const [editValue, setEditValue] = useState(row.fieldValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{row.fieldName}</p>
          <p className="text-sm">
            Value: <span className="font-mono">{row.fieldValue}</span>
            {row.originalFieldValue && (
              <span className="ml-2 text-zinc-500">
                (original: {row.originalFieldValue})
              </span>
            )}
          </p>
          <p className="text-xs text-zinc-500">{row.document.fileName}</p>
        </div>
        <StatusBadge status={row.reviewStatus} />
      </div>
      <ProvenanceBlock
        sourcePage={row.sourcePage}
        sourceText={row.sourceText}
        confidence={row.confidence}
        method={row.extractionMethod}
      />
      {row.reviewedAt && (
        <p className="mt-1 text-xs text-zinc-500">
          Reviewed by {row.reviewedBy?.name ?? "—"} at{" "}
          {new Date(row.reviewedAt).toLocaleString()}
        </p>
      )}
      {canReview && row.reviewStatus === "PENDING" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => run(onAccept)}>
            Accept
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(onReject)}>
            Reject
          </Button>
          <Input
            className="h-8 max-w-xs"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => onEdit(editValue))}
          >
            Save edit
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function LineItemReviewCard({
  row,
  canReview,
  onAccept,
  onReject,
  onEdit,
}: {
  row: LineItemRow;
  canReview: boolean;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onEdit: (description: string, quantity: number, unit: string) => Promise<void>;
}) {
  const [description, setDescription] = useState(row.description);
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [unit, setUnit] = useState(row.unit);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{row.description}</p>
          <p className="text-sm">
            {row.quantity} {row.unit}
            {row.originalQuantity != null && (
              <span className="ml-2 text-zinc-500">
                (original qty: {row.originalQuantity})
              </span>
            )}
          </p>
          <p className="text-xs text-zinc-500">{row.document.fileName}</p>
        </div>
        <StatusBadge status={row.reviewStatus} />
      </div>
      <ProvenanceBlock
        sourcePage={row.sourcePage}
        sourceText={row.rawText}
        confidence={row.confidence}
        method={row.extractionMethod}
      />
      {canReview && row.reviewStatus === "PENDING" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => run(onAccept)}>
            Accept
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(onReject)}>
            Reject
          </Button>
          <Input className="h-8 max-w-[200px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input className="h-8 w-20" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Input className="h-8 w-16" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(() => onEdit(description, Number.parseFloat(quantity), unit))
            }
          >
            Save edit
          </Button>
        </div>
      )}
    </div>
  );
}

function MeasurementReviewCard({
  row,
  canReview,
  onAccept,
  onReject,
  onEdit,
}: {
  row: MeasurementRow;
  canReview: boolean;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onEdit: (value: number) => Promise<void>;
}) {
  const label = isCanonicalMeasurementKey(row.key)
    ? MEASUREMENT_KEY_LABELS[row.key as MeasurementKey]
    : row.key;
  const [value, setValue] = useState(String(row.value));
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm font-mono">
            {row.value} {row.unit}
          </p>
        </div>
        <StatusBadge status={row.reviewStatus} />
      </div>
      <ProvenanceBlock
        sourcePage={row.sourcePage}
        sourceText={row.rawText}
        confidence={row.confidence}
        method={row.extractionMethod}
      />
      {canReview && row.reviewStatus === "PENDING" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => { setBusy(true); onAccept().finally(() => setBusy(false)); }}>
            Accept
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { setBusy(true); onReject().finally(() => setBusy(false)); }}>
            Reject
          </Button>
          <Input className="h-8 w-24" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onEdit(Number.parseFloat(value)).finally(() => setBusy(false));
            }}
          >
            Save edit
          </Button>
        </div>
      )}
    </div>
  );
}
