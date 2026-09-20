import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { estimateCostUsd } from "@/lib/config";
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(tsx?|html)$/.test(file) ? [file] : [];
  });
}
describe("product boundaries", () => {
  it("keeps lending-decision language out of authored UI strings (Guardrail 1, A29)", () => {
    const banned = /\b(?:eligible|ineligible|qualifies|approved|compliant)\b|meets SBA requirements/i;
    expect(["src/app", "src/components"].flatMap(sources).filter((file) => banned.test(fs.readFileSync(file, "utf8")))).toEqual([]);
  });
  it("requires independent live models and configured prices", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("OPENAI_EXTRACT_MODEL", "same");
    vi.stubEnv("OPENAI_VERIFY_MODEL", "same");
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const { createOpenAiExtractionProvider } = await import("@/lib/extract/openai");
    expect(() => createOpenAiExtractionProvider()).toThrow("different models");
    vi.unstubAllEnvs();
    resetEnvCache();
    expect(estimateCostUsd("gpt-5.6-luna", 1_000_000, 1_000_000)).toBe(1.4);
    expect(() => estimateCostUsd("unconfigured", 1, 1)).toThrow("Configure token pricing");
  });
  it("has no legacy report path left (A42)", () => {
    for (const gone of ["fixtures/legacy", "src/lib/llm", "src/lib/schema/report.ts", "src/lib/review", "src/lib/queries", "src/app/(app)/review", "src/app/(app)/upload"]) expect(fs.existsSync(gone), gone).toBe(false);
  });
});
