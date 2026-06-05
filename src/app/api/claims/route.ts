import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createClaimSchema } from "@/lib/claims/schemas";
import { createClaim, listClaims } from "@/lib/claims/service";
import { assertPermission, canCreateClaims, canViewClaims } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requireSessionUser();
    assertPermission(canViewClaims(user.role), "You do not have permission to view claims.");
    const claims = await listClaims();
    return NextResponse.json({ claims });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    assertPermission(canCreateClaims(user.role), "Viewers cannot create claims.");

    const body = await request.json();
    const parsed = createClaimSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const claim = await createClaim(parsed.data, user.id, user.role);
    return NextResponse.json({ claim }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
