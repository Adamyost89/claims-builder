import { OutputMode } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { runClaimGeneration } from "@/lib/generation/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

const generateSchema = z.object({
  outputMode: z.nativeEnum(OutputMode),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot generate output.");

    const { claimId } = await context.params;
    const body = generateSchema.parse(await request.json());

    const result = await runClaimGeneration({
      claimId,
      outputMode: body.outputMode,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
