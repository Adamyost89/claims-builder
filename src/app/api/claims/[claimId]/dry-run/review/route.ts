import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { reviewDryRunClaim } from "@/lib/production/service";

type RouteContext = { params: Promise<{ claimId: string }> };

const reviewSchema = z.object({
  reviewNote: z.string().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { claimId } = await context.params;
    const body = reviewSchema.parse(await request.json().catch(() => ({})));

    const claim = await reviewDryRunClaim({
      claimId,
      actorId: user.id,
      actorRole: user.role,
      reviewNote: body.reviewNote,
    });

    return NextResponse.json({ claim });
  } catch (error) {
    return apiError(error);
  }
}
