import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { deleteBlockedDraft } from "@/lib/approval/service";

type RouteContext = { params: Promise<{ claimId: string; outputId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { claimId, outputId } = await context.params;

    await deleteBlockedDraft({
      claimId,
      outputId,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
