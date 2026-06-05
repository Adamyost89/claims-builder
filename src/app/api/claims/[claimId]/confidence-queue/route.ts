import { ConfidenceReviewResolution } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { listConfidenceQueue, resolveConfidenceReviewItem } from "@/lib/confidence/queue";
import { assertPermission, canEditClaims, canViewClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canViewClaims(user.role), "Permission denied.");

    const { claimId } = await context.params;
    const items = await listConfidenceQueue(claimId);
    return NextResponse.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

const resolveSchema = z.object({
  itemId: z.string(),
  resolution: z.nativeEnum(ConfidenceReviewResolution),
  resolutionNote: z.string().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot resolve confidence queue.");

    const { claimId } = await context.params;
    const body = resolveSchema.parse(await request.json());
    const item = await resolveConfidenceReviewItem({
      claimId,
      itemId: body.itemId,
      resolution: body.resolution,
      actorId: user.id,
      resolutionNote: body.resolutionNote,
    });

    return NextResponse.json({ item });
  } catch (error) {
    return apiError(error);
  }
}
