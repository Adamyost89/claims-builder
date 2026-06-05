import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { assertPermission, canAdvanceWorkflow } from "@/lib/rbac";
import { advanceWorkflow } from "@/lib/workflow/advance-workflow";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(
      canAdvanceWorkflow(user.role),
      "Viewers cannot advance workflow.",
    );

    const { claimId } = await context.params;
    const result = await advanceWorkflow(claimId, user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
