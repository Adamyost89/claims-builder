"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DashboardData = {
  orgSettings: {
    productionReady: boolean;
    dryRunsReviewedCount: number;
    dryRunsRequired: number;
    productionOverrideAt: string | Date | null;
    productionOverrideNote: string | null;
    productionOverrideExpiresAt: string | Date | null;
    productionOverrideRevokedAt: string | Date | null;
    productionOverrideRevokeNote: string | null;
  };
  usesSqlite: boolean;
  overrideStatus: "none" | "active" | "revoked" | "expired";
  readiness: {
    productionReady: boolean;
    blockers: string[];
    parsersCertified: boolean;
    issueDetectionCertified: boolean;
    dryRunsSatisfied: boolean;
    hasAdminOverride: boolean;
  };
  parsers: {
    parserType: string;
    parserCertified: boolean;
    fixtureAccuracy: number | null;
  }[];
  issueDetection: {
    certified: boolean;
    fixtureAccuracy: number | null;
    certifiedAt: string | Date | null;
  };
  carrierExportGuard: {
    allowedWithoutOverride: boolean;
    allowedWithOverride: boolean;
    blockers: string[];
  };
  pendingDryRunClaims: {
    id: string;
    claimNumber: string;
    customerName: string;
    hasExportedOutput: boolean;
  }[];
  overrideByUser: { name: string; email: string } | null;
};

