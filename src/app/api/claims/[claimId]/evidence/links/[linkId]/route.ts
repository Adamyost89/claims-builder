import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { deleteEvidenceLink } from "@/lib/evidence/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string; linkId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot remove evidence links.");

    const { claimId, linkId } = await context.params;

    await deleteEvidenceLink({
      claimId,
      linkId,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
