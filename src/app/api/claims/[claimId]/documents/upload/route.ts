import { DocumentType } from "@prisma/client";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { uploadClaimDocument } from "@/lib/documents/service";
import { assertPermission, canEditClaims } from "@/lib/rbac";

type RouteContext = { params: Promise<{ claimId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    assertPermission(canEditClaims(user.role), "Viewers cannot upload documents.");

    const { claimId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    const documentType = formData.get("documentType");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const validTypes = new Set(Object.values(DocumentType));
    if (typeof documentType !== "string" || !validTypes.has(documentType as DocumentType)) {
      return NextResponse.json({ error: "Valid document type is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await uploadClaimDocument({
      claimId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
      documentType: documentType as DocumentType,
      actorId: user.id,
      actorRole: user.role,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