export function ProductionDashboard({
  data,
  canOverride,
  canReviewDryRuns,
}: {
  data: DashboardData;
  canOverride: boolean;
  canReviewDryRuns: boolean;
}) {
  const router = useRouter();
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideExpiresAt, setOverrideExpiresAt] = useState("");
  const [revokeNote, setRevokeNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyOverride() {
    setBusy("override");
    setError(null);
    try {
      const response = await fetch("/api/settings/production/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrideNote,
          expiresAt: overrideExpiresAt
            ? new Date(overrideExpiresAt).toISOString()
            : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Override failed");
      }
      setOverrideNote("");
      setOverrideExpiresAt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setBusy(null);
    }
  }

  async function revokeOverride() {
    setBusy("revoke");
    setError(null);
    try {
      const response = await fetch("/api/settings/production/override/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeNote }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Revoke failed");
      }
      setRevokeNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(null);
    }
  }

  async function reviewDryRun(claimId: string) {
    setBusy(`dry-run-${claimId}`);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/dry-run/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Dry-run review failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dry-run review failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {data.usesSqlite ? (
        <div
          role="alert"
          className="rounded-md border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-950"
        >
          <p className="font-semibold">SQLite database detected</p>
          <p className="mt-1">
            Production deployments should use PostgreSQL or another managed database with automated
            backups. SQLite is suitable for local development only.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Production ready"
          value={data.orgSettings.productionReady ? "Yes" : "No"}
          variant={data.orgSettings.productionReady ? "ok" : "warn"}
        />
        <MetricCard
          title="Dry-run reviews"
          value={`${data.orgSettings.dryRunsReviewedCount} / ${data.orgSettings.dryRunsRequired}`}
          variant={data.readiness.dryRunsSatisfied ? "ok" : "warn"}
        />
        <MetricCard
          title="Carrier export (no override)"
          value={data.carrierExportGuard.allowedWithoutOverride ? "Allowed" : "Blocked"}
          variant={data.carrierExportGuard.allowedWithoutOverride ? "ok" : "warn"}
        />
      </div>

      {data.overrideStatus === "revoked" ? (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
          <p className="font-semibold">Production override revoked</p>
          <Badge className="mt-2" variant="destructive">
            Override status: revoked
          </Badge>
          <p className="mt-1">
            Carrier-ready export no longer bypasses production blockers.
          </p>
          {data.orgSettings.productionOverrideRevokeNote ? (
            <p className="mt-2 text-xs">Revoke note: {data.orgSettings.productionOverrideRevokeNote}</p>
          ) : null}
        </div>
      ) : data.overrideStatus === "expired" ? (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
          <p className="font-semibold">Production override expired</p>
          <Badge className="mt-2" variant="destructive">
            Override status: expired
          </Badge>
          {data.orgSettings.productionOverrideExpiresAt ? (
            <p className="mt-1 text-xs">
              Expired at {new Date(data.orgSettings.productionOverrideExpiresAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : data.overrideStatus === "active" ? (
        <div className="rounded-md border-2 border-amber-500 bg-amber-100 px-4 py-3 text-sm text-amber-950">
          <p className="font-bold uppercase tracking-wide">Admin production override active</p>
          <Badge className="mt-2">Override status: active</Badge>
          <p className="mt-1">
            Carrier-ready export is permitted despite blockers. This does not set productionReady
            true and does not fake certification or dry-run counts.
          </p>
          {data.overrideByUser ? (
            <p className="mt-1 text-xs">
              By {data.overrideByUser.name} ({data.overrideByUser.email}) at{" "}
              {data.orgSettings.productionOverrideAt
                ? new Date(data.orgSettings.productionOverrideAt).toLocaleString()
                : "—"}
            </p>
          ) : null}
          {data.orgSettings.productionOverrideNote ? (
            <p className="mt-2 text-xs">Note: {data.orgSettings.productionOverrideNote}</p>
          ) : null}
          {data.orgSettings.productionOverrideExpiresAt ? (
            <p className="mt-1 text-xs">
              Expires {new Date(data.orgSettings.productionOverrideExpiresAt).toLocaleString()}
            </p>
          ) : null}
          {canOverride ? (
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              <Input
                className="flex-1 bg-white"
                placeholder="Revoke note (required)"
                value={revokeNote}
                onChange={(event) => setRevokeNote(event.target.value)}
              />
              <Button
                variant="destructive"
                disabled={busy !== null || !revokeNote.trim()}
                onClick={() => void revokeOverride()}
              >
                {busy === "revoke" ? "Revoking…" : "Revoke override"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {data.readiness.blockers.length > 0 ? (
        <div className="rounded-md border p-4">
          <h2 className="font-medium">Production blockers</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
            {data.readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border p-4">
          <h2 className="font-medium">Parser certification</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.parsers.map((parser) => (
              <li key={parser.parserType} className="flex items-center justify-between">
                <span>{parser.parserType.replaceAll("_", " ")}</span>
                {parser.parserCertified ? (
                  <Badge>Certified</Badge>
                ) : (
                  <Badge variant="destructive">Not certified</Badge>
                )}
              </li>
            ))}
            {data.parsers.length === 0 ? (
              <li className="text-zinc-500">No parser certification records.</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-md border p-4">
          <h2 className="font-medium">Issue detection certification</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p>
              Status:{" "}
              {data.issueDetection.certified ? (
                <Badge>Certified</Badge>
              ) : (
                <Badge variant="destructive">Not certified</Badge>
              )}
            </p>
            <p>
              Fixture accuracy:{" "}
              {data.issueDetection.fixtureAccuracy != null
                ? `${(data.issueDetection.fixtureAccuracy * 100).toFixed(0)}%`
                : "Not run"}
            </p>
            {data.issueDetection.certifiedAt ? (
              <p className="text-xs text-zinc-500">
                Certified at {new Date(data.issueDetection.certifiedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-md border p-4">
        <h2 className="font-medium">Dry-run review queue</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Dry-run claims with exported output can be reviewed once to increment the org dry-run
          counter.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {data.pendingDryRunClaims.map((claim) => (
            <li
              key={claim.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
            >
              <div>
                <Link className="font-medium underline" href={`/claims/${claim.id}`}>
                  {claim.claimNumber}
                </Link>
                <span className="ml-2 text-zinc-600">{claim.customerName}</span>
              </div>
              {canReviewDryRuns && claim.hasExportedOutput ? (
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void reviewDryRun(claim.id)}
                >
                  {busy === `dry-run-${claim.id}` ? "Reviewing…" : "Mark dry-run reviewed"}
                </Button>
              ) : (
                <span className="text-xs text-zinc-500">
                  {claim.hasExportedOutput ? "Awaiting review" : "Export required first"}
                </span>
              )}
            </li>
          ))}
          {data.pendingDryRunClaims.length === 0 ? (
            <li className="text-zinc-500">No pending dry-run reviews.</li>
          ) : null}
        </ul>
      </div>

      {canOverride ? (
        <div className="rounded-md border border-amber-300 bg-amber-50/50 p-4">
          <h2 className="font-medium">Admin production override</h2>
          <p className="mt-1 text-sm text-amber-950">
            Permits carrier-ready export despite blockers. Does not change certification or dry-run
            counts. Document the reason below.
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                className="flex-1"
                placeholder="Override note (required)"
                value={overrideNote}
                onChange={(event) => setOverrideNote(event.target.value)}
              />
              <Input
                className="md:w-64"
                type="datetime-local"
                aria-label="Override expiration"
                value={overrideExpiresAt}
                onChange={(event) => setOverrideExpiresAt(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={busy !== null || !overrideNote.trim()}
                onClick={() => void applyOverride()}
              >
                {busy === "override" ? "Applying…" : "Apply override"}
              </Button>
              <p className="text-xs text-amber-900">
                Optional expiration (`productionOverrideExpiresAt`). Leave blank for no expiry.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-600">
          Production override controls are visible to admins only. Managers can view status but
          cannot apply override.
        </p>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  variant,
}: {
  title: string;
  value: string;
  variant: "ok" | "warn";
}) {
  return (
    <div className="rounded-md border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <Badge className="mt-2" variant={variant === "ok" ? "default" : "destructive"}>
        {variant === "ok" ? "Pass" : "Blocked"}
      </Badge>
    </div>
  );
}
