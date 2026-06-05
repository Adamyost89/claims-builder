import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { canCreateClaims } from "@/lib/rbac";

export async function AppNav() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return null;
  }

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/dashboard" className="text-zinc-900 hover:text-zinc-600">
            Dashboard
          </Link>
          <Link href="/claims" className="text-zinc-900 hover:text-zinc-600">
            Claims
          </Link>
          {canCreateClaims(session.user.role) && (
            <Link href="/claims/new" className="text-zinc-900 hover:text-zinc-600">
              New claim
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <span>{session.user.name}</span>
          <Badge variant="secondary">{session.user.role}</Badge>
        </div>
      </div>
    </header>
  );
}
