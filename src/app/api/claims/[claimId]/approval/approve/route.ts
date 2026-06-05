import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { approveGeneratedOutput } from "@/lib/approval/service";

type RouteContext = { params: Promise<{ claimId: string }> };

const approveSchema = z.object({
  outputId: z.string().min(1),
  approvedSections: z.array(
    z.object({
      revisionItemId: z.string().min(1),
      heading: z.string().min(1),
      approved: z.boolean(),
    }),
  ),
  finalApprovalConfirmed: z.boolean(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { claimId } = await context.params;
    const body = approveSchema.parse(await request.json());

    const approved = await approveGeneratedOutput({
      claimId,
      outputId: body.outputId,
      actorId: user.id,
      actorRole: user.role,
      approvedSections: body.approvedSections,
      finalApprovalConfirmed: body.finalApprovalConfirmed,
    });

    return NextResponse.json({ output: approved });
  } catch (error) {
    return apiError(error);
  }
}
