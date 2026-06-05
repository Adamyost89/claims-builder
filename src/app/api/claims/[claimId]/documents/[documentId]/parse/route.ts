import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { parseClaimDocument } from "@/lib/parse/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ claimId: string; documentId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot parse documents.");

    const { claimId, documentId } = await context.params;
    const document = await parseClaimDocument({
      claimId,
      documentId,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ document });
  } catch (error) {
    return apiError(error);
  }
}
