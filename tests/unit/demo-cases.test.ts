import fs from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_CASES, demoCase, demoCode } from "@/lib/demo/registry";
import { demoAllowed } from "@/lib/demo/access";
import { preparedDemoFiles } from "@/lib/demo/prepared";
import { cleanDemo, casePlan } from "../../fixtures/demo/plans";
import type { SessionContext } from "@/lib/workspace";
const ctx = {
  user: { id: "staff" },
  workspace: { workspaceId: "sample", role: "admin" },
} as SessionContext;
afterEach(() => vi.unstubAllEnvs());
it("lists exactly the eight cases with distinct IDs and coherent shared source arithmetic", () => {
  expect(DEMO_CASES.map((c) => c.id)).toEqual([
    "D01",
    "D02",
    "D03",
    "D04",
    "D05",
    "D06",
    "D07",
    "D08",
  ]);
  expect(new Set(DEMO_CASES.map((c) => demoCode(c.id))).size).toBe(8);
  expect(() => demoCase("deal-a")).toThrow();
  const p = cleanDemo();
  expect(p.model.loan + p.model.cash + p.model.note).toBe(p.model.project);
  expect(p.model.price + 100000).toBe(p.model.project);
  expect(p.ownership.map((o) => o.percent)).toEqual([60, 40]);
  expect(p.as_of).toBe("2026-09-15");
  for (const c of DEMO_CASES) {
    const manifest = JSON.parse(
      fs.readFileSync(`fixtures/demo/generated/${c.id}/manifest.json`, "utf8"),
    );
    expect(manifest.files.length).toBeGreaterThan(30);
    expect(manifest.draft.as_of).toBe(p.as_of);
  }
});
it("requires explicit sample mode, real-data false, configured workspace and staff, on the server", () => {
  vi.stubEnv("ACQFILE_SAMPLE_MODE", "true");
  vi.stubEnv("REAL_DATA_MODE", "false");
  vi.stubEnv("DEMO_CASE_WORKSPACE_ID", "sample");
  expect(demoAllowed(ctx)).toBe(true);
  for (const role of ["adviser", "viewer"])
    expect(demoAllowed({ ...ctx, workspace: { ...ctx.workspace, role } } as SessionContext)).toBe(
      false,
    );
  expect(demoAllowed({ ...ctx, isPublic: true })).toBe(false);
  expect(demoAllowed({ ...ctx, workspace: { ...ctx.workspace, workspaceId: "other" } })).toBe(
    false,
  );
  for (const [key, value] of [
    ["REAL_DATA_MODE", "true"],
    ["ACQFILE_SAMPLE_MODE", "false"],
    ["DEMO_CASE_WORKSPACE_ID", ""],
  ]) {
    vi.stubEnv(key!, value!);
    expect(demoAllowed(ctx)).toBe(false);
    vi.stubEnv(
      key!,
      key === "DEMO_CASE_WORKSPACE_ID" ? "sample" : key === "REAL_DATA_MODE" ? "false" : "true",
    );
  }
});
it("keeps corrections out of initial arrivals and expected outcomes out of prepared candidates", () => {
  for (const c of DEMO_CASES) {
    const plan = casePlan(c.id);
    for (const d of plan.documents.filter((d) => d.path.startsWith("corrections/")))
      expect(d.batch).toBeGreaterThan(1);
  }
  vi.stubEnv("ACQFILE_SAMPLE_MODE", "true");
  vi.stubEnv("REAL_DATA_MODE", "false");
  const candidates = preparedDemoFiles();
  expect(candidates.length).toBeGreaterThan(30);
  expect(JSON.stringify(candidates)).not.toMatch(/expected_findings|expected_checklist|U01/);
  vi.stubEnv("REAL_DATA_MODE", "true");
  expect(preparedDemoFiles()).toEqual([]);
});
it("U01 uses real parsing and generic fallback, with no prepared answer-key record", async () => {
  vi.stubEnv("ACQFILE_SAMPLE_MODE", "true");
  vi.stubEnv("REAL_DATA_MODE", "false");
  const { parseArrival } = await import("@/lib/deals/parse");
  const { SAMPLE_HMAC_KEY } = await import("@/lib/config/sample");
  const { createHash } = await import("node:crypto");
  const candidates = preparedDemoFiles() as { hash: string }[];
  for (const file of ["signed-copy.pdf", "tax-copy.pdf", "IMG_042.pdf", "book2.xlsx"]) {
    const bytes = fs.readFileSync(`fixtures/holdout/U01/${file}`);
    expect(
      candidates.some((c) => c.hash === createHash("sha256").update(bytes).digest("hex")),
    ).toBe(false);
    const parsed = await parseArrival(bytes, SAMPLE_HMAC_KEY);
    expect(parsed.status).toBe("parsed");
    if (file === "IMG_042.pdf") expect(parsed.blocks.some((b) => b.image_only)).toBe(true);
    if (file === "book2.xlsx")
      expect(parsed.blocks.map((b) => b.text).join(" ")).toContain("805000");
  }
});
