import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import {
  deleteClaimDocument,
  DocumentDeletionError,
  getClaimDocument,
} from "@/lib/documents/service";
import { assertPermission, canEditClaims, canViewClaims } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ claimId: string; documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canViewClaims(user.role), "Permission denied.");

    const { claimId, documentId } = await context.params;
    const document = await getClaimDocument(claimId, documentId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot delete documents.");

    const { claimId, documentId } = await context.params;
    const deleted = await deleteClaimDocument({
      claimId,
      documentId,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ document: deleted });
  } catch (error) {
    if (error instanceof DocumentDeletionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return apiError(error);
  }
}
