import { OutputMode } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { getGenerationPreview } from "@/lib/generation/service";

type RouteContext = { params: Promise<{ claimId: string }> };

const querySchema = z.object({
  outputMode: z.nativeEnum(OutputMode),
});

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireSessionUser();
    const { claimId } = await context.params;
    const url = new URL(request.url);
    const query = querySchema.parse({
      outputMode: url.searchParams.get("outputMode"),
    });

    const preview = await getGenerationPreview(claimId, query.outputMode);
    return NextResponse.json(preview);
  } catch (error) {
    return apiError(error);
  }
}
