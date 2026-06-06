import { ParserType } from "@prisma/client";
import type {
  ParsedField,
  ParsedLineItem,
  ParsedMeasurement,
  ParseResult,
} from "@/lib/parsers/types";
import { buildProvenance } from "@/lib/parsers/types";

import type {
  AiCarrierExtraction,
  AiCarrierLineItem,
  AiMeasurementExtraction,
} from "./schemas";
import { findSourcePage, sourceTextExistsInDocument } from "./source-text";

export type BlockedAiExtraction = {
  fieldName: string;
  reason: string;
  confidence: number;
  sourceText?: string | null;
};

export type AiConversionResult = {
  lineItems: ParsedLineItem[];
  measurements: ParsedMeasurement[];
  fields: ParsedField[];
  blocked: BlockedAiExtraction[];
  warnings: string[];
};

function lineItemFromAi(
  item: AiCarrierLineItem,
  documentId: string,
  pages: { pageNumber: number; text: string }[],
  fullText: string,
): { lineItem?: ParsedLineItem; fields: ParsedField[]; blocked?: BlockedAiExtraction } {
  if (!item.sourceText || !sourceTextExistsInDocument(pages, fullText, item.sourceText)) {
    return {
      fields: [],
      blocked: {
        fieldName: `line_item:${item.description}`,
        reason: "AI extraction blocked: source text not found in document.",
        confidence: item.confidence,
        sourceText: item.sourceText ?? null,
      },
    };
  }

  if (item.quantity === null || item.unit === null) {
    return {
      fields: [],
      blocked: {
        fieldName: `line_item:${item.description}`,
        reason: "AI extraction blocked: quantity or unit missing from source.",
        confidence: item.confidence,
        sourceText: item.sourceText,
      },
    };
  }

  const sourcePage = findSourcePage(pages, item.sourceText) ?? item.sourcePage;
  const extraFields: ParsedField[] = [];

  const pushField = (fieldName: string, value: string | number, confidence: number) => {
    extraFields.push({
      fieldName,
      provenance: buildProvenance({
        value,
        documentId,
        sourcePage,
        sourceText: item.sourceText,
        confidence,
        method: "LLM",
      }),
    });
  };

  if (item.lineNumber !== null) {
    pushField(`line_item:${item.lineNumber}:line_number`, item.lineNumber, item.confidence);
  }
  if (item.action) {
    pushField(`line_item:${item.lineNumber ?? item.description}:action`, item.action, item.confidence);
  }
  if (item.replacementCost !== null) {
    pushField(
      `line_item:${item.lineNumber ?? item.description}:replacement_cost`,
      item.replacementCost,
      item.confidence,
    );
  }
  if (item.depreciation !== null) {
    pushField(
      `line_item:${item.lineNumber ?? item.description}:depreciation`,
      item.depreciation,
      item.confidence,
    );
  }
  if (item.acv !== null) {
    pushField(`line_item:${item.lineNumber ?? item.description}:acv`, item.acv, item.confidence);
  }

  const total =
    item.replacementCost ??
    (item.unitPrice !== null ? item.quantity * item.unitPrice : undefined);

  return {
    lineItem: {
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice ?? undefined,
      total,
      lineCode: item.lineNumber !== null ? String(item.lineNumber) : undefined,
      category: inferCategory(item.description, item.action),
      provenance: buildProvenance({
        value: item.quantity,
        documentId,
        sourcePage,
        sourceText: item.sourceText,
        confidence: item.confidence,
        method: "LLM",
      }),
    },
    fields: extraFields,
  };
}

function inferCategory(description: string, action: string | null): string {
  const lower = description.toLowerCase();
  if (action === "tear_out" || action === "replace" || action === "install") {
    if (lower.includes("shingle") || lower.includes("roof")) {
      return "ROOFING";
    }
  }
  if (lower.includes("shingle") || lower.includes("roof")) {
    return "ROOFING";
  }
  if (lower.includes("drip") || lower.includes("starter") || lower.includes("ridge")) {
    return "ROOFING_ACCESSORY";
  }
  return "GENERAL";
}

type MeasurementSpec = {
  key: string;
  unit: string;
  value: number;
  sourcePage: number;
  sourceText: string;
  confidence: number;
};

function measurementSpecsFromAi(
  extraction: AiMeasurementExtraction,
): MeasurementSpec[] {
  return extraction.fields.map((field) => ({
    key: field.key,
    unit: field.unit,
    value: field.value,
    sourcePage: field.sourcePage,
    sourceText: field.sourceText,
    confidence: field.confidence,
  }));
}

