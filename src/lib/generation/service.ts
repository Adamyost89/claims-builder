import type { OutputMode, UserRole } from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import { assertPermission, canEditClaims } from "@/lib/rbac";

import { GENERATION_PROMPT_VERSION } from "./constants";
import { generateMockOutput } from "./mock";
import { generateWithOpenAI } from "./openai";
import { buildGenerationPayload } from "./payload";
import type { GenerationInput, GenerationOutput } from "./schemas";
import { generationOutputSchema } from "./schemas";
import { runOutputToneLint } from "./tone";
import { detectUnsupportedClaims, isValidGenerationDraft } from "./unsupported-claims";

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function shouldUseMockGeneration(): boolean {
  if (isProductionRuntime()) {
    return false;
  }
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    return false;
  }
  return false;
}

export function renderGenerationText(output: GenerationOutput): string {
  const lines = [output.title, ""];
  for (const section of output.sections) {
    lines.push(section.heading);
    lines.push(section.body);
    lines.push("");
  }
  if (output.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of output.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join("\n").trim();
}

export async function validateAndFinalizeOutput(
  rawOutput: GenerationOutput,
  payload: GenerationInput,
): Promise<{
  output: GenerationOutput;
  toneLintPassed: boolean;
  toneLintViolations: string[];
  unsupportedClaims: GenerationOutput["unsupportedClaims"];
  generationBlocked: boolean;
}> {
  const parsed = generationOutputSchema.parse(rawOutput);
  const toneLint = runOutputToneLint(parsed, payload.bannedPhrases);
  const unsupportedClaims = detectUnsupportedClaims(parsed, payload);

  const output: GenerationOutput = {
    ...parsed,
    unsupportedClaims,
    toneLintPassed: toneLint.passed,
    warnings: [
      ...parsed.warnings,
      ...toneLint.violations.map((phrase) => `Banned phrase detected: ${phrase}`),
      ...unsupportedClaims.map((claim) => claim.message),
    ],
  };

  const generationBlocked = unsupportedClaims.length > 0 || !toneLint.passed;

  return {
    output,
    toneLintPassed: toneLint.passed,
    toneLintViolations: toneLint.violations,
    unsupportedClaims,
    generationBlocked,
  };
}

async function runModelGeneration(
  payload: GenerationInput,
): Promise<{ output: GenerationOutput; model: string; isMock: boolean }> {
  if (shouldUseMockGeneration()) {
    return {
      output: generateMockOutput(payload),
      model: "mock-deterministic",
      isMock: true,
    };
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const output = await generateWithOpenAI(payload, model);
  return { output, model, isMock: false };
}

export async function getGenerationPreview(claimId: string, outputMode: OutputMode) {
  const payload = await buildGenerationPayload(claimId, outputMode);
  return {
    payload,
    exportEligibleCount: payload.exportEligibleRevisions.length,
    excludedCount: payload.excludedRevisions.length,
    unresolvedCount: payload.unresolvedRevisions.length,
  };
}

export async function runClaimGeneration(input: {
  claimId: string;
  outputMode: OutputMode;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot generate output.");

  if (!shouldUseMockGeneration() && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for generation outside development/test.");
  }

  const payload = await buildGenerationPayload(input.claimId, input.outputMode);
  const { output: rawOutput, model, isMock } = await runModelGeneration(payload);
  const finalized = await validateAndFinalizeOutput(rawOutput, payload);

  const revisionIdsIncluded = payload.exportEligibleRevisions.map(
    (revision) => revision.revisionItemId,
  );

  const latestVersion = await prisma.generatedOutput.aggregate({
    where: { claimId: input.claimId },
    _max: { version: true },
  });
  const nextVersion = (latestVersion._max.version ?? 0) + 1;

  const saved = await prisma.generatedOutput.create({
    data: {
      claimId: input.claimId,
      outputMode: input.outputMode,
      status: "DRAFT",
      version: nextVersion,
      contentJson: JSON.stringify(finalized.output),
      contentText: renderGenerationText(finalized.output),
      model,
      promptVersion: GENERATION_PROMPT_VERSION,
      toneLintPassed: finalized.toneLintPassed,
      toneLintViolations:
        finalized.toneLintViolations.length > 0
          ? JSON.stringify(finalized.toneLintViolations)
          : null,
      unsupportedClaimsJson: JSON.stringify(finalized.unsupportedClaims),
      generationBlocked: finalized.generationBlocked,
      isMockGeneration: isMock,
      revisionIdsIncluded: JSON.stringify(revisionIdsIncluded),
    },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: finalized.generationBlocked ? "TONE_LINT_FAIL" : "GENERATE",
    payload: {
      outputId: saved.id,
      outputMode: input.outputMode,
      generationBlocked: finalized.generationBlocked,
      unsupportedClaimCount: finalized.unsupportedClaims.length,
      toneLintPassed: finalized.toneLintPassed,
      isMockGeneration: isMock,
      model,
      promptVersion: GENERATION_PROMPT_VERSION,
    },
  });

  return {
    output: saved,
    generation: finalized.output,
    payload,
    validDraft: isValidGenerationDraft({
      generationBlocked: finalized.generationBlocked,
      toneLintPassed: finalized.toneLintPassed,
      unsupportedClaims: finalized.unsupportedClaims,
    }),
  };
}

export async function getLatestGeneratedDraft(claimId: string) {
  return prisma.generatedOutput.findFirst({
    where: { claimId },
    orderBy: { createdAt: "desc" },
  });
}

export { isValidGenerationDraft };
