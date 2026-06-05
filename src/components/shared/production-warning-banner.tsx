import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { evaluateProductionReadiness } from "@/lib/production/readiness";
import { canViewProductionSettings } from "@/lib/rbac";

export async function ProductionWarningBanner() {
  const [status, session] = await Promise.all([
    evaluateProductionReadiness(),
    getServerSession(authOptions),
  ]);

  if (status.productionReady && !status.hasAdminOverride) {
    return null;
  }

  const remaining = Math.max(
    0,
    status.dryRunsRequired - status.dryRunsReviewedCount,
  );
  const showDashboardLink =
    session?.user && canViewProductionSettings(session.user.role);

  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"
    >
      <strong className="font-semibold">Non-production mode:</strong> Carrier-ready
      output is blocked until parser certification, issue detection certification (100%
      golden fixtures), and dry-run review are complete ({remaining} dry run
      {remaining === 1 ? "" : "s"} remaining).
      {!status.issueDetectionCertified && (
        <span className="ml-1">Issue detection fixtures not certified.</span>
      )}
      {status.hasAdminOverride && (
        <span className="ml-1 font-medium">Admin override active — export permitted with documentation.</span>
      )}
      {showDashboardLink ? (
        <Link className="ml-2 font-medium underline" href="/settings/production">
          View production dashboard
        </Link>
      ) : null}
    </div>
  );
}