function measurementFromSpec(
  spec: MeasurementSpec,
  documentId: string,
  pages: { pageNumber: number; text: string }[],
  fullText: string,
): { measurement?: ParsedMeasurement; blocked?: BlockedAiExtraction } {
  if (!spec.sourceText || !sourceTextExistsInDocument(pages, fullText, spec.sourceText)) {
    return {
      blocked: {
        fieldName: spec.key,
        reason: "AI extraction blocked: source text not found in document.",
        confidence: spec.confidence,
        sourceText: spec.sourceText,
      },
    };
  }

  const sourcePage = findSourcePage(pages, spec.sourceText) ?? spec.sourcePage;

  return {
    measurement: {
      key: spec.key,
      value: spec.value,
      unit: spec.unit,
      provenance: buildProvenance({
        value: spec.value,
        documentId,
        sourcePage,
        sourceText: spec.sourceText,
        confidence: spec.confidence,
        method: "LLM",
      }),
    },
  };
}

export function convertCarrierAiExtraction(input: {
  extraction: AiCarrierExtraction;
  documentId: string;
  pages: { pageNumber: number; text: string }[];
  fullText: string;
}): AiConversionResult {
  const lineItems: ParsedLineItem[] = [];
  const fields: ParsedField[] = [];
  const blocked: BlockedAiExtraction[] = [];

  for (const item of input.extraction.lineItems) {
    const converted = lineItemFromAi(item, input.documentId, input.pages, input.fullText);
    if (converted.blocked) {
      blocked.push(converted.blocked);
      continue;
    }
    if (converted.lineItem) {
      lineItems.push(converted.lineItem);
    }
    fields.push(...converted.fields);
  }

  return {
    lineItems,
    measurements: [],
    fields,
    blocked,
    warnings: input.extraction.warnings,
  };
}

export function convertMeasurementAiExtraction(input: {
  extraction: AiMeasurementExtraction;
  documentId: string;
  pages: { pageNumber: number; text: string }[];
  fullText: string;
}): AiConversionResult {
  const measurements: ParsedMeasurement[] = [];
  const fields: ParsedField[] = [];
  const blocked: BlockedAiExtraction[] = [];

  for (const spec of measurementSpecsFromAi(input.extraction)) {
    const converted = measurementFromSpec(
      spec,
      input.documentId,
      input.pages,
      input.fullText,
    );
    if (converted.blocked) {
      blocked.push(converted.blocked);
      continue;
    }
    if (converted.measurement) {
      measurements.push(converted.measurement);
    }
  }

  if (input.extraction.predominantPitch) {
    const pitchText = input.extraction.predominantPitch;
    if (sourceTextExistsInDocument(input.pages, input.fullText, pitchText)) {
      fields.push({
        fieldName: "predominant_pitch",
        provenance: buildProvenance({
          value: pitchText,
          documentId: input.documentId,
          sourcePage: findSourcePage(input.pages, pitchText),
          sourceText: pitchText,
          confidence: 0.85,
          method: "LLM",
        }),
      });
    } else {
      blocked.push({
        fieldName: "predominant_pitch",
        reason: "AI extraction blocked: source text not found in document.",
        confidence: 0.85,
        sourceText: pitchText,
      });
    }
  }

  if (input.extraction.vendor) {
    fields.push({
      fieldName: "measurement_vendor",
      provenance: buildProvenance({
        value: input.extraction.vendor,
        documentId: input.documentId,
        sourcePage: 1,
        sourceText: input.extraction.vendor,
        confidence: 0.9,
        method: "LLM",
      }),
    });
  }

  return {
    lineItems: [],
    measurements,
    fields,
    blocked,
    warnings: input.extraction.warnings,
  };
}

export function mergeAiIntoParseResult(input: {
  heuristic: ParseResult;
  ai: AiConversionResult;
  replaceLineItems: boolean;
  supplementMeasurements: boolean;
}): ParseResult {
  const lineItems = input.replaceLineItems
    ? input.ai.lineItems
    : [...input.heuristic.lineItems, ...input.ai.lineItems];

  let measurements = input.heuristic.measurements;
  if (input.supplementMeasurements && input.ai.measurements.length > 0) {
    const existingKeys = new Set(measurements.map((m) => m.key));
    const merged = [...measurements];
    for (const m of input.ai.measurements) {
      if (!existingKeys.has(m.key)) {
        merged.push(m);
        existingKeys.add(m.key);
      }
    }
    measurements = merged;
  } else if (input.ai.measurements.length > 0 && measurements.length === 0) {
    measurements = input.ai.measurements;
  }

  const allItems = [...lineItems, ...measurements];
  const overallConfidence =
    allItems.length > 0
      ? allItems.reduce((sum, item) => sum + item.provenance.confidence, 0) / allItems.length
      : input.heuristic.overallConfidence;

  return {
    parserType: input.heuristic.parserType,
    lineItems,
    measurements,
    fields: [...input.heuristic.fields, ...input.ai.fields],
    overallConfidence,
    warnings: [
      ...input.heuristic.warnings,
      ...input.ai.warnings,
      ...(input.ai.lineItems.length > 0 || input.ai.measurements.length > 0
        ? ["AI-assisted extraction applied; all values require human review."]
        : []),
    ],
  };
}

export function buildEmptyAiParseResult(parserType: ParserType): ParseResult {
  return {
    parserType,
    lineItems: [],
    measurements: [],
    fields: [],
    overallConfidence: 0,
    warnings: [],
  };
}
