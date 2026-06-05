import type { IssueDetectionContext } from "./context";
import { detectComparisonIssues } from "./comparison-detectors";
import { detectHardRules } from "./hard-rules";
import type { RevisionDraft } from "./types";

export function runIssueDetectionEngine(ctx: IssueDetectionContext): RevisionDraft[] {
  const byKey = new Map<string, RevisionDraft>();

  for (const draft of [...detectHardRules(ctx), ...detectComparisonIssues(ctx)]) {
    if (!byKey.has(draft.detectionKey)) {
      byKey.set(draft.detectionKey, draft);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.title.localeCompare(b.title),
  );
}
