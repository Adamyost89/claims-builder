import type { GeneratedOutput } from "@prisma/client";

import { CARRIER_READY_MODES } from "@/lib/generation/constants";
import type { GenerationOutput } from "@/lib/generation/schemas";

import { DRY_RUN_WATERMARK, INTERNAL_OUTPUT_MODES } from "./constants";

export type ExportSection = {
  revisionItemId: string;
  heading: string;
  body: string;
};

export type ExportDocument = {
  customerName: string;
  claimNumber: string;
  outputMode: string;
  title: string;
  watermark: string | null;
  sections: ExportSection[];
  appendix: string | null;
  plainText: string;
};

export function parseGenerationOutput(contentJson: string | null): GenerationOutput | null {
  if (!contentJson) {
    return null;
  }
  try {
    return JSON.parse(contentJson) as GenerationOutput;
  } catch {
    return null;
  }
}

export function buildExportDocument(input: {
  output: GeneratedOutput;
  customerName: string;
  claimNumber: string;
  applyWatermark?: boolean;
}): ExportDocument {
  const parsed = parseGenerationOutput(input.output.contentJson);
  const carrierReady = CARRIER_READY_MODES.has(input.output.outputMode);
  const internalMode = INTERNAL_OUTPUT_MODES.has(input.output.outputMode);

  const watermark = input.applyWatermark ? DRY_RUN_WATERMARK : null;

  const sections: ExportSection[] =
    parsed?.sections?.map((section) => ({
      revisionItemId: section.revisionItemId,
      heading: section.heading,
      body: section.body,
    })) ?? [];

  const lines: string[] = [];
  if (watermark) {
    lines.push(watermark, "");
  }
  lines.push(parsed?.title ?? input.output.contentText?.split("\n")[0] ?? "Generated output", "");
  for (const section of sections) {
    lines.push(section.heading);
    lines.push(section.body);
    lines.push("");
  }

  let appendix: string | null = null;
  if (internalMode && parsed) {
    const appendixLines: string[] = ["Evidence / revision appendix", ""];
    appendixLines.push(
      `Included revisions: ${JSON.parse(input.output.revisionIdsIncluded).join(", ") || "none"}`,
    );
    if ((parsed.excludedRevisions?.length ?? 0) > 0) {
      appendixLines.push("", "Excluded revisions:");
      for (const excluded of parsed.excludedRevisions ?? []) {
        appendixLines.push(
          `- ${excluded.title} (${excluded.category})${excluded.excludedReason ? `: ${excluded.excludedReason}` : ""}`,
        );
      }
    }
    appendix = appendixLines.join("\n");
    lines.push(appendix);
  }

  if (!carrierReady && !internalMode && parsed?.warnings?.length) {
    // Non-internal modes should not include internal warnings in export body.
  }

  return {
    customerName: input.customerName,
    claimNumber: input.claimNumber,
    outputMode: input.output.outputMode,
    title: parsed?.title ?? "Generated output",
    watermark,
    sections,
    appendix,
    plainText: lines.join("\n").trim(),
  };
}
