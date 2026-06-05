import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createNoteSchema } from "@/lib/claims/schemas";
import { createClaimNote, getClaimById } from "@/lib/claims/service";
import { assertPermission, canAddNotes, canViewClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canViewClaims(user.role), "You do not have permission to view claims.");

    const { claimId } = await context.params;
    const claim = await getClaimById(claimId);
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    return NextResponse.json({ notes: claim.notes });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canAddNotes(user.role), "Viewers cannot add notes.");

    const { claimId } = await context.params;
    const body = await request.json();
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const note = await createClaimNote(claimId, parsed.data, user.id, user.role);
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
