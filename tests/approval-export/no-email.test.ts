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

describe("phase 7 no-email guard", () => {
  it("does not add email sending or carrier submission code", () => {
    const roots = [
      join(process.cwd(), "src", "lib", "approval"),
      join(process.cwd(), "src", "lib", "export"),
      join(process.cwd(), "src", "components", "approval"),
      join(process.cwd(), "src", "components", "export"),
    ];
    const forbidden = [
      /sendEmail/i,
      /nodemailer/i,
      /carrierSubmission/i,
      /submitToCarrier/i,
      /openai/i,
    ];
    for (const root of roots) {
      const files = walk(root);
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        for (const pattern of forbidden) {
          expect(content).not.toMatch(pattern);
        }
      }
    }
  });
});
