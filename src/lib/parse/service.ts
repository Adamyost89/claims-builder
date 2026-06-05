import {
  DocumentType,
  MeasurementVendor,
  ParseStatus,
  ReviewStatus,
  UserRole,
} from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import {
  createConfidenceReviewItem,
  maybeQueueLowConfidence,
} from "@/lib/confidence/queue";
import { prisma } from "@/lib/db";
import { getConfidenceThreshold } from "@/lib/parsers/confidence";
import { isParserCertified } from "@/lib/parsers/certification";
import type { ParseResult } from "@/lib/parsers/types";
import { assertPermission, canEditClaims } from "@/lib/rbac";
import { createDocumentExtraction } from "@/lib/provenance/extraction";
import { getParserForDocumentType, resolveParserType } from "@/server/parsers/registry";
import { extractTextFromDocument } from "@/server/parsers/text-extract";

const VENDOR_BY_TYPE: Partial<Record<DocumentType, MeasurementVendor>> = {
  EAGLEVIEW: MeasurementVendor.EAGLEVIEW,
  HOVER: MeasurementVendor.HOVER,
  GAF: MeasurementVendor.GAF,
};

export async function parseClaimDocument(input: {
  claimId: string;
  documentId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot parse documents.");

  const document = await prisma.document.findFirst({
    where: { id: input.documentId, claimId: input.claimId, deletedAt: null },
  });
  if (!document) {
    throw new Error("Document not found.");
  }

  const parserType = resolveParserType(document.type);
  if (!parserType) {
    throw new Error(`No parser registered for document type ${document.type}.`);
  }

  const parser = getParserForDocumentType(document.type);
  if (!parser) {
    throw new Error("Parser implementation missing.");
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { parseStatus: ParseStatus.PROCESSING, parseError: null },
  });

  try {
    const text = await extractTextFromDocument({
      storageKey: document.storageKey,
      mimeType: document.mimeType,
      fileName: document.fileName,
    });

    const parserCertified = await isParserCertified(parserType);
    const parseResult = parser.parse({
      documentId: document.id,
      claimId: input.claimId,
      documentType: document.type,
      fileName: document.fileName,
      pages: text.pages,
      fullText: text.fullText,
      parserCertified,
    });

    await clearPriorParseResults(document.id, input.claimId);

    const threshold = await getConfidenceThreshold();
    await persistParseResult({
      claimId: input.claimId,
      documentId: document.id,
      documentType: document.type,
      parseResult,
      parserCertified,
      threshold,
    });

    const needsReview = !parserCertified || parseResult.overallConfidence < threshold;

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        parseStatus: needsReview ? ParseStatus.NEEDS_REVIEW : ParseStatus.COMPLETE,
        confidence: parseResult.overallConfidence,
        parseError: null,
        metadataJson: JSON.stringify({
          parserType,
          parserCertified,
          pageCount: text.pages.length,
          warnings: parseResult.warnings,
          parsedAt: new Date().toISOString(),
        }),
      },
    });

    await logClaimEvent({
      claimId: input.claimId,
      actorId: input.actorId,
      eventType: "PARSE",
      payload: {
        documentId: document.id,
        parserType,
        parserCertified,
        overallConfidence: parseResult.overallConfidence,
        lineItemCount: parseResult.lineItems.length,
        measurementCount: parseResult.measurements.length,
        fieldCount: parseResult.fields.length,
      },
    });

    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse failed";
    await prisma.document.update({
      where: { id: document.id },
      data: {
        parseStatus: ParseStatus.FAILED,
        parseError: message,
      },
    });
    throw error;
  }
}

async function clearPriorParseResults(documentId: string, claimId: string) {
  const extractionIds = (
    await prisma.documentExtraction.findMany({
      where: { documentId },
      select: { id: true },
    })
  ).map((r) => r.id);
  const lineIds = (
    await prisma.estimateLineItem.findMany({
      where: { documentId },
      select: { id: true },
    })
  ).map((r) => r.id);
  const valueIds = (
    await prisma.measurementValue.findMany({
      where: { report: { documentId } },
      select: { id: true },
    })
  ).map((r) => r.id);

  const relatedIds = [...extractionIds, ...lineIds, ...valueIds];
  if (relatedIds.length > 0) {
    await prisma.confidenceReviewItem.deleteMany({
      where: { claimId, relatedId: { in: relatedIds } },
    });
  }

  await prisma.documentExtraction.deleteMany({ where: { documentId } });
  await prisma.estimateLineItem.deleteMany({ where: { documentId } });

  const reports = await prisma.measurementReport.findMany({ where: { documentId } });
  for (const report of reports) {
    await prisma.measurementValue.deleteMany({ where: { reportId: report.id } });
  }
  await prisma.measurementReport.deleteMany({ where: { documentId } });
}

