import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { getParsedDataForClaim } from "@/lib/parse/service";
import { assertPermission, canViewClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canViewClaims(user.role), "Permission denied.");

    const { claimId } = await context.params;
    const data = await getParsedDataForClaim(claimId);
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error);
  }
}
