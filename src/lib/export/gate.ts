import type { GeneratedOutput, OutputMode } from "@prisma/client";

import { parseUnsupportedClaimsJson } from "@/lib/approval/validation";
import { CARRIER_READY_MODES } from "@/lib/generation/constants";
import { assertCarrierReadyOutputAllowed } from "@/lib/production/readiness";

import { DRY_RUN_WATERMARK, INTERNAL_OUTPUT_MODES } from "./constants";

export type ExportGateResult = {
  allowed: boolean;
  blockers: string[];
  watermarked: boolean;
  watermark: string | null;
  isReExport: boolean;
};

export function isExportableOutputStatus(status: GeneratedOutput["status"]): boolean {
  return status === "APPROVED" || status === "EXPORTED";
}

export function isMockCarrierOutputBlocked(input: {
  output: GeneratedOutput;
  claimIsDryRun: boolean;
}): boolean {
  if (!input.output.isMockGeneration) {
    return false;
  }
  if (input.claimIsDryRun) {
    return false;
  }
  return CARRIER_READY_MODES.has(input.output.outputMode);
}

export function isExportReadyOutput(output: GeneratedOutput): boolean {
  if (!isExportableOutputStatus(output.status)) {
    return false;
  }
  if (output.generationBlocked) {
    return false;
  }
  if (!output.toneLintPassed) {
    return false;
  }
  const unsupported = parseUnsupportedClaimsJson(output.unsupportedClaimsJson);
  return unsupported.length === 0;
}

export async function evaluateExportGate(input: {
  output: GeneratedOutput;
  claimEvidenceReviewedAt: Date | null;
  claimIsDryRun: boolean;
}): Promise<ExportGateResult> {
  const blockers: string[] = [];
  const isReExport = input.output.status === "EXPORTED";

  if (!input.claimEvidenceReviewedAt) {
    blockers.push("Evidence validation must be reviewed before export.");
  }

  if (!isExportReadyOutput(input.output)) {
    if (!isExportableOutputStatus(input.output.status)) {
      blockers.push("Output must be manually approved before export.");
    }
    if (input.output.generationBlocked) {
      blockers.push("Output is blocked and cannot be exported.");
    }
    if (!input.output.toneLintPassed) {
      blockers.push("Tone lint must pass before export.");
    }
    const unsupported = parseUnsupportedClaimsJson(input.output.unsupportedClaimsJson);
    if (unsupported.length > 0) {
      blockers.push("Unsupported claims must be empty before export.");
    }
  }

  if (isMockCarrierOutputBlocked(input)) {
    blockers.push(
      "Mock-generated carrier-ready output cannot be exported unless the claim is a dry run.",
    );
  }

  const carrierReady = CARRIER_READY_MODES.has(input.output.outputMode);
  let watermarked = false;
  let watermark: string | null = null;

  if (carrierReady) {
    try {
      const carrierGuard = await assertCarrierReadyOutputAllowed({
        claimIsDryRun: input.claimIsDryRun,
      });
      if (carrierGuard.watermarked) {
        watermarked = true;
        watermark = DRY_RUN_WATERMARK;
      }
    } catch (error) {
      blockers.push(
        error instanceof Error
          ? error.message
          : "Carrier-ready export blocked by production guard.",
      );
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    watermarked,
    watermark,
    isReExport,
  };
}

export async function assertExportAllowed(input: {
  output: GeneratedOutput;
  claimEvidenceReviewedAt: Date | null;
  claimIsDryRun: boolean;
}): Promise<ExportGateResult> {
  const result = await evaluateExportGate(input);
  if (!result.allowed) {
    throw new Error(result.blockers.join(" "));
  }
  return result;
}

export function isCarrierReadyMode(mode: OutputMode): boolean {
  return CARRIER_READY_MODES.has(mode);
}

export function isInternalOutputMode(mode: OutputMode): boolean {
  return INTERNAL_OUTPUT_MODES.has(mode);
}

/** Internal-mode approvals do not satisfy carrier-ready export readiness. */
export function canSatisfyCarrierExportReadiness(output: GeneratedOutput): boolean {
  if (isInternalOutputMode(output.outputMode)) {
    return false;
  }
  return isCarrierReadyMode(output.outputMode) && isExportReadyOutput(output);
}
