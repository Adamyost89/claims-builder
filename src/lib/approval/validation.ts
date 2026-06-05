import type { GeneratedOutput } from "@prisma/client";

import { isValidGenerationDraft } from "@/lib/generation/unsupported-claims";
import type { UnsupportedClaim } from "@/lib/generation/schemas";

export function parseUnsupportedClaimsJson(json: string): UnsupportedClaim[] {
  try {
    const parsed = JSON.parse(json) as UnsupportedClaim[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isApprovableDraft(output: GeneratedOutput): boolean {
  if (output.status !== "DRAFT") {
    return false;
  }

  const unsupportedClaims = parseUnsupportedClaimsJson(output.unsupportedClaimsJson);
  return isValidGenerationDraft({
    generationBlocked: output.generationBlocked,
    toneLintPassed: output.toneLintPassed,
    unsupportedClaims,
  });
}

export type ApprovedSectionRecord = {
  revisionItemId: string;
  heading: string;
  approved: boolean;
};

export function parseContentSections(contentJson: string | null): {
  title: string;
  sections: { revisionItemId: string; heading: string; body: string }[];
} {
  if (!contentJson) {
    return { title: "", sections: [] };
  }
  const parsed = JSON.parse(contentJson) as {
    title?: string;
    sections?: { revisionItemId: string; heading: string; body: string }[];
  };
  return {
    title: parsed.title ?? "",
    sections: parsed.sections ?? [],
  };
}

export function validateSectionApprovals(
  contentJson: string | null,
  approvedSections: ApprovedSectionRecord[],
): { ok: boolean; message?: string } {
  const content = parseContentSections(contentJson);
  if (content.sections.length === 0) {
    return { ok: false, message: "Output has no sections to approve." };
  }

  const approvedIds = new Set(
    approvedSections.filter((section) => section.approved).map((s) => s.revisionItemId),
  );

  for (const section of content.sections) {
    if (!approvedIds.has(section.revisionItemId)) {
      return {
        ok: false,
        message: `Section "${section.heading}" must be individually approved.`,
      };
    }
  }

  return { ok: true };
}
