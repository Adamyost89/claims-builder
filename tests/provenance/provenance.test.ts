import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { createDocumentExtraction } from "@/lib/provenance/extraction";
import { assertProvenanceComplete } from "@/lib/provenance/types";

describe("provenance extraction", () => {
  let claimId: string;
  let documentId: string;
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `prov-${Date.now()}@example.com`,
        name: "Prov User",
        passwordHash: await bcrypt.hash("password", 8),
        role: "SUPPLEMENT_WRITER",
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Prov Customer",
        propertyAddress: "1 Prov St",
        carrier: "Carrier",
        claimNumber: `PRV-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
      },
    });
    claimId = claim.id;

    const document = await prisma.document.create({
      data: {
        claimId,
        type: "CARRIER_ESTIMATE",
        fileName: "estimate.pdf",
        mimeType: "application/pdf",
        storageKey: "claims/test/estimate.pdf",
        fileSize: 100,
        uploadedById: userId,
      },
    });
    documentId = document.id;
  });

  afterAll(async () => {
    await prisma.documentExtraction.deleteMany({ where: { claimId } });
    await prisma.document.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("requires full provenance on extraction create", async () => {
    expect(
      assertProvenanceComplete({
        value: 20.33,
        sourceDocumentId: documentId,
        sourcePage: 2,
        extractionMethod: "HEURISTIC",
        confidence: 0.92,
        sourceText: "Roof area: 20.33 SQ",
      }),
    ).toBe(true);

    const extraction = await createDocumentExtraction({
      documentId,
      claimId,
      fieldName: "roof_area_sq",
      provenance: {
        value: 20.33,
        sourceDocumentId: documentId,
        sourcePage: 2,
        extractionMethod: "HEURISTIC",
        confidence: 0.92,
        sourceText: "Roof area: 20.33 SQ",
      },
    });

    expect(extraction.fieldValue).toBe("20.33");
    expect(extraction.sourcePage).toBe(2);
    expect(extraction.confidence).toBe(0.92);
    expect(extraction.reviewStatus).toBe("PENDING");
  });

  it("rejects incomplete provenance", async () => {
    await expect(
      createDocumentExtraction({
        documentId,
        claimId,
        fieldName: "starter_lf",
        provenance: {
          value: 120,
          sourceDocumentId: documentId,
          sourcePage: null,
          extractionMethod: "HEURISTIC",
          confidence: 0.5,
        },
      }),
    ).resolves.toBeTruthy();

    await expect(
      createDocumentExtraction({
        documentId,
        claimId,
        fieldName: "bad",
        provenance: {
          value: 1,
          sourceDocumentId: "",
          sourcePage: 1,
          extractionMethod: "HEURISTIC",
          confidence: 0.9,
        },
      }),
    ).rejects.toThrow(/missing required provenance/i);
  });
});
