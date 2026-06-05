import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { overrideRevisionEvidence } from "@/lib/evidence/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

const overrideSchema = z.object({
  revisionId: z.string().min(1),
  overrideNote: z.string().min(1),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot override evidence.");

    const { claimId } = await context.params;
    const body = overrideSchema.parse(await request.json());

    const revision = await overrideRevisionEvidence({
      claimId,
      revisionId: body.revisionId,
      overrideNote: body.overrideNote,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ revision });
  } catch (error) {
    return apiError(error);
  }
}
