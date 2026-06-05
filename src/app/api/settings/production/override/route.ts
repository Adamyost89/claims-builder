import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { setProductionOverride } from "@/lib/production/service";

const overrideSchema = z.object({
  overrideNote: z.string().min(1, "Override note is required."),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = overrideSchema.parse(await request.json());

    const settings = await setProductionOverride({
      actorId: user.id,
      actorRole: user.role,
      overrideNote: body.overrideNote,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return apiError(error);
  }
}
