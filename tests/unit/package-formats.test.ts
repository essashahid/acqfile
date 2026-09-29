import { describe, expect, it } from "vitest";
import fs from "node:fs";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { packageReport, packageWorkbook } from "@/lib/deliverables/package";
import { packageReportV1, packageWorkbookV1 } from "@/lib/deliverables/package-v1";
import { packageReportV2, packageWorkbookV2 } from "@/lib/deliverables/package-v2";
import type { SnapshotContent, SnapshotDiff } from "@/lib/deliverables/snapshot";

/** Two real versions, frozen as created: VCS-2026-014 (before formats existed) and VCS-2026-015
 * (format 2, the version shown in the explainer). The hashes are those of the report and
 * workbook inside the ZIPs actually downloaded for them. */
const load = (name: string) =>
  JSON.parse(
    zlib.gunzipSync(fs.readFileSync(`tests/fixtures/package/${name}.json.gz`)).toString(),
  ) as { content: SnapshotContent; diff: SnapshotDiff };
const hash = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

const GOLDEN = {
  "format-1": {
    report: "8b4bcf2304515e7a6d1c471cb3f29373c4b0b2f2d78d9d25570a00f216555021",
    workbook: "f317e6bd32cad87b513b0995cc3b4307735040176e704cfa81959f8720fb2730",
  },
  "format-2": {
    report: "401684d51d00659606b5fd67c009eb9fd601eb63068dd0b29b3e4c2b8e913002",
    workbook: "e574c9bc15a3bc96f1c68585f715420b6cbc1f38f2d5b676831570e1b86bdf20",
  },
};

describe("versions created in an earlier format download with their original bytes", () => {
  it("format 1 (no format recorded)", () => {
    const { content, diff } = load("format-1");
    expect(content.format).toBeUndefined();
    expect(hash(packageReport(content, diff))).toBe(GOLDEN["format-1"].report);
    expect(hash(packageWorkbook(content, diff))).toBe(GOLDEN["format-1"].workbook);
    expect(hash(packageReportV1(content, diff))).toBe(GOLDEN["format-1"].report);
    expect(hash(packageWorkbookV1(content, diff))).toBe(GOLDEN["format-1"].workbook);
  });

  it("format 2", () => {
    const { content, diff } = load("format-2");
    expect(content.format).toBe(2);
    expect(hash(packageReport(content, diff))).toBe(GOLDEN["format-2"].report);
    expect(hash(packageWorkbook(content, diff))).toBe(GOLDEN["format-2"].workbook);
    expect(hash(packageReportV2(content, diff))).toBe(GOLDEN["format-2"].report);
    expect(hash(packageWorkbookV2(content, diff))).toBe(GOLDEN["format-2"].workbook);
  });
});
