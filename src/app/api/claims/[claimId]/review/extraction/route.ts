import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { reviewExtraction } from "@/lib/parse/review";
import { assertPermission, canEditClaims } from "@/lib/rbac";

const schema = z.object({
  extractionId: z.string(),
  action: z.enum(["accept", "reject", "edit"]),
  newValue: z.string().optional(),
});

type RouteContext = { params: Promise<{ claimId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot review extractions.");

    const { claimId } = await context.params;
    const body = schema.parse(await request.json());
    const result = await reviewExtraction({
      claimId,
      extractionId: body.extractionId,
      action: body.action,
      actorId: user.id,
      actorRole: user.role,
      newValue: body.newValue,
    });

    return NextResponse.json({ extraction: result });
  } catch (error) {
    return apiError(error);
  }
}
