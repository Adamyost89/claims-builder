import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { reviewLineItem } from "@/lib/parse/review";
import { assertPermission, canEditClaims } from "@/lib/rbac";

const schema = z.object({
  lineItemId: z.string(),
  action: z.enum(["accept", "reject", "edit"]),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
});

type RouteContext = { params: Promise<{ claimId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot review line items.");

    const { claimId } = await context.params;
    const body = schema.parse(await request.json());
    const result = await reviewLineItem({
      claimId,
      lineItemId: body.lineItemId,
      action: body.action,
      actorId: user.id,
      actorRole: user.role,
      description: body.description,
      quantity: body.quantity,
      unit: body.unit,
    });

    return NextResponse.json({ lineItem: result });
  } catch (error) {
    return apiError(error);
  }
}