async function persistParseResult(input: {
  claimId: string;
  documentId: string;
  documentType: DocumentType;
  parseResult: ParseResult;
  parserCertified: boolean;
  threshold: number;
}) {
  for (const field of input.parseResult.fields) {
    const extraction = await createDocumentExtraction({
      documentId: input.documentId,
      claimId: input.claimId,
      fieldName: field.fieldName,
      provenance: field.provenance,
    });
    await queueIfNeeded({
      claimId: input.claimId,
      relatedTable: "DocumentExtraction",
      relatedId: extraction.id,
      confidence: field.provenance.confidence,
      label: field.fieldName,
      parserCertified: input.parserCertified,
      threshold: input.threshold,
    });
  }

  for (const item of input.parseResult.lineItems) {
    const extraction = await createDocumentExtraction({
      documentId: input.documentId,
      claimId: input.claimId,
      fieldName: `line_item:${item.description}`,
      provenance: item.provenance,
    });

    const line = await prisma.estimateLineItem.create({
      data: {
        claimId: input.claimId,
        documentId: input.documentId,
        extractionId: extraction.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice ?? null,
        total: item.total ?? null,
        category: item.category ?? null,
        lineCode: item.lineCode ?? null,
        sourcePage: item.provenance.sourcePage,
        rawText: item.provenance.sourceText ?? null,
        confidence: item.provenance.confidence,
        reviewStatus: ReviewStatus.PENDING,
        extractionMethod: item.provenance.extractionMethod,
      },
    });

    await queueIfNeeded({
      claimId: input.claimId,
      relatedTable: "EstimateLineItem",
      relatedId: line.id,
      confidence: item.provenance.confidence,
      label: item.description,
      parserCertified: input.parserCertified,
      threshold: input.threshold,
    });
  }

  if (input.parseResult.measurements.length > 0) {
    const vendor = VENDOR_BY_TYPE[input.documentType] ?? MeasurementVendor.OTHER;
    const report = await prisma.measurementReport.create({
      data: {
        claimId: input.claimId,
        documentId: input.documentId,
        vendor,
        reportName: `${vendor} report`,
        confidence: input.parseResult.overallConfidence,
        rawSummaryJson: JSON.stringify({ parserType: input.parseResult.parserType }),
      },
    });

    for (const measurement of input.parseResult.measurements) {
      const extraction = await createDocumentExtraction({
        documentId: input.documentId,
        claimId: input.claimId,
        fieldName: measurement.key,
        provenance: measurement.provenance,
      });

      const value = await prisma.measurementValue.create({
        data: {
          reportId: report.id,
          claimId: input.claimId,
          extractionId: extraction.id,
          key: measurement.key,
          value: measurement.value,
          unit: measurement.unit,
          sourcePage: measurement.provenance.sourcePage,
          rawText: measurement.provenance.sourceText ?? null,
          confidence: measurement.provenance.confidence,
          reviewStatus: ReviewStatus.PENDING,
          extractionMethod: measurement.provenance.extractionMethod,
        },
      });

      await queueIfNeeded({
        claimId: input.claimId,
        relatedTable: "MeasurementValue",
        relatedId: value.id,
        confidence: measurement.provenance.confidence,
        label: measurement.key,
        parserCertified: input.parserCertified,
        threshold: input.threshold,
      });
    }
  }
}

async function queueIfNeeded(input: {
  claimId: string;
  relatedTable: string;
  relatedId: string;
  confidence: number;
  label: string;
  parserCertified: boolean;
  threshold: number;
}) {
  const reviewType =
    input.relatedTable === "EstimateLineItem"
      ? "ESTIMATE_LINE"
      : input.relatedTable === "MeasurementValue"
        ? "MEASUREMENT_VALUE"
        : "DOCUMENT_CLASSIFICATION";

  if (!input.parserCertified) {
    await createConfidenceReviewItem({
      claimId: input.claimId,
      reviewType,
      relatedTable: input.relatedTable,
      relatedId: input.relatedId,
      confidence: input.confidence,
      reason: `Parser is not certified; ${input.label} requires human review.`,
      blocksOutput: true,
    });
    return;
  }

  if (input.confidence < input.threshold) {
    await maybeQueueLowConfidence({
      claimId: input.claimId,
      reviewType,
      relatedTable: input.relatedTable,
      relatedId: input.relatedId,
      confidence: input.confidence,
      label: input.label,
      threshold: input.threshold,
    });
  }
}

export async function getParsedDataForClaim(claimId: string) {
  const [documents, lineItems, reports, extractions, confidenceQueue] =
    await Promise.all([
      prisma.document.findMany({
        where: { claimId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      }),
      prisma.estimateLineItem.findMany({
        where: { claimId },
        orderBy: { createdAt: "asc" },
        include: {
          document: { select: { fileName: true, type: true } },
          reviewedBy: { select: { name: true } },
        },
      }),
      prisma.measurementReport.findMany({
        where: { claimId },
        include: {
          document: { select: { fileName: true, type: true } },
          values: {
            include: { reviewedBy: { select: { name: true } } },
          },
        },
      }),
      prisma.documentExtraction.findMany({
        where: { claimId },
        orderBy: { createdAt: "asc" },
        include: {
          document: { select: { fileName: true, type: true } },
          reviewedBy: { select: { name: true } },
        },
      }),
      prisma.confidenceReviewItem.findMany({
        where: { claimId, resolution: "PENDING" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  return { documents, lineItems, reports, extractions, confidenceQueue };
}
