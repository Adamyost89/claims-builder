import bcrypt from "bcryptjs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  ClaimType,
  ReviewStatus,
  UserRole,
  WorkflowStage,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { getUsableParsedData } from "@/lib/parse/usable-data";
import { parseClaimDocument } from "@/lib/parse/service";
import { carrierEstimateParser } from "@/server/parsers/carrier-estimate";
import { shouldTriggerAiFallback } from "@/lib/parse/ai/fallback";
import { aiCarrierExtractionSchema } from "@/lib/parse/ai/schemas";
import { ERIE_FIXTURE, GAF_WASTE_TABLE_FIXTURE } from "@/lib/parsers/fixtures/erie";
import { saveClaimFile } from "@/server/storage/adapter";

describe("AI parse fallback", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `ai-parse-${Date.now()}@example.com`,
        name: "AI Parse User",
        passwordHash: await bcrypt.hash("password", 8),
        role: UserRole.SUPPLEMENT_WRITER,
      },
    });
    userId = user.id;
  });

  beforeEach(async () => {
    await prisma.parserCertification.updateMany({
      data: { parserCertified: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createClaimWithDocument(input: {
    type: "CARRIER_ESTIMATE" | "GAF";
    fileName: string;
    text: string;
  }) {
    const claim = await prisma.claim.create({
      data: {
        customerName: "AI Parse Customer",
        propertyAddress: "1 AI St",
        carrier: "Erie",
        claimNumber: `AI-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dateOfLoss: new Date("2024-01-01"),
        state: "MI",
        city: "Detroit",
        claimType: ClaimType.ROOF,
        createdById: userId,
        workflowStage: WorkflowStage.PARSE,
      },
    });

    const stored = await saveClaimFile({
      claimId: claim.id,
      fileName: input.fileName,
      buffer: Buffer.from(input.text),
    });

    const document = await prisma.document.create({
      data: {
        claimId: claim.id,
        type: input.type,
        fileName: input.fileName,
        mimeType: "text/plain",
        storageKey: stored.storageKey,
        fileSize: Buffer.byteLength(input.text),
        uploadedById: userId,
      },
    });

    return { claimId: claim.id, documentId: document.id };
  }

  async function cleanupClaim(claimId: string) {
    await prisma.confidenceReviewItem.deleteMany({ where: { claimId } });
    await prisma.documentExtraction.deleteMany({ where: { claimId } });
    await prisma.estimateLineItem.deleteMany({ where: { claimId } });
    await prisma.measurementValue.deleteMany({ where: { claimId } });
    await prisma.measurementReport.deleteMany({ where: { claimId } });
    await prisma.claimEvent.deleteMany({ where: { claimId } });
    await prisma.document.deleteMany({ where: { claimId } });
    await prisma.claim.deleteMany({ where: { id: claimId } });
  }

  it("Erie estimate deterministic failure triggers AI fallback", async () => {
    const text = ERIE_FIXTURE.pages.map((p) => p.text).join("\n");
    const heuristic = carrierEstimateParser.parse({
      documentId: "doc-test",
      claimId: "claim-test",
      documentType: "CARRIER_ESTIMATE",
      fileName: "erie.txt",
      pages: ERIE_FIXTURE.pages,
      fullText: text,
      parserCertified: true,
    });

    expect(heuristic.lineItems).toHaveLength(0);
    expect(
      shouldTriggerAiFallback({
        documentType: "CARRIER_ESTIMATE",
        parseResult: heuristic,
        threshold: 0.85,
      }),
    ).toBe(true);

    const { claimId, documentId } = await createClaimWithDocument({
      type: "CARRIER_ESTIMATE",
      fileName: "erie-estimate.txt",
      text,
    });

    const updated = await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const metadata = JSON.parse(updated.metadataJson ?? "{}") as { aiApplied?: boolean };
    expect(metadata.aiApplied).toBe(true);

    await cleanupClaim(claimId);
  });

  it("AI fallback returns line items and creates EstimateLineItem rows", async () => {
    const text = ERIE_FIXTURE.pages.map((p) => p.text).join("\n");
    const { claimId, documentId } = await createClaimWithDocument({
      type: "CARRIER_ESTIMATE",
      fileName: "erie-estimate.txt",
      text,
    });

    await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const lineItems = await prisma.estimateLineItem.findMany({ where: { claimId } });
    expect(lineItems.length).toBeGreaterThanOrEqual(2);
    expect(lineItems.every((row) => row.extractionMethod === "LLM")).toBe(true);
    expect(lineItems.some((row) => row.description.includes("Tear out"))).toBe(true);

    const extractions = await prisma.documentExtraction.findMany({ where: { claimId } });
    expect(extractions.some((row) => row.extractionMethod === "LLM")).toBe(true);

    await cleanupClaim(claimId);
  });

  it("AI extracted values are PENDING review", async () => {
    const text = ERIE_FIXTURE.pages.map((p) => p.text).join("\n");
    const { claimId, documentId } = await createClaimWithDocument({
      type: "CARRIER_ESTIMATE",
      fileName: "erie-estimate.txt",
      text,
    });

    await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const lineItems = await prisma.estimateLineItem.findMany({ where: { claimId } });
    expect(lineItems.length).toBeGreaterThan(0);
    expect(lineItems.every((row) => row.reviewStatus === ReviewStatus.PENDING)).toBe(true);

    await cleanupClaim(claimId);
  });

  it("AI cannot create accepted data directly", async () => {
    const text = ERIE_FIXTURE.pages.map((p) => p.text).join("\n");
    const { claimId, documentId } = await createClaimWithDocument({
      type: "CARRIER_ESTIMATE",
      fileName: "erie-estimate.txt",
      text,
    });

    await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const accepted = await prisma.estimateLineItem.count({
      where: {
        claimId,
        extractionMethod: "LLM",
        reviewStatus: { in: [ReviewStatus.ACCEPTED, ReviewStatus.EDITED] },
      },
    });
    expect(accepted).toBe(0);

    await cleanupClaim(claimId);
  });

  it("missing source text blocks extraction and creates ConfidenceReviewItem", async () => {
    const text = `${ERIE_FIXTURE.pages.map((p) => p.text).join("\n")}\nAI_TEST_MISSING_SOURCE`;
    const { claimId, documentId } = await createClaimWithDocument({
      type: "CARRIER_ESTIMATE",
      fileName: "erie-estimate.txt",
      text,
    });

    await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const blockedLine = await prisma.estimateLineItem.findFirst({
      where: { claimId, description: "Fabricated line" },
    });
    expect(blockedLine).toBeNull();

    const blockedReview = await prisma.confidenceReviewItem.findFirst({
      where: {
        claimId,
        reason: { contains: "source text not found" },
      },
    });
    expect(blockedReview).toBeTruthy();
    expect(blockedReview?.blocksOutput).toBe(true);

    await cleanupClaim(claimId);
  });

  it("measurement AI extraction handles GAF waste table without choosing 0% unless suggested", async () => {
    const text = GAF_WASTE_TABLE_FIXTURE.pages.map((p) => p.text).join("\n");
    const { claimId, documentId } = await createClaimWithDocument({
      type: "GAF",
      fileName: "gaf-waste.txt",
      text,
    });

    await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const wasteValues = await prisma.measurementValue.findMany({
      where: { claimId, key: "waste_pct_recommended" },
    });
    expect(wasteValues).toHaveLength(1);
    expect(wasteValues[0]?.value).toBe(12);
    expect(wasteValues[0]?.rawText).toContain("Suggested Waste 12%");

    const zeroWaste = await prisma.measurementValue.findFirst({
      where: { claimId, key: "waste_pct_recommended", value: 0 },
    });
    expect(zeroWaste).toBeNull();

    await cleanupClaim(claimId);
  });

  it("unsupported or malformed AI JSON fails closed", async () => {
    const text = `${ERIE_FIXTURE.pages.map((p) => p.text).join("\n")}\nAI_TEST_FORCE_MALFORMED`;
    const { claimId, documentId } = await createClaimWithDocument({
      type: "CARRIER_ESTIMATE",
      fileName: "erie-estimate.txt",
      text,
    });

    const updated = await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const metadata = JSON.parse(updated.metadataJson ?? "{}") as {
      aiApplied?: boolean;
      warnings?: string[];
    };
    expect(metadata.aiApplied).toBeFalsy();

    const lineItems = await prisma.estimateLineItem.findMany({ where: { claimId } });
    expect(lineItems).toHaveLength(0);

    const warnings = JSON.parse(updated.metadataJson ?? "{}").warnings as string[];
    expect(warnings.some((w) => w.includes("AI fallback failed closed"))).toBe(true);

    await cleanupClaim(claimId);
  });

  it("no downstream phase uses AI parsed data until human review accepts it", async () => {
    const text = ERIE_FIXTURE.pages.map((p) => p.text).join("\n");
    const { claimId, documentId } = await createClaimWithDocument({
      type: "CARRIER_ESTIMATE",
      fileName: "erie-estimate.txt",
      text,
    });

    await parseClaimDocument({
      claimId,
      documentId,
      actorId: userId,
      actorRole: UserRole.SUPPLEMENT_WRITER,
    });

    const allLineItems = await prisma.estimateLineItem.findMany({ where: { claimId } });
    expect(allLineItems.length).toBeGreaterThan(0);

    const usable = await getUsableParsedData(claimId);
    expect(usable.lineItems).toHaveLength(0);
    expect(usable.extractions).toHaveLength(0);

    await cleanupClaim(claimId);
  });
});

describe("AI parse schemas", () => {
  it("rejects malformed carrier extraction payloads", () => {
    expect(() =>
      aiCarrierExtractionSchema.parse({ lineItems: [{ description: 123 }] }),
    ).toThrow();
  });
});
