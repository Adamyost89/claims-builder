import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { revokeProductionOverride } from "@/lib/production/service";

const revokeSchema = z.object({
  revokeNote: z.string().min(1, "Revoke note is required."),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = revokeSchema.parse(await request.json());

    const settings = await revokeProductionOverride({
      actorId: user.id,
      actorRole: user.role,
      revokeNote: body.revokeNote,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return apiError(error);
  }
}
