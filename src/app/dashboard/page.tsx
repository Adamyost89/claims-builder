import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { AppNav } from "@/components/shared/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimMetrics } from "@/lib/claims/service";
import { prisma } from "@/lib/db";
import { canCreateClaims } from "@/lib/rbac";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const [settings, metrics] = await Promise.all([
    prisma.orgSettings.findUnique({ where: { id: "default" } }),
    getClaimMetrics(),
  ]);

  return (
    <>
      <AppNav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-zinc-600">
              Claim workspace metrics and platform readiness.
            </p>
          </div>
          {canCreateClaims(session.user.role) && (
            <Link href="/claims/new">
              <Button type="button">New claim</Button>
            </Link>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Total claims" value={String(metrics.total)} />
          <MetricCard title="Dry runs" value={String(metrics.dryRuns)} />
          <MetricCard
            title="Draft claims"
            value={String(
              metrics.byStatus.find((s) => s.status === "DRAFT")?._count._all ?? 0,
            )}
          />
          <MetricCard
            title="At upload stage"
            value={String(
              metrics.byStage.find((s) => s.workflowStage === "UPLOAD")?._count._all ?? 0,
            )}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Signed in</CardTitle>
              <CardDescription>Your session and role for access control.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Name:</span> {session.user.name}
              </p>
              <p className="flex items-center gap-2">
                <span className="font-medium">Role:</span>
                <Badge variant="secondary">{session.user.role}</Badge>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform readiness</CardTitle>
              <CardDescription>Production safeguards from Phase 0.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Production ready:</span>{" "}
                {settings?.productionReady ? "Yes" : "No"}
              </p>
              <p>
                <span className="font-medium">Dry runs reviewed:</span>{" "}
                {settings?.dryRunsReviewedCount ?? 0} / {settings?.dryRunsRequired ?? 10}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Claims by workflow stage</CardTitle>
            <CardDescription>Distribution across locked workflow steps.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.byStage.length === 0 ? (
              <p className="text-sm text-zinc-600">No claims yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {metrics.byStage.map((row) => (
                  <li key={row.workflowStage} className="flex justify-between">
                    <span>{row.workflowStage.replaceAll("_", " ")}</span>
                    <span className="font-medium">{row._count._all}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
