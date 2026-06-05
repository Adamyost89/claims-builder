import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { listClaimDocuments } from "@/lib/documents/service";
import { assertPermission, canViewClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canViewClaims(user.role), "Permission denied.");

    const { claimId } = await context.params;
    const documents = await listClaimDocuments(claimId);
    return NextResponse.json({ documents });
  } catch (error) {
    return apiError(error);
  }
}
