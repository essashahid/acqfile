import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMockProvider } from "@/lib/llm/mock";
import { createOpenAiProvider } from "@/lib/llm/openai";
import { DOCUMENT_STEPS } from "@/lib/pipeline/process-document";
import { estimateCostUsd } from "@/lib/config";

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(tsx?|html)$/.test(file) ? [file] : [];
  });
}

describe("Phase 0 boundaries", () => {
  it("exposes only extraction and verification provider operations", () => {
    const provider = createMockProvider();
    expect(Object.keys(provider).sort()).toEqual(["extract", "models", "name", "verify"]);
    expect(DOCUMENT_STEPS).toEqual(["parse", "extract", "deterministic_validate", "independent_verify", "calculate_confidence", "route_review", "finalize"]);
    for (const route of ["ask", "rag"]) expect(fs.existsSync(`src/app/(app)/${route}`)).toBe(false);
  });

  it("requires independent live models and configured prices", () => {
    expect(() => createOpenAiProvider({ apiKey: "test-only", models: { extract: "same", verify: "same" } })).toThrow("different models");
    expect(estimateCostUsd("gpt-5.6-luna", 1_000_000, 1_000_000)).toBe(1.4);
    expect(estimateCostUsd("gpt-5.6-terra", 1_000_000, 1_000_000)).toBe(14);
    expect(() => estimateCostUsd("unconfigured", 1, 1)).toThrow("Configure token pricing");
  });

  it("keeps lending-decision language out of UI and generated report templates", () => {
    const banned = /\b(?:eligible|ineligible|qualifies|approved|compliant)\b|meets SBA requirements/i;
    const violations = ["src/app", "src/components", "src/lib/report"].flatMap(sources)
      .filter(file => banned.test(fs.readFileSync(file, "utf8")));
    expect(violations).toEqual([]);
  });
});
