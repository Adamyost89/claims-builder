import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { ProductionDashboard } from "@/components/production/production-dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProductionDashboardData } from "@/lib/production/readiness";
import {
  canReviewDryRun,
  canSetProductionOverride,
  canViewProductionSettings,
} from "@/lib/rbac";

export default async function ProductionSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (!canViewProductionSettings(session.user.role)) {
    redirect("/dashboard");
  }

  const data = await getProductionDashboardData();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Production readiness</h1>
        <p className="text-sm text-zinc-600">
          Monitor parser certification, issue detection certification, dry-run reviews, and
          carrier-ready export guards. Do not enable carrier-ready export until this dashboard is
          green or override is documented.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Production dashboard</CardTitle>
          <CardDescription>
            OrgSettings.productionReady reflects certification and dry-run requirements only — admin
            override permits export separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductionDashboard
            canOverride={canSetProductionOverride(session.user.role)}
            canReviewDryRuns={canReviewDryRun(session.user.role)}
            data={{
              orgSettings: data.orgSettings,
              usesSqlite: data.usesSqlite,
              overrideStatus: data.overrideStatus,
              readiness: data.readiness,
              parsers: data.parsers,
              issueDetection: data.issueDetection,
              carrierExportGuard: data.carrierExportGuard,
              pendingDryRunClaims: data.pendingDryRunClaims,
              overrideByUser: data.overrideByUser,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
