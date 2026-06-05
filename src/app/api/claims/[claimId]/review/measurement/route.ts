import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { reviewMeasurementValue } from "@/lib/parse/review";
import { assertPermission, canEditClaims } from "@/lib/rbac";

const schema = z.object({
  valueId: z.string(),
  action: z.enum(["accept", "reject", "edit"]),
  value: z.number().optional(),
});

type RouteContext = { params: Promise<{ claimId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot review measurements.");

    const { claimId } = await context.params;
    const body = schema.parse(await request.json());
    const result = await reviewMeasurementValue({
      claimId,
      valueId: body.valueId,
      action: body.action,
      actorId: user.id,
      actorRole: user.role,
      value: body.value,
    });

    return NextResponse.json({ measurementValue: result });
  } catch (error) {
    return apiError(error);
  }
}
