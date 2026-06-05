import type { UserRole } from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import { assertPermission, canExport } from "@/lib/rbac";

import { buildDocxBuffer } from "./docx";
import { evaluateExportGate } from "./gate";
import { buildExportDocument } from "./format";
import { buildPdfBuffer } from "./pdf";

export type ExportFormat = "clipboard" | "docx" | "pdf";

export type ExportBlockedReason =
  | "RBAC_DENIED"
  | "MISSING_OUTPUT_ID"
  | "CLAIM_NOT_FOUND"
  | "OUTPUT_NOT_FOUND"
  | "EXPORT_GATE_BLOCKED";

export async function logExportBlocked(input: {
  claimId: string;
  actorId: string;
  outputId?: string | null;
  format?: ExportFormat | null;
  blockers: string[];
  reason: ExportBlockedReason;
}) {
  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "EXPORT_BLOCKED",
    payload: {
      outputId: input.outputId ?? null,
      format: input.format ?? null,
      blockers: input.blockers,
      userId: input.actorId,
      reason: input.reason,
    },
  });
}

export async function getApprovedOutputs(claimId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      customerName: true,
      claimNumber: true,
      evidenceReviewedAt: true,
      isDryRun: true,
    },
  });
  if (!claim) {
    return null;
  }

  const outputs = await prisma.generatedOutput.findMany({
    where: { claimId, status: { in: ["APPROVED", "EXPORTED"] } },
    orderBy: [{ version: "desc" }, { approvedAt: "desc" }],
  });

  const outputsWithGate = await Promise.all(
    outputs.map(async (output) => {
      const gate = await evaluateExportGate({
        output,
        claimEvidenceReviewedAt: claim.evidenceReviewedAt,
        claimIsDryRun: claim.isDryRun,
      });
      return { output, gate };
    }),
  );

  return { claim, outputs, outputsWithGate };
}

export async function exportApprovedOutput(input: {
  claimId: string;
  outputId: string;
  format: ExportFormat;
  actorId: string;
  actorRole: UserRole;
}) {
  if (!canExport(input.actorRole)) {
    await logExportBlocked({
      claimId: input.claimId,
      actorId: input.actorId,
      outputId: input.outputId ?? null,
      format: input.format,
      blockers: ["Only managers or admins can export output."],
      reason: "RBAC_DENIED",
    });
    assertPermission(false, "Only managers or admins can export output.");
  }

  if (!input.outputId?.trim()) {
    await logExportBlocked({
      claimId: input.claimId,
      actorId: input.actorId,
      outputId: null,
      format: input.format,
      blockers: ["outputId is required."],
      reason: "MISSING_OUTPUT_ID",
    });
    throw new Error("outputId is required.");
  }

  const [claim, output] = await Promise.all([
    prisma.claim.findUnique({ where: { id: input.claimId } }),
    prisma.generatedOutput.findFirst({
      where: { id: input.outputId, claimId: input.claimId },
    }),
  ]);

  if (!claim) {
    await logExportBlocked({
      claimId: input.claimId,
      actorId: input.actorId,
      outputId: input.outputId,
      format: input.format,
      blockers: ["Claim not found."],
      reason: "CLAIM_NOT_FOUND",
    });
    throw new Error("Claim not found.");
  }
  if (!output) {
    await logExportBlocked({
      claimId: input.claimId,
      actorId: input.actorId,
      outputId: input.outputId,
      format: input.format,
      blockers: ["Generated output not found."],
      reason: "OUTPUT_NOT_FOUND",
    });
    throw new Error("Generated output not found.");
  }

  const gate = await evaluateExportGate({
    output,
    claimEvidenceReviewedAt: claim.evidenceReviewedAt,
    claimIsDryRun: claim.isDryRun,
  });

  if (!gate.allowed) {
    await logExportBlocked({
      claimId: input.claimId,
      actorId: input.actorId,
      outputId: output.id,
      format: input.format,
      blockers: gate.blockers,
      reason: "EXPORT_GATE_BLOCKED",
    });
    throw new Error(gate.blockers.join(" "));
  }

  const document = buildExportDocument({
    output,
    customerName: claim.customerName,
    claimNumber: claim.claimNumber,
    applyWatermark: gate.watermarked,
  });

  const exportedAt = new Date();

  await prisma.generatedOutput.update({
    where: { id: output.id },
    data: {
      status: "EXPORTED",
      exportedAt,
      exportedById: input.actorId,
      exportFormat: input.format,
    },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "EXPORT",
    payload: {
      outputId: output.id,
      outputMode: output.outputMode,
      format: input.format,
      version: output.version,
      watermarked: gate.watermarked,
      exportedAt: exportedAt.toISOString(),
    },
  });

  if (input.format === "clipboard") {
    return {
      format: input.format,
      text: document.plainText,
      fileName: null,
      mimeType: "text/plain",
      buffer: null,
      watermarked: gate.watermarked,
    };
  }

  if (input.format === "docx") {
    const buffer = await buildDocxBuffer(document);
    return {
      format: input.format,
      text: document.plainText,
      fileName: `${claim.claimNumber}-${output.outputMode.toLowerCase()}-v${output.version}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
      watermarked: gate.watermarked,
    };
  }

  const buffer = await buildPdfBuffer(document);
  return {
    format: input.format,
    text: document.plainText,
    fileName: `${claim.claimNumber}-${output.outputMode.toLowerCase()}-v${output.version}.pdf`,
    mimeType: "application/pdf",
    buffer,
    watermarked: gate.watermarked,
  };
}
