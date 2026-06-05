import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  deleteClaimDocument,
  DocumentValidationError,
  listClaimDocuments,
  uploadClaimDocument,
} from "@/lib/documents/service";
import { readClaimFile } from "@/server/storage/adapter";

describe("document upload infrastructure", () => {
  let writerId: string;
  let claimId: string;
  const storageKeys: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `doc-writer-${Date.now()}@example.com`,
        name: "Doc Writer",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    writerId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Doc Test Customer",
        propertyAddress: "1 Doc St",
        carrier: "Carrier",
        claimNumber: `DOC-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: writerId,
      },
    });
    claimId = claim.id;
  });

  afterAll(async () => {
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.document.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: writerId } });
    await prisma.$disconnect();
  });

  it("uploads, stores, classifies, and logs UPLOAD audit event", async () => {
    const buffer = Buffer.from("%PDF-1.4 test content");
    const document = await uploadClaimDocument({
      claimId,
      fileName: "carrier-estimate.pdf",
      mimeType: "application/pdf",
      buffer,
      documentType: "CARRIER_ESTIMATE",
      actorId: writerId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });
    storageKeys.push(document.storageKey);

    expect(document.type).toBe("CARRIER_ESTIMATE");
    expect(document.classificationConfidence).toBe(1);
    expect(document.parseStatus).toBe("PENDING");

    const stored = await readClaimFile(document.storageKey);
    expect(stored.equals(buffer)).toBe(true);

    const event = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "UPLOAD", actorId: writerId },
    });
    expect(event).toBeTruthy();
    const payload = JSON.parse(event!.payloadJson);
    expect(payload.documentId).toBe(document.id);
  });

  it("rejects disallowed file types", async () => {
    await expect(
      uploadClaimDocument({
        claimId,
        fileName: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("hello"),
        documentType: "OTHER",
        actorId: writerId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it("lists active documents and soft-deletes with audit trail", async () => {
    const buffer = Buffer.from("%PDF-1.4 delete me");
    const document = await uploadClaimDocument({
      claimId,
      fileName: "to-delete.pdf",
      mimeType: "application/pdf",
      buffer,
      documentType: "INVOICE",
      actorId: writerId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const listed = await listClaimDocuments(claimId);
    expect(listed.some((d) => d.id === document.id)).toBe(true);

    await deleteClaimDocument({
      claimId,
      documentId: document.id,
      actorId: writerId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const afterDelete = await listClaimDocuments(claimId);
    expect(afterDelete.some((d) => d.id === document.id)).toBe(false);

    const deleteEvent = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "DOCUMENT_DELETE" },
    });
    expect(deleteEvent).toBeTruthy();
  });
});
