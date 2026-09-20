import fs from "node:fs";
import { it, expect } from "vitest";
import { and, eq, asc } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db/client";
import { saveDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { processDealRun, processDealVersion, extractAfterReview } from "@/lib/deals/process";
import { reviewFile, type FilingRecord } from "@/lib/deals/filing";
import { parseArrival } from "@/lib/deals/parse";
import { consumption } from "@/lib/extract/schema";
import { normalizeValue } from "@/lib/rules/expressions";
import { normalizeText } from "@/lib/text";
import { seeded } from "./helpers";
import type { SessionContext } from "@/lib/workspace";
import type { documents } from "../../fixtures/lib/truth";
import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";
type Truth = ReturnType<typeof documents>[number] & {
  faults: {
    id: string;
    document: string;
    attribute: string;
    kind: string;
    expected: "review" | "blocked";
  }[];
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
it("Phase 4 Step A: facts by method, provenance, planted faults, vision routing and resumability", async () => {
  process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
  const seed = await seeded();
  const ctx: SessionContext = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic administrator" },
    workspace: {
      workspaceId: seed.workspaceId,
      slug: "default",
      name: "Synthetic workspace",
      role: "admin",
    },
  };
  const db = getDb();
  const consumed = consumption().attributes;
  const report: Record<string, unknown>[] = [];
  const faultLog: Record<string, unknown>[] = [];
  const misses: Record<string, unknown>[] = [];
  let injected: { dealId: string; versionId: string; runId: string } | null = null;
  for (const code of ["deal-a", "deal-b", "deal-c"]) {
    const truth = JSON.parse(
      fs.readFileSync(`fixtures/deals/${code}/truth/documents.json`, "utf8"),
    ) as Truth[];
    const draft = JSON.parse(fs.readFileSync(`fixtures/deals/${code}/truth/deal.json`, "utf8"));
    const dealId = await saveDeal(ctx, {
      ...draft,
      code: `X-${code}`,
      name: draft.parties.find((p: { roles: string[] }) => p.roles.includes("seller_entity"))
        .legal_name,
    });
    for (let batch = 1; batch <= (code === "deal-a" ? 2 : 1); batch++) {
      const upload = await intake(ctx, dealId, [
        {
          path: `batch-${batch}.zip`,
          bytes: fs.readFileSync(`fixtures/deals/${code}/batch-${batch}.zip`),
        },
      ]);
      if (code === "deal-b" && batch === 1) {
        // Injected failures at extract and at independent_verify resume without repeating a completed step or call.
        const target = upload.rows.find(
          (r) =>
            !r.duplicate &&
            /loi|note|debt/i.test(r.originalPath) &&
            r.originalPath.toLowerCase().endsWith("pdf"),
        )!;
        injected = { dealId, versionId: target.documentVersionId, runId: upload.runId };
        await expect(
          processDealVersion(ctx, dealId, target.documentVersionId, upload.runId, {
            injectFailure: { step: "extract", attempts: 4 },
            sleep: async () => {},
          }),
        ).rejects.toThrow();
        await processDealVersion(ctx, dealId, target.documentVersionId, upload.runId, {
          injectFailure: { step: "independent_verify", attempts: 1 },
          sleep: async () => {},
        });
      }
      expect(await processDealRun(ctx, dealId, upload.runId, { sleep: async () => {} })).toEqual({
        completed: upload.rows.filter((r) => !r.duplicate).length,
        failed: 0,
      });
      // Phase 3 segmentation review: the test operator confirms proposed boundaries that match truth, which triggers extraction.
      for (const arrival of upload.rows.filter((r) => !r.duplicate)) {
        const expected = truth.find(
          (d) => d.file === `incoming/batch-${batch}/${arrival.originalPath}`,
        )!;
        const [record] = await db
          .select()
          .from(schema.recordVersions)
          .where(
            and(
              eq(schema.recordVersions.documentVersionId, arrival.documentVersionId),
              eq(schema.recordVersions.isCurrent, true),
            ),
          );
        const filed = (record?.payloadJson as FilingRecord | undefined)?.segments ?? [];
        if (!filed.some((s) => s.status === "proposed")) continue;
        const matches =
          filed.length === expected.segments.length &&
          filed.every(
            (s, i) =>
              s.doc_type === expected.segments[i]!.doc_type &&
              s.page_start === expected.segments[i]!.page_start &&
              s.page_end === expected.segments[i]!.page_end,
          );
        if (!matches) continue;
        await getSql()`delete from mutation_limits`; // the test operator confirms faster than the per-minute limit for one person
        await reviewFile(ctx, dealId, arrival.documentVersionId, {
          record_id: record!.id,
          segments: filed,
          note: "Confirmed proposed boundaries against the supplied pages.",
        });
        await extractAfterReview(ctx, dealId, arrival.documentVersionId, { sleep: async () => {} });
      }
      const counts = {
        deal: code,
        batch,
        facts: 0,
        rule_feeding: { acroform: [0, 0], text: [0, 0], vision: [0, 0] } as Record<
          string,
          [number, number]
        >,
        provenance: [0, 0] as [number, number],
        by_method: {} as Record<string, number>,
        routing: {} as Record<string, number>,
        vision_auto_accepted: 0,
        review_items: 0,
        gaps: 0,
      };
      for (const arrival of upload.rows.filter((r) => !r.duplicate)) {
        const expected = truth.find(
          (d) => d.file === `incoming/batch-${batch}/${arrival.originalPath}`,
        )!;
        if (!expected.segments.length) continue;
        const parsed = await parseArrival(
          fs.readFileSync(`fixtures/deals/${code}/${expected.file}`),
          FIXTURE_HMAC_KEY,
        );
        const segments = await db
          .select()
          .from(schema.segments)
          .where(
            and(
              eq(schema.segments.documentVersionId, arrival.documentVersionId),
              eq(schema.segments.isCurrent, true),
            ),
          )
          .orderBy(asc(schema.segments.pageStart));
        for (const truthSegment of expected.segments) {
          const segment = segments.find((s) => s.pageStart === truthSegment.page_start);
          if (!segment || segment.status !== "confirmed") continue;
          const facts = await db
            .select()
            .from(schema.facts)
            .where(and(eq(schema.facts.segmentId, segment.id), eq(schema.facts.isCurrent, true)));
          counts.facts += facts.length;
          for (const f of facts) {
            counts.by_method[f.method] = (counts.by_method[f.method] ?? 0) + 1;
            counts.routing[f.routingStatus] = (counts.routing[f.routingStatus] ?? 0) + 1;
            if (f.method === "vision" && f.routingStatus === "auto_accepted")
              counts.vision_auto_accepted++;
            if (f.method !== "vision") {
              const locator = f.locatorJson as {
                source_block: string;
                quote: string;
                page: number;
              };
              const block = parsed.blocks.find((b) => b.locator === locator.source_block);
              const valid =
                !!block &&
                block.page >= segment.pageStart &&
                block.page <= segment.pageEnd &&
                normalizeText(block.text).includes(normalizeText(locator.quote));
              counts.provenance[0] += Number(valid);
              counts.provenance[1]++;
            }
          }
          for (const t of expected.facts.filter(
            (x) => x.segment_id === truthSegment.id && consumed.has(x.attribute),
          )) {
            const method = t.method === "declared" || t.method === "manual" ? "text" : t.method;
            const actual = facts.find((f) => f.attribute === t.attribute);
            counts.rule_feeding[method]![1]++;
            if (actual && same(actual.valueJson, t.value)) counts.rule_feeding[method]![0]++;
            else
              misses.push({
                deal: code,
                batch,
                segment: truthSegment.id,
                attribute: t.attribute,
                method,
                actual: actual ? { value: actual.valueJson, routing: actual.routingStatus } : null,
              });
          }
          for (const fault of expected.faults.filter((f) => f.document === truthSegment.id)) {
            const actual = facts.find((f) => f.attribute === fault.attribute);
            const gaps = await db
              .select()
              .from(schema.intakeReviews)
              .where(
                and(
                  eq(schema.intakeReviews.segmentId, segment.id),
                  eq(schema.intakeReviews.type, "extraction_gap"),
                ),
              );
            const routed =
              fault.kind === "missing_value"
                ? !actual && gaps.some((g) => g.attribute === fault.attribute)
                  ? "review"
                  : "none"
                : (actual?.routingStatus ?? "none");
            faultLog.push({
              deal: code,
              fault: fault.id,
              kind: fault.kind,
              expected: fault.expected,
              actual: routed,
              confidence: actual?.confidence ?? null,
            });
            expect(routed, fault.id).toBe(fault.expected);
          }
        }
      }
      const pending = await db
        .select()
        .from(schema.facts)
        .where(and(eq(schema.facts.dealId, dealId), eq(schema.facts.isCurrent, true)));
      const reviews = await db
        .select()
        .from(schema.intakeReviews)
        .where(
          and(eq(schema.intakeReviews.dealId, dealId), eq(schema.intakeReviews.status, "open")),
        );
      counts.review_items =
        pending.filter((f) => f.routingStatus === "review" || f.routingStatus === "blocked")
          .length + reviews.length;
      counts.gaps = reviews.filter((r) => r.type === "extraction_gap").length;
      for (const method of ["acroform", "text"]) {
        const [ok, total] = counts.rule_feeding[method]!;
        if (total) expect(ok / total, `${code}/${batch} ${method}`).toBeGreaterThanOrEqual(0.95);
      }
      expect(
        counts.provenance[0] / counts.provenance[1],
        `${code}/${batch} provenance`,
      ).toBeGreaterThanOrEqual(0.98);
      expect(counts.vision_auto_accepted).toBe(0);
      report.push(counts);
    }
  }
  expect(faultLog).toHaveLength(12);
  // Resumability: the injected version ran extract twice (one injected failure counted per attempt), made one extract call, and a rerun makes none.
  const steps = await db
    .select()
    .from(schema.runSteps)
    .where(eq(schema.runSteps.documentVersionId, injected!.versionId));
  const extractSteps = steps.filter((s) => s.stepName === "extract");
  expect(extractSteps.length).toBeGreaterThan(0);
  expect(extractSteps.every((s) => s.status === "succeeded" && s.attemptCount === 5)).toBe(true);
  expect(
    steps
      .filter((s) => s.stepName === "independent_verify")
      .every((s) => s.status === "succeeded" && s.attemptCount === 2),
  ).toBe(true);
  const calls = async () =>
    db
      .select()
      .from(schema.llmCalls)
      .where(eq(schema.llmCalls.documentVersionId, injected!.versionId));
  const before = await calls();
  expect(before.filter((c) => c.purpose === "extract")).toHaveLength(extractSteps.length);
  expect(before.filter((c) => c.purpose === "verify")).toHaveLength(
    steps.filter((s) => s.stepName === "independent_verify").length,
  );
  await processDealVersion(ctx, injected!.dealId, injected!.versionId, injected!.runId, {
    sleep: async () => {},
  });
  expect((await calls()).length).toBe(before.length);
  // Identifier hygiene: no SSN, EIN or account pattern in facts, reviews, events, run steps or logs.
  const pattern = /\b9\d{2}-\d{2}-\d{4}\b|\b00-\d{7}\b|\b\d{10,17}\b/;
  for (const table of [
    "facts",
    "intake_reviews",
    "events",
    "run_steps",
    "run_events",
    "llm_calls",
  ]) {
    const rows = await getSql().unsafe(`select to_jsonb(t)::text as row from ${table} t`);
    for (const r of rows as unknown as { row: string }[])
      expect(
        r.row.replace(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}/g,
          "",
        ),
        table,
      ).not.toMatch(pattern);
  }
  fs.writeFileSync(
    "/tmp/acqfile-phase4-step-a-proof.json",
    JSON.stringify({ report, faults: faultLog, misses }, null, 2),
  );
}, 600000);
