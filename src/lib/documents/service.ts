import { DocumentType, ParseStatus, ReviewStatus, UserRole } from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import {
  assertPermission,
  canEditClaims,
  PermissionDeniedError,
} from "@/lib/rbac";
import {
  deleteClaimFile,
  saveClaimFile,
} from "@/server/storage/adapter";

import {
  ALLOWED_MIME_TYPES,
  DEFAULT_MAX_UPLOAD_SIZE_MB,
  isAllowedMimeType,
} from "./constants";

export { PermissionDeniedError };

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

export class DocumentDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentDeletionError";
  }
}

function getMaxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? DEFAULT_MAX_UPLOAD_SIZE_MB);
  return mb * 1024 * 1024;
}

export function validateUploadFile(input: {
  fileName: string;
  mimeType: string;
  size: number;
}): void {
  if (!isAllowedMimeType(input.mimeType)) {
    throw new DocumentValidationError(
      `File type not allowed. Supported: PDF, JPG, PNG, DOCX, XLSX.`,
    );
  }

  const maxBytes = getMaxUploadBytes();
  if (input.size <= 0) {
    throw new DocumentValidationError("File is empty.");
  }
  if (input.size > maxBytes) {
    throw new DocumentValidationError(
      `File exceeds maximum size of ${maxBytes / (1024 * 1024)} MB.`,
    );
  }

  const dot = input.fileName.lastIndexOf(".");
  const ext = dot >= 0 ? input.fileName.toLowerCase().slice(dot) : "";
  const mimeConfig = ALLOWED_MIME_TYPES[input.mimeType];
  if (!(mimeConfig.extensions as readonly string[]).includes(ext)) {
    throw new DocumentValidationError(
      `File extension ${ext || "(none)"} does not match MIME type ${input.mimeType}. Expected: ${mimeConfig.extensions.join(", ")}`,
    );
  }
}

export async function listClaimDocuments(claimId: string) {
  return prisma.document.findMany({
    where: { claimId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      _count: { select: { extractions: true } },
    },
  });
}

export async function getClaimDocument(claimId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, claimId, deletedAt: null },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      extractions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
}

export async function uploadClaimDocument(input: {
  claimId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  documentType: DocumentType;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot upload documents.");

  const claim = await prisma.claim.findUnique({ where: { id: input.claimId } });
  if (!claim) {
    throw new Error("Claim not found.");
  }

  validateUploadFile({
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.buffer.length,
  });

  const stored = await saveClaimFile({
    claimId: input.claimId,
    fileName: input.fileName,
    buffer: input.buffer,
  });

  const document = await prisma.document.create({
    data: {
      claimId: input.claimId,
      type: input.documentType,
      fileName: input.fileName,
      mimeType: input.mimeType,
      storageKey: stored.storageKey,
      fileSize: stored.size,
      parseStatus: ParseStatus.PENDING,
      classificationConfidence: 1,
      reviewStatus: "PENDING",
      uploadedById: input.actorId,
      metadataJson: JSON.stringify({
        classificationMethod: "manual",
        uploadedAt: new Date().toISOString(),
      }),
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "UPLOAD",
    payload: {
      documentId: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      documentType: document.type,
      storageKey: document.storageKey,
    },
  });

  return document;
}

export async function deleteClaimDocument(input: {
  claimId: string;
  documentId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot delete documents.");

  const document = await prisma.document.findFirst({
    where: { id: input.documentId, claimId: input.claimId, deletedAt: null },
  });

  if (!document) {
    throw new Error("Document not found.");
  }

  if (document.parseStatus === ParseStatus.PROCESSING) {
    throw new DocumentDeletionError(
      "Cannot delete a document while parsing is in progress.",
    );
  }

  const reviewedExtractions = await prisma.documentExtraction.count({
    where: {
      documentId: document.id,
      reviewStatus: { not: ReviewStatus.PENDING },
    },
  });
  if (reviewedExtractions > 0) {
    throw new DocumentDeletionError(
      "Cannot delete a document with reviewed extractions. Contact an administrator.",
    );
  }

  await deleteClaimFile(document.storageKey);

  const deleted = await prisma.document.update({
    where: { id: document.id },
    data: {
      deletedAt: new Date(),
      deletedById: input.actorId,
    },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "DOCUMENT_DELETE",
    payload: {
      documentId: document.id,
      fileName: document.fileName,
      documentType: document.type,
    },
  });

  return deleted;
}
