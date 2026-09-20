import { BANNED_TERMS } from "@/lib/rules/loader";
import { ACCEPTED } from "@/lib/evaluation/run";
import fs from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { reviewFact } from "@/lib/extract/review";
import { it, expect } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { getDb, schema, getSql } from "@/lib/db/client";
import { seeded } from "./helpers";
import type { SessionContext } from "@/lib/workspace";
import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";
import {
  fixtureDeal,
  attestTruth,
  uploadFixture,
  confirmBoundaries,
  reviewTruth,
  currentResult,
  readTruth,
  unlimited,
} from "../helpers/deal-proof";
import { buildIndex, readiness } from "@/lib/deliverables/index-build";
import { buildDrafts, markRequestSent } from "@/lib/deliverables/requests";
import { decideFinding } from "@/lib/deliverables/findings";
import {
  createSnapshot,
  type SnapshotContent,
  type SnapshotDiff,
} from "@/lib/deliverables/snapshot";
import { packageZip } from "@/lib/deliverables/package";
import { sha256 } from "@/lib/hash";
import { evaluateDealNow } from "@/lib/evaluation/run";
import { loadPack } from "@/lib/rules/loader";
const sort = (xs: unknown[]) => xs.map((x) => JSON.stringify(x)).sort();
it("Phase 5: lifecycle, request ownership, immutable snapshots, unchanged package bytes and viewer denial", async () => {
  process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
  const seed = await seeded();
  const ctx: SessionContext = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic operator" },
    workspace: {
      workspaceId: seed.workspaceId,
      slug: "default",
      name: "Synthetic workspace",
      role: "admin",
    },
  };
  const d = await fixtureDeal(ctx, "deal-a");
  await attestTruth(ctx, d, 1, true);
  await uploadFixture(ctx, d, 1);
  await confirmBoundaries(ctx, d);
  await reviewTruth(ctx, d);
  let result = await currentResult(d);
  expect(sort(result.rows)).toEqual(sort(readTruth(d.code, "batch-1/expected_checklist")));
  expect(sort(result.findings)).toEqual(
    sort(
      readTruth(d.code, "batch-1/expected_findings").map(
        ({ rule_id, scope_key, period, type, severity }: Record<string, unknown>) => ({
          rule_id,
          scope_key,
          period,
          type,
          severity,
        }),
      ),
    ),
  );
  const first = await createSnapshot(ctx, d.id);
  const firstContent = first.contentJson as SnapshotContent;
  const drafts = await buildDrafts(ctx, d.id);
  const keys = drafts.flatMap((d) => d.findingKeys);
  const allOpen = (await buildIndex(d.id)).findings.filter((f) => f.status === "open");
  const open = allOpen.filter((f) => f.type !== "info" && f.severity !== "info");
  for (const info of allOpen.filter((f) => f.type === "info" || f.severity === "info"))
    expect(keys).not.toContain(info.findingKey);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys.sort()).toEqual(open.map((f) => f.findingKey).sort());
  for (const d of drafts)
    expect(d.body).not.toMatch(
      /\b(eligible|ineligible|qualifies|approved|compliant)\b|meets SBA requirements/i,
    );
  const seller = drafts.find((d) => d.responsible === "seller")!;
  expect(seller).toBeDefined();
  await markRequestSent(ctx, d.id, "seller");
  for (const f of (await buildIndex(d.id)).findings.filter((f) =>
    seller.findingKeys.includes(f.findingKey),
  ))
    expect(f.status).toBe("requested");
  await uploadFixture(ctx, d, 2);
  await confirmBoundaries(ctx, d);
  await reviewTruth(ctx, d);
  await attestTruth(ctx, d, 2);
  result = await currentResult(d);
  expect(sort(result.rows)).toEqual(sort(readTruth(d.code, "batch-2/expected_checklist")));
  const second = await createSnapshot(ctx, d.id),
    content = second.contentJson as SnapshotContent,
    diff = second.diffJson as SnapshotDiff;
  expect(diff.resolved_findings).toHaveLength(3);
  expect(diff.resolved_findings.join(" ")).toMatch(/ENT-01/);
  expect(diff.documents_added.join(" ")).toMatch(/1919-fixed/);
  expect(diff.documents_superseded.length).toBeGreaterThan(0);
  const resolved = (await buildIndex(d.id)).findings.filter(
    (f) =>
      f.status === "resolved" &&
      firstContent.findings.some(
        (p) => p.finding_key === f.findingKey && ["open", "requested"].includes(p.status),
      ),
  );
  expect(resolved).toHaveLength(3);
  for (const f of resolved)
    expect((f.resolvedByJson as { segment_ids: string[] }).segment_ids.length).toBeGreaterThan(0);
  await expect(getSql()`update snapshots set number=9 where id=${first.id}`).rejects.toThrow(
    "Immutable",
  );
  const zip = await JSZip.loadAsync((await packageZip(d.id, second.id)).bytes);
  for (const f of content.manifest)
    expect(sha256(await zip.file(f.package_path)!.async("nodebuffer"))).toBe(f.sha256);
  const html = await zip.file("00_Package_Report.html")!.async("string");
  expect(html).toContain(content.footer);
  expect(html).not.toMatch(BANNED_TERMS);
  expect(html).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b|\b\d{2}-\d{7}\b/);
  const book = XLSX.read(await zip.file("00_Package_Workbook.xlsx")!.async("nodebuffer"));
  expect(book.SheetNames).toEqual([
    "Index",
    "Missing items",
    "Conflicts",
    "Source record",
    "Change log",
  ]);
  for (const name of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[name]!, { header: 1 }) as unknown[][];
    expect(rows.at(-1)![0]).toBe(content.footer);
    const quoteColumn = rows[0]!.indexOf("Quote");
    expect(JSON.stringify(rows.map((row) => row.filter((_, i) => i !== quoteColumn)))).not.toMatch(
      BANNED_TERMS,
    );
    expect(JSON.stringify(rows)).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b|\b\d{2}-\d{7}\b/);
  }
  expect(content.index.length).toBe(result.rows.length);
  const currentAccepted = await getDb()
    .select({ id: schema.facts.id })
    .from(schema.facts)
    .innerJoin(schema.segments, eq(schema.segments.id, schema.facts.segmentId))
    .where(
      and(
        eq(schema.facts.dealId, d.id),
        eq(schema.facts.isCurrent, true),
        eq(schema.segments.isCurrent, true),
        eq(schema.segments.status, "confirmed"),
        inArray(schema.facts.routingStatus, [...ACCEPTED]),
      ),
    );
  expect(content.source_record.length).toBe(currentAccepted.length);
  const finding = (await buildIndex(d.id)).findings.find(
    (f) => f.status === "open" && f.ruleId === "TXN-01",
  )!;
  await expect(
    decideFinding(ctx, d.id, { finding_key: finding.findingKey, action: "waive", reason: " " }),
  ).rejects.toThrow();
  const before = await buildIndex(d.id);
  await decideFinding(ctx, d.id, {
    finding_key: finding.findingKey,
    action: "waive",
    reason: "Synthetic lender instruction",
  });
  const waived = await buildIndex(d.id);
  expect(readiness(waived.index, waived.rules).satisfied).toBe(
    readiness(before.index, before.rules).satisfied + 1,
  );
  const dismiss = waived.findings.find((f) => f.status === "open" && f.type === "conflict")!;
  await decideFinding(ctx, d.id, {
    finding_key: dismiss.findingKey,
    action: "dismiss",
    reason: "Synthetic reviewer decision",
  });
  const third = await createSnapshot(ctx, d.id);
  expect((third.diffJson as SnapshotDiff).waivers).toHaveLength(1);
  expect((third.diffJson as SnapshotDiff).dismissals).toHaveLength(1);
  const viewer = { ...ctx, workspace: { ...ctx.workspace, role: "viewer" as const } };
  await expect(createSnapshot(viewer, d.id)).rejects.toThrow("read-only");
  await expect(markRequestSent(viewer, d.id, "buyer")).rejects.toThrow("read-only");
  await expect(
    decideFinding(viewer, d.id, {
      finding_key: finding.findingKey,
      action: "dismiss",
      reason: "test",
    }),
  ).rejects.toThrow("read-only");
  const b = await fixtureDeal(ctx, "deal-b");
  await attestTruth(ctx, b, 1);
  await uploadFixture(ctx, b, 1);
  await confirmBoundaries(ctx, b);
  await reviewTruth(ctx, b);
  const bSnap = await createSnapshot(ctx, b.id);
  const bContent = bSnap.contentJson as SnapshotContent;
  expect(bContent.manifest.some((m) => m.package_path.includes("/SLA_"))).toBe(true);
  expect(bContent.manifest[0]!.package_path.split("/")[0]).not.toBe(
    firstContent.manifest[0]!.package_path.split("/")[0],
  );
  const repeat = await evaluateDealNow(b.id);
  expect(repeat!.result.result_hash).toBe((await evaluateDealNow(b.id))!.result.result_hash);
  expect(loadPack("sop-50-10-8-1", "sample-lender-a").items.length).toBeGreaterThan(
    loadPack("sop-50-10-8-1").items.length,
  );
  const [revenue] = await getDb()
    .select()
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.dealId, b.id),
        eq(schema.facts.attribute, "financial.revenue"),
        eq(schema.facts.period, "2024"),
        eq(schema.facts.isCurrent, true),
      ),
    );
  await unlimited();
  const wrong = await reviewFact(ctx, b.id, {
    fact_id: revenue!.id,
    expected_record_version: revenue!.recordVersion,
    action: "edit_accept",
    value: 1000000,
    comment: "Synthetic conflict",
  });
  const conflict = (await buildIndex(b.id)).findings.find(
    (f) => f.ruleId === "CON-10" && f.period === "2024",
  )!;
  expect(conflict.status).toBe("open");
  await unlimited();
  const restored = await reviewFact(ctx, b.id, {
    fact_id: wrong.factId,
    expected_record_version: wrong.recordVersion,
    action: "edit_accept",
    value: revenue!.valueJson,
    comment: "Restored source value",
  });
  expect((await buildIndex(b.id)).findings.find((f) => f.id === conflict.id)!.status).toBe(
    "resolved",
  );
  await unlimited();
  await reviewFact(ctx, b.id, {
    fact_id: restored.factId,
    expected_record_version: restored.recordVersion,
    action: "edit_accept",
    value: 1000000,
    comment: "Repeated synthetic conflict",
  });
  expect((await buildIndex(b.id)).findings.find((f) => f.id === conflict.id)!.status).toBe("open");
  fs.writeFileSync(
    "/tmp/acqfile-phase5-proof.json",
    JSON.stringify(
      {
        dealA: {
          resolved: diff.resolved_findings,
          added: diff.documents_added,
          superseded: diff.documents_superseded.length,
        },
        sampleTree: bContent.manifest.slice(0, 5).map((m) => m.package_path),
        files: content.manifest.length,
        rows: content.index.length,
        facts: content.source_record.length,
      },
      null,
      2,
    ),
  );
}, 900000);
