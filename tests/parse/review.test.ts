import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType, ReviewStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { CARRIER_FIXTURE } from "@/lib/parsers/fixtures/carrier";
import { parseClaimDocument } from "@/lib/parse/service";
import {
  reviewExtraction,
  reviewLineItem,
} from "@/lib/parse/review";
import { getUsableParsedData } from "@/lib/parse/usable-data";
import { saveClaimFile } from "@/server/storage/adapter";

describe("parse review actions", () => {
  let userId: string;
  let claimId: string;
  let lineItemId: string;
  let extractionId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `review-${Date.now()}@example.com`,
        name: "Review User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Review Customer",
        propertyAddress: "1 Review St",
        carrier: "Carrier",
        claimNumber: `REV-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
      },
    });
    claimId = claim.id;

    const text = CARRIER_FIXTURE.pages.map((p) => p.text).join("\n");
    const stored = await saveClaimFile({
      claimId,
      fileName: "carrier-estimate.txt",
      buffer: Buffer.from(text),
    });

    const document = await prisma.document.create({
      data: {
        claimId,
        type: "CARRIER_ESTIMATE",
        fileName: "carrier-estimate.txt",
        mimeType: "text/plain",
        storageKey: stored.storageKey,
        fileSize: Buffer.byteLength(text),
        uploadedById: userId,
      },
    });

    await parseClaimDocument({
      claimId,
      documentId: document.id,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const line = await prisma.estimateLineItem.findFirst({ where: { claimId } });
    const extraction = await prisma.documentExtraction.findFirst({
      where: { claimId, fieldName: "line_item_count" },
    });
    if (!line || !extraction) {
      throw new Error("Fixture parse did not create review rows.");
    }
    lineItemId = line.id;
    extractionId = extraction.id;
  });

  afterAll(async () => {
    await prisma.confidenceReviewItem.deleteMany({ where: { claimId } });
    await prisma.documentExtraction.deleteMany({ where: { claimId } });
    await prisma.estimateLineItem.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.document.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("logs MANUAL_EDIT and preserves original value on extraction edit", async () => {
    const before = await prisma.documentExtraction.findUnique({
      where: { id: extractionId },
    });

    await reviewExtraction({
      claimId,
      extractionId,
      action: "edit",
      newValue: "99",
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const after = await prisma.documentExtraction.findUnique({
      where: { id: extractionId },
    });
    expect(after?.fieldValue).toBe("99");
    expect(after?.originalFieldValue).toBe(before?.fieldValue);
    expect(after?.reviewStatus).toBe(ReviewStatus.EDITED);
    expect(after?.reviewedById).toBe(userId);
    expect(after?.reviewedAt).toBeTruthy();

    const event = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "MANUAL_EDIT", actorId: userId },
    });
    expect(event).toBeTruthy();
  });

  it("excludes rejected line items from usable parsed data", async () => {
    await reviewLineItem({
      claimId,
      lineItemId,
      action: "reject",
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const usable = await getUsableParsedData(claimId);
    expect(usable.lineItems.some((row) => row.id === lineItemId)).toBe(false);

    const rejected = await prisma.estimateLineItem.findUnique({
      where: { id: lineItemId },
    });
    expect(rejected?.reviewStatus).toBe(ReviewStatus.REJECTED);
  });
});
