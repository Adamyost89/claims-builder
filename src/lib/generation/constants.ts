import type { OutputMode } from "@prisma/client";

export const GENERATION_PROMPT_VERSION = "phase6-v1";

export const OUTPUT_MODE_OPTIONS: {
  value: OutputMode;
  label: string;
  description: string;
}[] = [
  {
    value: "FULL_SUPPLEMENT",
    label: "Full supplement",
    description: "Numbered sections with quantities, basis, and revision required language.",
  },
  {
    value: "CARRIER_REBUTTAL",
    label: "Carrier rebuttal",
    description: "Focused response to disputed included issues only.",
  },
  {
    value: "SHORT_REPLY",
    label: "Short reply",
    description: "Brief direct reply without full supplement structure.",
  },
  {
    value: "INTERNAL_AUDIT",
    label: "Internal audit",
    description: "Blockers, risks, missing evidence, and excluded items.",
  },
  {
    value: "SCOPE_COMPARISON",
    label: "Scope comparison",
    description: "Comparison-focused structured text.",
  },
  {
    value: "MISSING_EVIDENCE_CHECKLIST",
    label: "Missing evidence checklist",
    description: "Unresolved evidence items only.",
  },
];

export const CARRIER_READY_MODES = new Set<OutputMode>([
  "FULL_SUPPLEMENT",
  "CARRIER_REBUTTAL",
  "SHORT_REPLY",
  "SCOPE_COMPARISON",
]);

export const STATIC_BANNED_PHRASES = [
  "please consider",
  "we believe",
  "possibly",
  "may need",
  "appears",
  "recommend",
  "should be considered",
  "if possible",
  "in our opinion",
] as const;

export const TONE_STYLE_GUIDANCE = [
  "Use direct technical style.",
  "The approved scope is materially insufficient.",
  "Manufacturer compliant installation requires",
  "The approved estimate does not contain sufficient quantities",
  "Please revise the estimate as follows",
] as const;
