import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { runClaimComparison } from "@/lib/comparison/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot run comparison.");

    const { claimId } = await context.params;
    const results = await runClaimComparison({
      claimId,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ results, count: results.length });
  } catch (error) {
    return apiError(error);
  }
}
