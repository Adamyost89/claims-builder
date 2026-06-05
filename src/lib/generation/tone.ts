import { STATIC_BANNED_PHRASES } from "./constants";

export type ToneLintResult = {
  passed: boolean;
  violations: string[];
};

export function runToneLint(
  text: string,
  bannedPhrases: string[] = [...STATIC_BANNED_PHRASES],
): ToneLintResult {
  const normalized = text.toLowerCase();
  const violations: string[] = [];

  for (const phrase of bannedPhrases) {
    if (normalized.includes(phrase.toLowerCase())) {
      violations.push(phrase);
    }
  }

  return {
    passed: violations.length === 0,
    violations: [...new Set(violations)],
  };
}

export function runOutputToneLint(
  output: { sections: { body: string; heading: string }[]; title: string },
  bannedPhrases: string[],
): ToneLintResult {
  const combined = [
    output.title,
    ...output.sections.map((section) => `${section.heading}\n${section.body}`),
  ].join("\n");

  return runToneLint(combined, bannedPhrases);
}
