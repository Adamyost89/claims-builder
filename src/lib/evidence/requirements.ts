import type { IssueCategory, RuleAuthority } from "@prisma/client";
import { EvidenceType } from "@prisma/client";

import type { EvidenceRequirementSpec } from "./types";

export function getCategoryEvidenceRequirements(input: {
  category: IssueCategory;
  ruleId?: string | null;
  ruleAuthority?: RuleAuthority | null;
}): EvidenceRequirementSpec {
  switch (input.category) {
    case "OMITTED_ITEM":
      return { groups: [[EvidenceType.MEASUREMENT, EvidenceType.CARRIER_INCONSISTENCY]] };
    case "MEASUREMENT_DEFICIENCY":
      return { groups: [[EvidenceType.MEASUREMENT]] };
    case "ESTIMATE_INCONSISTENCY":
      return { groups: [[EvidenceType.CARRIER_INCONSISTENCY]] };
    case "CODE_MANUFACTURER":
      return { groups: [[EvidenceType.CODE, EvidenceType.MANUFACTURER]] };
    case "INSTALLATION_INSUFFICIENCY":
      if (input.ruleId) {
        return {
          groups: [
            [EvidenceType.MEASUREMENT],
            [EvidenceType.CODE, EvidenceType.MANUFACTURER],
          ],
        };
      }
      return { groups: [[EvidenceType.MEASUREMENT]] };
    default:
      return { groups: [[EvidenceType.MEASUREMENT]] };
  }
}

export function getEffectiveRequiredEvidenceTypes(input: {
  category: IssueCategory;
  storedTypes: string[];
  ruleId?: string | null;
}): string[] {
  if (input.storedTypes.length > 0) {
    return input.storedTypes;
  }
  const spec = getCategoryEvidenceRequirements({
    category: input.category,
    ruleId: input.ruleId,
  });
  return [...new Set(spec.groups.flat())];
}

export function flattenRequirementGroups(spec: EvidenceRequirementSpec): string[] {
  return [...new Set(spec.groups.flat())];
}
