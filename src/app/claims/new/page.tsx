import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { ClaimForm } from "@/components/claims/claim-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canCreateClaims } from "@/lib/rbac";

export default async function NewClaimPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (!canCreateClaims(session.user.role)) {
    redirect("/claims");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New claim</h1>
        <p className="text-sm text-zinc-600">
          The workspace will be titled by customer name.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Claim intake</CardTitle>
          <CardDescription>
            Required fields must be completed before documents can be uploaded in Phase 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClaimForm mode="create" />
        </CardContent>
      </Card>
    </main>
  );
}
