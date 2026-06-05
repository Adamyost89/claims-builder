import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { runClaimIssueDetection } from "@/lib/issues/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot run issue detection.");

    const { claimId } = await context.params;
    const result = await runClaimIssueDetection({
      claimId,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
