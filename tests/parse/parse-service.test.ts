import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ClaimType, UserRole, WorkflowStage } from "@prisma/client";

import { prisma } from "@/lib/db";
import { CARRIER_FIXTURE } from "@/lib/parsers/fixtures/carrier";
import { parseClaimDocument } from "@/lib/parse/service";
import { saveClaimFile } from "@/server/storage/adapter";

describe("parse service integration", () => {
  let userId: string;
  let claimId: string;
  let documentId: string;

  beforeAll(async () => {
    await prisma.parserCertification.updateMany({
      data: { parserCertified: false },
    });

    const user = await prisma.user.create({
      data: {
        email: `parse-${Date.now()}@example.com`,
        name: "Parse User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Parse Customer",
        propertyAddress: "1 Parse St",
        carrier: "Carrier",
        claimNumber: `PARSE-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
        workflowStage: WorkflowStage.PARSE,
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
    documentId = document.id;
  });

  beforeEach(async () => {
    await prisma.parserCertification.updateMany({
      data: { parserCertified: false },
    });
  });

  afterAll(async () => {
    await prisma.parserCertification.updateMany({
      data: { parserCertified: true },
    });
    await prisma.confidenceReviewItem.deleteMany({ where: { claimId } });
    await prisma.documentExtraction.deleteMany({ where: { claimId } });
    await prisma.estimateLineItem.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.document.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("persists EstimateLineItem rows and DocumentExtraction provenance", async () => {
    const updated = await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    expect(updated.parseStatus).toBe("NEEDS_REVIEW");

    const lineItems = await prisma.estimateLineItem.findMany({ where: { claimId } });
    expect(lineItems.length).toBeGreaterThanOrEqual(3);
    expect(lineItems[0].rawText).toBeTruthy();
    expect(lineItems[0].sourcePage).toBe(1);
    expect(lineItems[0].confidence).toBeGreaterThan(0);
    expect(lineItems[0].extractionMethod).toBe("HEURISTIC");

    const extractions = await prisma.documentExtraction.findMany({ where: { claimId } });
    expect(extractions.length).toBeGreaterThan(0);
    expect(extractions.some((e) => e.fieldName.startsWith("line_item:"))).toBe(true);
  });

  it("creates ConfidenceReviewItem rows for uncertified parser output", async () => {
    const queue = await prisma.confidenceReviewItem.findMany({ where: { claimId } });
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((item) => item.blocksOutput)).toBe(true);
  });
});
