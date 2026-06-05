import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { updateClaimSchema } from "@/lib/claims/schemas";
import { getClaimById, updateClaim } from "@/lib/claims/service";
import { assertPermission, canEditClaims, canViewClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canViewClaims(user.role), "You do not have permission to view claims.");

    const { claimId } = await context.params;
    const claim = await getClaimById(claimId);
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    return NextResponse.json({ claim });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot update claims.");

    const { claimId } = await context.params;
    const body = await request.json();
    const parsed = updateClaimSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const claim = await updateClaim(claimId, parsed.data, user.id, user.role);
    return NextResponse.json({ claim });
  } catch (error) {
    return apiError(error);
  }
}
