import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { updateRevisionItem } from "@/lib/issues/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string; revisionId: string }> };

const updateSchema = z.object({
  action: z.enum(["include", "exclude", "needs_evidence", "edit"]),
  excludedReason: z.string().optional(),
  title: z.string().optional(),
  revisionRequired: z.string().optional(),
  basis: z.string().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot update revision items.");

    const { claimId, revisionId } = await context.params;
    const body = updateSchema.parse(await request.json());
    const revision = await updateRevisionItem({
      claimId,
      revisionId,
      actorId: user.id,
      actorRole: user.role,
      ...body,
    });

    return NextResponse.json({ revision });
  } catch (error) {
    return apiError(error);
  }
}
