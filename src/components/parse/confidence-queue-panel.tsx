"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type QueueItem = {
  id: string;
  reviewType: string;
  relatedTable: string;
  relatedId: string;
  confidence: number;
  reason: string;
  resolution: string;
  blocksOutput: boolean;
};

export function ConfidenceQueuePanel({
  claimId,
  items,
  canResolve,
}: {
  claimId: string;
  items: QueueItem[];
  canResolve: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = items.filter((i) => i.resolution === "PENDING");

  async function resolve(itemId: string, resolution: "ACCEPTED" | "REJECTED") {
    setBusyId(itemId);
    try {
      const response = await fetch(`/api/claims/${claimId}/confidence-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, resolution }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Resolve failed");
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0) {
    return <p className="text-sm text-zinc-600">No pending confidence review items.</p>;
  }

  return (
    <ul className="space-y-3">
      {pending.map((item) => (
        <li key={item.id} className="rounded-md border border-zinc-200 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{item.reviewType.replaceAll("_", " ")}</p>
              <p className="text-sm text-zinc-600">{item.reason}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {item.relatedTable} · {(item.confidence * 100).toFixed(0)}% confidence
              </p>
            </div>
            {item.blocksOutput && <Badge variant="secondary">Blocks output</Badge>}
          </div>
          {canResolve && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={busyId === item.id}
                onClick={() => resolve(item.id, "ACCEPTED")}
              >
                Resolve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === item.id}
                onClick={() => resolve(item.id, "REJECTED")}
              >
                Dismiss
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
