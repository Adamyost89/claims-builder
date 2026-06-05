import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { getClaimDocument } from "@/lib/documents/service";
import { assertPermission, canViewClaims } from "@/lib/rbac";
import { readClaimFile } from "@/server/storage/adapter";

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

    const buffer = await readClaimFile(document.storageKey);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
