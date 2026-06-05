import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AUDIT_EXPECTATIONS: {
  action: string;
  file: string;
  event: string;
  altEvent?: string;
}[] = [
  { action: "upload", file: "src/lib/documents/service.ts", event: "UPLOAD" },
  { action: "delete", file: "src/lib/documents/service.ts", event: "DOCUMENT_DELETE" },
  { action: "parse", file: "src/lib/parse/service.ts", event: "PARSE" },
  { action: "manual edit", file: "src/lib/parse/review.ts", event: "MANUAL_EDIT" },
  { action: "issue detect", file: "src/lib/issues/service.ts", event: "ISSUE_DETECTION_RUN" },
  { action: "evidence link", file: "src/lib/evidence/service.ts", event: "EVIDENCE_LINK" },
  { action: "evidence unlink", file: "src/lib/evidence/service.ts", event: "EVIDENCE_UNLINK" },
  { action: "evidence override", file: "src/lib/evidence/service.ts", event: "OVERRIDE" },
  {
    action: "generation",
    file: "src/lib/generation/service.ts",
    event: "GENERATE",
    altEvent: "TONE_LINT_FAIL",
  },
  { action: "approval", file: "src/lib/approval/service.ts", event: "APPROVAL" },
  { action: "export", file: "src/lib/export/service.ts", event: "EXPORT" },
  {
    action: "export blocked",
    file: "src/lib/export/service.ts",
    event: "EXPORT_BLOCKED",
  },
  { action: "dry-run review", file: "src/lib/production/service.ts", event: "DRY_RUN_REVIEW" },
  { action: "production override", file: "src/lib/production/service.ts", event: "PRODUCTION_OVERRIDE" },
  {
    action: "production override revoke",
    file: "src/lib/production/service.ts",
    event: "PRODUCTION_OVERRIDE_REVOKE",
  },
];

describe("audit integrity coverage", () => {
  for (const { action, file, event, altEvent } of AUDIT_EXPECTATIONS) {
    it(`logs ${event} for ${action}`, () => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const logged =
        source.includes(`eventType: "${event}"`) ||
        (altEvent ? source.includes(`eventType: "${altEvent}"`) : false) ||
        source.includes(`"${event}"`) ||
        (altEvent ? source.includes(`"${altEvent}"`) : false);
      expect(logged).toBe(true);
    });
  }
});
