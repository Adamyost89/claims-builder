import { EvidenceType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createEvidenceLink } from "@/lib/evidence/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

const linkSchema = z.object({
  revisionItemId: z.string().min(1),
  evidenceType: z.nativeEnum(EvidenceType),
  targetTable: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().optional(),
  snippet: z.string().optional(),
  isRequired: z.boolean().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot link evidence.");

    const { claimId } = await context.params;
    const body = linkSchema.parse(await request.json());

    const link = await createEvidenceLink({
      claimId,
      revisionItemId: body.revisionItemId,
      evidenceType: body.evidenceType,
      targetTable: body.targetTable,
      targetId: body.targetId,
      label: body.label,
      snippet: body.snippet,
      isRequired: body.isRequired,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ link });
  } catch (error) {
    return apiError(error);
  }
}
