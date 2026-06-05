import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { reviewClaimEvidence } from "@/lib/evidence/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot review evidence.");

    const { claimId } = await context.params;
    const claim = await reviewClaimEvidence({
      claimId,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ claim });
  } catch (error) {
    return apiError(error);
  }
}
