import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimType, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import {
  reviewClaimComparison,
  runClaimComparison,
} from "@/lib/comparison/service";
import { getUsableParsedData } from "@/lib/parse/usable-data";

describe("comparison service", () => {
  let userId: string;
  let claimId: string;
  let carrierDocId: string;
  let measurementDocId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `cmp-${Date.now()}@example.com`,
        name: "Comparison User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    userId = user.id;

    const claim = await prisma.claim.create({
      data: {
        customerName: "Comparison Customer",
        propertyAddress: "1 Compare St",
        carrier: "Carrier",
        claimNumber: `CMP-${Date.now()}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
      },
    });
    claimId = claim.id;

    const carrierDoc = await prisma.document.create({
      data: {
        claimId,
        type: "CARRIER_ESTIMATE",
        fileName: "carrier.pdf",
        mimeType: "application/pdf",
        storageKey: "claims/test/carrier.pdf",
        fileSize: 100,
        uploadedById: userId,
        parseStatus: "COMPLETE",
      },
    });
    carrierDocId = carrierDoc.id;

    const measurementDoc = await prisma.document.create({
      data: {
        claimId,
        type: "EAGLEVIEW",
        fileName: "eagleview.pdf",
        mimeType: "application/pdf",
        storageKey: "claims/test/eagleview.pdf",
        fileSize: 100,
        uploadedById: userId,
        parseStatus: "COMPLETE",
      },
    });
    measurementDocId = measurementDoc.id;

    await prisma.estimateLineItem.create({
      data: {
        claimId,
        documentId: carrierDocId,
        description: "R&R Laminated - comp. shingle rfg.",
        quantity: 20,
        unit: "SQ",
        reviewStatus: "ACCEPTED",
      },
    });

    await prisma.estimateLineItem.create({
      data: {
        claimId,
        documentId: carrierDocId,
        description: "Rejected shingle line",
        quantity: 99,
        unit: "SQ",
        reviewStatus: "REJECTED",
      },
    });

    const report = await prisma.measurementReport.create({
      data: {
        claimId,
        documentId: measurementDocId,
        vendor: "EAGLEVIEW",
        reportName: "EagleView",
        confidence: 0.95,
      },
    });

    await prisma.measurementValue.create({
      data: {
        reportId: report.id,
        claimId,
        key: MEASUREMENT_KEYS.ROOF_AREA_SQ,
        value: 24.33,
        unit: "SQ",
        reviewStatus: "ACCEPTED",
      },
    });

  });

  it("blocks run when pending parsed data exists", async () => {
    const pendingLine = await prisma.estimateLineItem.create({
      data: {
        claimId,
        documentId: carrierDocId,
        description: "Pending drip edge",
        quantity: 50,
        unit: "LF",
        reviewStatus: "PENDING",
      },
    });

    await expect(
      runClaimComparison({
        claimId,
        actorId: userId,
        actorRole: UserRole.SUPPLEMENT_WRITER,
      }),
    ).rejects.toThrow(/must be reviewed first/i);

    await prisma.estimateLineItem.delete({ where: { id: pendingLine.id } });
  });

  afterAll(async () => {
    await prisma.comparisonResult.deleteMany({ where: { claimId } });
    await prisma.measurementValue.deleteMany({ where: { claimId } });
    await prisma.measurementReport.deleteMany({ where: { claimId } });
    await prisma.estimateLineItem.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.document.deleteMany({ where: { claimId } });
    await prisma.revisionItem.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("getUsableParsedData excludes rejected and pending rows", async () => {
    const usable = await getUsableParsedData(claimId);
    expect(usable.lineItems).toHaveLength(1);
    expect(usable.lineItems[0].description).toContain("Laminated");
    expect(usable.measurements).toHaveLength(1);
    expect(usable.measurements[0].key).toBe(MEASUREMENT_KEYS.ROOF_AREA_SQ);
  });

  it("persists ComparisonResult rows and never creates RevisionItem", async () => {
    const results = await runClaimComparison({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    expect(results.length).toBeGreaterThan(0);

    const roof = results.find((r) => r.comparisonKey === "roof_area_sq");
    expect(roof).toBeTruthy();
    expect(roof!.approvedQty).toBe(20);
    expect(roof!.requestedQty).toBe(24.33);
    expect(roof!.formula).toBe("roof_area_sq = 24.33");

    const revisions = await prisma.revisionItem.count({ where: { claimId } });
    expect(revisions).toBe(0);

    const runEvent = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "COMPARISON_RUN" },
    });
    expect(runEvent).toBeTruthy();
  });

  it("re-run replaces prior comparisons and clears review timestamp", async () => {
    await reviewClaimComparison({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const beforeCount = await prisma.comparisonResult.count({ where: { claimId } });
    await runClaimComparison({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    expect(claim?.comparisonReviewedAt).toBeNull();

    const afterCount = await prisma.comparisonResult.count({ where: { claimId } });
    expect(afterCount).toBe(beforeCount);
  });

  it("comparison review sets comparisonReviewedAt and logs audit", async () => {
    await runClaimComparison({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const updated = await reviewClaimComparison({
      claimId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    expect(updated.comparisonReviewedAt).toBeTruthy();

    const event = await prisma.claimEvent.findFirst({
      where: { claimId, eventType: "COMPARISON_REVIEW" },
    });
    expect(event).toBeTruthy();
  });
});
