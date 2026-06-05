import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listClaims } from "@/lib/claims/service";
import { canCreateClaims } from "@/lib/rbac";

export default async function ClaimsListPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const claims = await listClaims();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Claims</h1>
          <p className="text-sm text-zinc-600">
            Workspaces are titled by customer name.
          </p>
        </div>
        {canCreateClaims(session.user.role) && (
          <Link href="/claims/new">
            <Button type="button">New claim</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All claims</CardTitle>
          <CardDescription>{claims.length} claim workspace(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="text-sm text-zinc-600">No claims yet. Create one to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="pb-2 pr-4 font-medium">Customer</th>
                    <th className="pb-2 pr-4 font-medium">Claim #</th>
                    <th className="pb-2 pr-4 font-medium">Carrier</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Stage</th>
                    <th className="pb-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr key={claim.id} className="border-b border-zinc-100 last:border-0">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/claims/${claim.id}`}
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {claim.customerName}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{claim.claimNumber}</td>
                      <td className="py-3 pr-4">{claim.carrier}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{claim.status}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">
                          {claim.workflowStage.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 text-zinc-600">
                        {claim.updatedAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
