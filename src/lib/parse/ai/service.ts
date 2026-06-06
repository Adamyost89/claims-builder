import type { DocumentType } from "@prisma/client";

import type { ExtractedPage } from "@/lib/parsers/types";

import {
  isCarrierDocumentType,
  isMeasurementDocumentType,
} from "./fallback-policy";
import { mockExtractCarrierEstimate, mockExtractMeasurementReport } from "./mock";
import {
  aiCarrierExtractionSchema,
  aiMeasurementExtractionSchema,
  type AiCarrierExtraction,
  type AiMeasurementExtraction,
} from "./schemas";

function buildCarrierPrompt(pages: ExtractedPage[]): string {
  return JSON.stringify({
    task: "Extract carrier estimate line items from the document pages.",
    rules: [
      "Return strict JSON matching the carrier extraction schema.",
      "Do not invent quantities, line items, codes, or prices.",
      "Every extracted value must include exact sourceText copied from the document.",
      "If source text cannot be quoted exactly, return null for that field.",
      "action must be one of: tear_out, replace, install, detach_reset, supply, or null.",
      "Only populate suggestedWastePct when explicitly labeled as suggested.",
    ],
    pages,
  });
}

function buildMeasurementPrompt(pages: ExtractedPage[]): string {
  return JSON.stringify({
    task: "Extract measurement report values from the document pages.",
    rules: [
      "Return strict JSON matching the measurement extraction schema.",
      "Do not invent measurements.",
      "Every value must include exact sourceText copied from the document.",
      "Only populate suggestedWastePct when waste is explicitly labeled suggested.",
      "Do not choose 0% waste from a table unless it is explicitly labeled as suggested.",
    ],
    pages,
  });
}

async function callOpenAiJson<T>(input: {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_PARSE_MODEL?.trim() || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI parse extraction failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty parse content.");
  }

  return JSON.parse(content) as T;
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function shouldUseMockAiParse(): boolean {
  if (process.env.AI_PARSE_FORCE_MOCK === "true") {
    return true;
  }
  if (isProductionRuntime()) {
    return false;
  }
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return process.env.NODE_ENV === "development";
  }
  return false;
}

export async function extractCarrierWithAi(
  pages: ExtractedPage[],
): Promise<AiCarrierExtraction | null> {
  if (shouldUseMockAiParse()) {
    return mockExtractCarrierEstimate(pages);
  }

  const raw = await callOpenAiJson<unknown>({
    systemPrompt:
      "You extract carrier estimate line items. Never invent data. Quote exact sourceText for every value.",
    userPrompt: buildCarrierPrompt(pages),
    schemaName: "carrier_extraction",
  });

  return aiCarrierExtractionSchema.parse(raw);
}

export async function extractMeasurementWithAi(
  pages: ExtractedPage[],
): Promise<AiMeasurementExtraction | null> {
  if (shouldUseMockAiParse()) {
    return mockExtractMeasurementReport(pages);
  }

  const raw = await callOpenAiJson<unknown>({
    systemPrompt:
      "You extract roof measurement report values. Never invent data. Quote exact sourceText for every value.",
    userPrompt: buildMeasurementPrompt(pages),
    schemaName: "measurement_extraction",
  });

  return aiMeasurementExtractionSchema.parse(raw);
}

export async function runAiExtraction(input: {
  documentType: DocumentType;
  pages: ExtractedPage[];
}): Promise<AiCarrierExtraction | AiMeasurementExtraction | null> {
  if (isCarrierDocumentType(input.documentType)) {
    return extractCarrierWithAi(input.pages);
  }
  if (isMeasurementDocumentType(input.documentType)) {
    return extractMeasurementWithAi(input.pages);
  }
  return null;
}
