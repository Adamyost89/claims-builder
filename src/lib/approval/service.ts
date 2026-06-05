import type { UserRole } from "@prisma/client";

import { logClaimEvent } from "@/lib/audit/log-event";
import { prisma } from "@/lib/db";
import { isMockCarrierOutputBlocked } from "@/lib/export/gate";
import { assertPermission, canApproveExport, canEditClaims } from "@/lib/rbac";

import type { ApprovedSectionRecord } from "./validation";
import {
  isApprovableDraft,
  parseContentSections,
  parseUnsupportedClaimsJson,
  validateSectionApprovals,
} from "./validation";

export async function getApprovalDrafts(claimId: string) {
  const [claim, drafts] = await Promise.all([
    prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        customerName: true,
        evidenceReviewedAt: true,
      },
    }),
    prisma.generatedOutput.findMany({
      where: { claimId, status: "DRAFT" },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!claim) {
    return null;
  }

  return {
    claim,
    drafts: drafts.map((draft) => ({
      ...draft,
      revisionIds: JSON.parse(draft.revisionIdsIncluded) as string[],
      unsupportedClaims: parseUnsupportedClaimsJson(draft.unsupportedClaimsJson),
      toneViolations: draft.toneLintViolations
        ? (JSON.parse(draft.toneLintViolations) as string[])
        : [],
      content: parseContentSections(draft.contentJson),
      approvable: isApprovableDraft(draft),
    })),
  };
}

export async function approveGeneratedOutput(input: {
  claimId: string;
  outputId: string;
  actorId: string;
  actorRole: UserRole;
  approvedSections: ApprovedSectionRecord[];
  finalApprovalConfirmed: boolean;
}) {
  assertPermission(canEditClaims(input.actorRole), "Viewers cannot approve output.");
  assertPermission(canApproveExport(input.actorRole), "Only managers or admins can approve output.");

  if (!input.finalApprovalConfirmed) {
    throw new Error(
      "Final approval confirmation is required: reviewed against evidence matrix.",
    );
  }

  const [claim, output] = await Promise.all([
    prisma.claim.findUnique({ where: { id: input.claimId } }),
    prisma.generatedOutput.findFirst({
      where: { id: input.outputId, claimId: input.claimId },
    }),
  ]);

  if (!claim) {
    throw new Error("Claim not found.");
  }
  if (!claim.evidenceReviewedAt) {
    throw new Error("Evidence must be reviewed before output approval.");
  }
  if (!output) {
    throw new Error("Generated output not found.");
  }
  if (output.status !== "DRAFT") {
    throw new Error("Only DRAFT outputs can be approved.");
  }
  if (!isApprovableDraft(output)) {
    throw new Error("Blocked drafts cannot be approved.");
  }
  if (isMockCarrierOutputBlocked({ output, claimIsDryRun: claim.isDryRun })) {
    throw new Error(
      "Mock-generated carrier-ready output cannot be approved unless the claim is a dry run.",
    );
  }

  const sectionCheck = validateSectionApprovals(output.contentJson, input.approvedSections);
  if (!sectionCheck.ok) {
    throw new Error(sectionCheck.message ?? "Section approval incomplete.");
  }

  const approved = await prisma.generatedOutput.update({
    where: { id: output.id },
    data: {
      status: "APPROVED",
      approvedById: input.actorId,
      approvedAt: new Date(),
      approvedSections: JSON.stringify(input.approvedSections),
    },
  });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "APPROVAL",
    payload: {
      outputId: approved.id,
      outputMode: approved.outputMode,
      version: approved.version,
      approvedSections: input.approvedSections,
      revisionIdsIncluded: JSON.parse(approved.revisionIdsIncluded),
    },
  });

  return approved;
}

export async function getOutputHistory(claimId: string) {
  const outputs = await prisma.generatedOutput.findMany({
    where: { claimId },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    include: {
      approvedBy: { select: { id: true, name: true, email: true } },
      exportedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return outputs.map((output) => ({
    ...output,
    revisionIds: JSON.parse(output.revisionIdsIncluded) as string[],
    unsupportedClaims: parseUnsupportedClaimsJson(output.unsupportedClaimsJson),
    content: parseContentSections(output.contentJson),
    approvable: output.status === "DRAFT" ? isApprovableDraft(output) : false,
    locked: output.status === "APPROVED" || output.status === "EXPORTED",
  }));
}

export async function deleteBlockedDraft(input: {
  claimId: string;
  outputId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  assertPermission(canApproveExport(input.actorRole), "Only managers or admins can delete drafts.");

  const output = await prisma.generatedOutput.findFirst({
    where: { id: input.outputId, claimId: input.claimId },
  });
  if (!output) {
    throw new Error("Generated output not found.");
  }
  if (output.status !== "DRAFT") {
    throw new Error("Only DRAFT outputs can be deleted.");
  }
  if (!output.generationBlocked) {
    throw new Error("Only blocked DRAFT outputs can be deleted.");
  }

  await prisma.generatedOutput.delete({ where: { id: output.id } });

  await logClaimEvent({
    claimId: input.claimId,
    actorId: input.actorId,
    eventType: "OUTPUT_DELETE",
    payload: {
      outputId: output.id,
      outputMode: output.outputMode,
      version: output.version,
      generationBlocked: true,
    },
  });
}
