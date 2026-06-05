import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

describe("phase 4 no-ai guard", () => {
  it("does not add OpenAI or generation code in issues module", () => {
    const root = join(process.cwd(), "src", "lib", "issues");
    const files = walk(root);
    const forbidden = [/openai/i, /GeneratedOutput/, /generateOutput/];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
