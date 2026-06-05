import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { reviewClaimIssues } from "@/lib/issues/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

const reviewSchema = z.object({
  noIssuesFound: z.boolean().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot review issues.");

    const { claimId } = await context.params;
    const body = reviewSchema.parse(await request.json().catch(() => ({})));
    const claim = await reviewClaimIssues({
      claimId,
      actorId: user.id,
      actorRole: user.role,
      noIssuesFound: body.noIssuesFound,
    });

    return NextResponse.json({ claim });
  } catch (error) {
    return apiError(error);
  }
}
