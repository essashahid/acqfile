import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { getDb, getSql, schema, closeDb } from "@/lib/db/client";
import { resetDatabase } from "@/lib/db/migrate";
import { databaseUrl } from "@/lib/env";
import { seedWorkspace } from "@/lib/seed";
import { buildEngineInput, requestEvaluation, ACCEPTED, PENDING } from "@/lib/evaluation/run";
import { evaluateDeal } from "@/lib/rules/engine";
import { loadPack } from "@/lib/rules/loader";
import { folderFor, packageFilename } from "@/lib/deliverables/index-build";
import { parseArrival } from "@/lib/deals/parse";
import { consumption } from "@/lib/extract/schema";
import { normalizeText } from "@/lib/text";
import { plans } from "../fixtures/lib/plans";
import { FIXTURE_HMAC_KEY } from "../fixtures/plans/shared";
import {
  fixtureDeal,
  attestTruth,
  uploadFixture,
  confirmBoundaries,
  reviewTruth,
  currentResult,
  equalValue,
  readTruth,
} from "../tests/helpers/deal-proof";
import { add, percent, gate, type Tally } from "@/lib/eval/metrics";
import { regression } from "@/lib/eval/regression";
import { readBaseline, savePassingBaseline } from "@/lib/eval/baseline";
import { writeScorecard } from "./scorecard";
import type { SessionContext } from "@/lib/workspace";

type Row = { item_id: string; scope_key: string; period: string | null; status: string };
type Finding = {
  rule_id: string;
  scope_key: string;
  period: string | null;
  type: string;
  severity: string;
};
const rowKey = (r: Row) => [r.item_id, r.scope_key, r.period ?? ""].join("|");
const findingKey = (r: Finding) => [r.rule_id, r.scope_key, r.period ?? ""].join("|");
const exactFinding = (r: Finding) => `${findingKey(r)}|${r.type}|${r.severity}`;
const empty = (): Tally => [0, 0];
export async function runEvaluation(live = false) {
  const url = new URL(databaseUrl());
  if (
    process.env.ACQFILE_DB !== "test" ||
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  )
    throw Error("Evaluation resets only the local test database");
  process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
  await resetDatabase(getSql());
  const seed = await seedWorkspace();
  const ctx: SessionContext = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic evaluator" },
    workspace: {
      workspaceId: seed.workspaceId,
      slug: "default",
      name: "Synthetic workspace",
      role: "admin",
    },
  };
  const db = getDb(),
    consumed = consumption().attributes;
  const totals = {
    type: empty(),
    boundary: empty(),
    partyPeriod: empty(),
    quote: empty(),
    status: empty(),
    precision: empty(),
    missing: empty(),
    conflicts: empty(),
  };
  const facts: Record<string, Tally> = { acroform: empty(), text: empty(), vision: empty() };
  const batches = [],
    planted = [],
    traps = [],
    deals = [];
  let falseBefore = 0,
    falseAfter = 0,
    deterministic = true,
    overlay = false;
  for (const plan of plans().filter((p) => !live || p.id !== "deal-b")) {
    const started = Date.now();
    const d = await fixtureDeal(ctx, plan.id, live ? "Live" : "Scorecard");
    let reviewItems = 0;
    const falseAccepts: { file: string; attribute: string; value: unknown; expected: unknown }[] =
      [];
    const scans = empty(),
      dealFacts: Record<string, Tally> = { acroform: empty(), text: empty(), vision: empty() };
    for (let batch = 1; batch <= (live ? 1 : plan.batches.length); batch++) {
      await attestTruth(ctx, d, batch);
      const upload = await uploadFixture(ctx, d, batch);
      // Measure classification before the truth operator changes any boundaries.
      const pipeline = new Map<string, boolean>();
      for (const arrival of upload.rows) {
        const expected = d.truth.find(
          (t) => t.file === `incoming/batch-${batch}/${arrival.originalPath}`,
        )!;
        if (!expected) throw Error(`No authored truth for ${arrival.originalPath}`);
        let ok = arrival.duplicate === !!expected.pipeline.duplicate_of;
        if (arrival.duplicate) {
          const originals = await db
            .select()
            .from(schema.intakeFiles)
            .where(
              and(
                eq(schema.intakeFiles.documentVersionId, arrival.documentVersionId),
                eq(schema.intakeFiles.duplicate, false),
              ),
            );
          ok &&= originals.some(
            (o) => expected.pipeline.duplicate_of === `incoming/batch-${batch}/${o.originalPath}`,
          );
        } else {
          const actual = await db
            .select()
            .from(schema.segments)
            .where(eq(schema.segments.documentVersionId, arrival.documentVersionId));
          const [version] = await db
            .select()
            .from(schema.documentVersions)
            .where(eq(schema.documentVersions.id, arrival.documentVersionId));
          ok &&=
            (version!.parseStatus === "failed") === expected.pipeline.unreadable &&
            actual.length === expected.segments.length;
          for (const t of expected.segments) {
            const s = actual.find((s) => s.pageStart === t.page_start);
            const type = s?.docType === t.doc_type;
            add(totals.type, type);
            const boundary = s?.pageEnd === t.page_end;
            if (expected.pipeline.bundle) add(totals.boundary, boundary);
            const party =
              (s?.partyId ? d.external(s.partyId) : null) ===
                (t.party_id === "outside-party" ? null : t.party_id) && s?.period === t.period;
            add(totals.partyPeriod, party);
            if (expected.format === "scan_pdf") add(scans, type);
            ok &&= type && boundary && party;
            if (t.id === "pfs" && plan.id === "deal-c")
              ok &&= s?.signed === true && s?.dated === true;
          }
          for (const extra of actual.filter(
            (s) => !expected.segments.some((t) => t.page_start === s.pageStart),
          )) {
            add(totals.type, false);
            add(totals.partyPeriod, false);
            if (expected.pipeline.bundle) add(totals.boundary, false);
            void extra;
          }
          for (const oldId of expected.pipeline.supersedes) {
            const oldFile = d.truth.find((t) => t.segments.some((s) => s.id === oldId))!;
            const oldVersions = await db
              .select()
              .from(schema.documentVersions)
              .where(
                and(
                  eq(schema.documentVersions.dealId, d.id),
                  eq(schema.documentVersions.contentHash, oldFile.hash!),
                ),
              );
            const oldSegments = oldVersions.length
              ? await db
                  .select()
                  .from(schema.segments)
                  .where(eq(schema.segments.documentVersionId, oldVersions[0]!.id))
              : [];
            ok &&= oldSegments.length > 0 && oldSegments.every((s) => !s.isCurrent);
          }
          if (expected.pipeline.unreadable) {
            const review = await db
              .select()
              .from(schema.intakeReviews)
              .where(eq(schema.intakeReviews.documentVersionId, arrival.documentVersionId));
            ok &&= review.some((r) => r.type === "unreadable");
          }
          if (expected.format === "xlsx") {
            const parsed = await parseArrival(
              fs.readFileSync(`fixtures/deals/${d.code}/${expected.file}`),
              FIXTURE_HMAC_KEY,
            );
            ok &&= ["Income Statement", "Balance Sheet"].every((sheet) =>
              parsed.blocks.some((b) => b.locator.includes(sheet)),
            );
          }
        }
        pipeline.set(expected.file, ok);
      }
      await requestEvaluation(d.id);
      const before = await currentResult(d);
      const expectedRows = readTruth(d.code, `batch-${batch}/expected_checklist`) as Row[];
      const expectedFindings = readTruth(d.code, `batch-${batch}/expected_findings`) as Finding[];
      const expectedByKey = new Map(expectedRows.map((r) => [rowKey(r), r.status]));
      const beforeWrong = before.rows.filter(
        (r) => r.status === "satisfied" && expectedByKey.get(rowKey(r)) !== "satisfied",
      );
      falseBefore += beforeWrong.length;
      await confirmBoundaries(ctx, d);
      // Score raw facts after boundary confirmation, before any value review.
      for (const arrival of upload.rows.filter((r) => !r.duplicate)) {
        const expected = d.truth.find(
          (t) => t.file === `incoming/batch-${batch}/${arrival.originalPath}`,
        )!;
        const parsed = await parseArrival(
          fs.readFileSync(`fixtures/deals/${d.code}/${expected.file}`),
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
          );
        for (const t of expected.segments) {
          const s = segments.find((s) => s.pageStart === t.page_start);
          // Superseded versions do not feed the engine; measure only its current evidence.
          if (!s) continue;
          const actual = await db
            .select()
            .from(schema.facts)
            .where(and(eq(schema.facts.segmentId, s.id), eq(schema.facts.isCurrent, true)));
          if (d.code === "deal-c" && t.id === "pfs") {
            const vision = actual.filter((f) => f.method === "vision");
            pipeline.set(
              expected.file,
              pipeline.get(expected.file) === true &&
                parsed.blocks.some((b) => b.image_only) &&
                vision.length > 0 &&
                vision.every((f) => (PENDING as readonly string[]).includes(f.routingStatus)),
            );
          }
          for (const target of expected.facts.filter(
            (f) => f.segment_id === t.id && consumed.has(f.attribute),
          )) {
            const method =
              target.method === "manual" || target.method === "declared" ? "text" : target.method;
            const a = actual.find((f) => f.attribute === target.attribute);
            const correct = !!a && equalValue(a.valueJson, target.value);
            add(facts[method]!, correct);
            add(dealFacts[method]!, correct);
          }
          for (const f of actual) {
            const target = expected.facts.find(
              (f2) => f2.segment_id === t.id && f2.attribute === f.attribute,
            );
            // Some producers also read the named subject. Its independent expectation is
            // the authored party registry, even when it isn't repeated as a fact in this file.
            const expectedValue =
              target?.value ??
              (f.attribute === "party.legal_name"
                ? plan.parties.find((p) => p.id === t.party_id)?.legal_name
                : undefined);
            if (
              (ACCEPTED as readonly string[]).includes(f.routingStatus) &&
              (expectedValue === undefined || !equalValue(f.valueJson, expectedValue))
            )
              falseAccepts.push({
                file: expected.file,
                attribute: f.attribute,
                value: f.valueJson,
                expected: expectedValue ?? null,
              });
            if (f.method !== "vision") {
              const loc = f.locatorJson as { source_block: string; quote: string; page: number };
              const block = parsed.blocks.find((b) => b.locator === loc.source_block);
              add(
                totals.quote,
                !!block &&
                  block.page === loc.page &&
                  block.page >= s.pageStart &&
                  block.page <= s.pageEnd &&
                  !!loc.quote &&
                  normalizeText(block.text).includes(normalizeText(loc.quote)),
              );
            }
          }
        }
      }
      const pending = await db
        .select()
        .from(schema.facts)
        .where(and(eq(schema.facts.dealId, d.id), eq(schema.facts.isCurrent, true)));
      const reviews = await db
        .select()
        .from(schema.intakeReviews)
        .where(and(eq(schema.intakeReviews.dealId, d.id), eq(schema.intakeReviews.status, "open")));
      reviewItems +=
        pending.filter((f) => (PENDING as readonly string[]).includes(f.routingStatus)).length +
        reviews.length;
      await reviewTruth(ctx, d);
      const after = await currentResult(d);
      const actualByKey = new Map(after.rows.map((r) => [rowKey(r), r.status]));
      for (const r of expectedRows) add(totals.status, actualByKey.get(rowKey(r)) === r.status);
      after.rows
        .filter((r) => !expectedByKey.has(rowKey(r)))
        .forEach(() => add(totals.status, false));
      const afterWrong = after.rows.filter(
        (r) => r.status === "satisfied" && expectedByKey.get(rowKey(r)) !== "satisfied",
      );
      falseAfter += afterWrong.length;
      const expectedKeys = new Set(expectedFindings.map(exactFinding));
      for (const f of after.findings) add(totals.precision, expectedKeys.has(exactFinding(f)));
      const actualKeys = new Set(after.findings.map(exactFinding));
      for (const plant of plan.planted.filter((p) => p.batch === batch)) {
        const files = plan.documents
          .filter((doc) => plant.documents.includes(doc.id) && doc.batch <= batch)
          .map((doc) => doc.path);
        const pipelineOk =
          !plant.pipeline ||
          (files.length > 0 && files.every((file) => pipeline.get(file) === true));
        const requiredFindings = expectedFindings.filter((f) =>
          plant.findings.includes(findingKey(f)),
        );
        const wronglyRaised = after.findings.some(
          (f) => plant.findings.includes(findingKey(f)) && !expectedKeys.has(exactFinding(f)),
        );
        const caught =
          requiredFindings.length === plant.findings.length &&
          requiredFindings.every((f) => actualKeys.has(exactFinding(f))) &&
          pipelineOk &&
          !wronglyRaised;
        const types = expectedFindings
          .filter((f) => plant.findings.includes(findingKey(f)))
          .map((f) => f.type);
        if (types.some((t) => ["missing", "stale", "incomplete"].includes(t)))
          add(totals.missing, caught);
        if (types.includes("conflict")) add(totals.conflicts, caught);
        planted.push({
          deal: d.code,
          batch,
          item: plant.item,
          description: plant.description,
          files: [...new Set(files)],
          expected: plant.findings.length ? plant.findings.join(", ") : plant.pipeline,
          result: wronglyRaised ? "wrongly raised" : caught ? "caught" : "missed",
          pipeline: pipelineOk,
        });
      }
      for (const trap of plan.traps) {
        const raised = after.findings.filter((f) =>
          trap.rules.some((rule) => findingKey(f) === rule || findingKey(f).startsWith(`${rule}|`)),
        );
        traps.push({
          deal: d.code,
          batch,
          id: trap.id,
          result: raised.length ? "wrongly raised" : "clear",
          findings: raised,
        });
      }
      const { input, deal } = await buildEngineInput(d.id);
      const pack = loadPack(deal.rulePackVersion, deal.overlayId ?? undefined);
      deterministic &&=
        evaluateDeal(input, pack).result_hash === evaluateDeal(input, pack).result_hash &&
        evaluateDeal(input, pack).result_hash === after.evaluation.resultHash;
      if (d.code === "deal-b") {
        const base = loadPack(deal.rulePackVersion);
        const baseRows = evaluateDeal(input, base).checklist;
        const overlayRows = evaluateDeal(input, pack).checklist;
        const parts = {
          item_id: "TXN-02",
          doc_label: "Purchase agreement",
          party: "Quenby",
          period: "2026",
          original_extension: ".PDF",
        };
        overlay =
          ["TXN-10a", "TGT-11"].every(
            (id) =>
              overlayRows.some((r) => r.item_id === id && r.status !== "not_applicable") &&
              baseRows.every((r) => r.item_id !== id || r.status === "not_applicable"),
          ) &&
          packageFilename(base, parts) !== packageFilename(pack, parts) &&
          folderFor(
            base.items.find((r) => r.id === "TXN-02"),
            base,
          ) !==
            folderFor(
              pack.items.find((r) => r.id === "TXN-02"),
              pack,
            );
      }
      batches.push({
        deal: d.code,
        batch,
        checklistRows: after.rows.length,
        findings: after.findings.length,
        beforeFalseSatisfied: beforeWrong,
        afterFalseSatisfied: afterWrong,
        mismatchedRows: expectedRows.filter((r) => actualByKey.get(rowKey(r)) !== r.status),
        unexpectedFindings: after.findings.filter((f) => !expectedKeys.has(exactFinding(f))),
        missingFindings: expectedFindings.filter(
          (f) => !after.findings.some((a) => exactFinding(a) === exactFinding(f)),
        ),
      });
    }
    const calls = await db
      .select({ costUsd: schema.llmCalls.costUsd })
      .from(schema.llmCalls)
      .innerJoin(
        schema.documentVersions,
        eq(schema.documentVersions.id, schema.llmCalls.documentVersionId),
      )
      .where(eq(schema.documentVersions.dealId, d.id));
    deals.push({
      deal: d.code,
      facts: dealFacts,
      scanClassification: scans,
      reviewItems,
      falseAccepts,
      costUsd: calls.reduce((n, c) => n + Number(c.costUsd), 0),
      wallClockMs: Date.now() - started,
    });
  }
  const trapsRaised = traps.filter((t) => t.result !== "clear").length;
  const regressionMetrics = {
    statusAccuracy: percent(totals.status),
    plantedRecall: (100 * planted.filter((p) => p.result === "caught").length) / planted.length,
    falseSatisfiedBefore: falseBefore,
    falseSatisfiedAfter: falseAfter,
    trapsRaised,
  };
  const gates = [
    gate("Segment type", totals.type, 95),
    gate("Bundle boundaries", totals.boundary, 90),
    gate("Party and period", totals.partyPeriod, 90),
    gate("Rule-feeding acroform facts", facts.acroform!, 95),
    gate("Rule-feeding text facts", facts.text!, 95),
    gate("Quote in cited block", totals.quote, 98),
    gate("Checklist status after review", totals.status, 95),
    gate("Missing/stale/incomplete plants", totals.missing, 95),
    gate("Conflict plants", totals.conflicts, 90),
    gate("Finding precision", totals.precision, 80),
    ...[
      ["Traps raised", trapsRaised],
      ["False satisfied before review", falseBefore],
      ["False satisfied after review", falseAfter],
    ].map(([label, n]) => ({
      label: String(label),
      measured: Number(n),
      required: "0",
      passed: n === 0,
    })),
    {
      label: "Deterministic evaluation hash",
      measured: deterministic ? "pass" : "fail",
      required: "pass",
      passed: deterministic,
    },
    {
      label: "Overlay checklist and package",
      measured: overlay ? "pass" : "fail",
      required: "pass",
      passed: overlay,
    },
  ];
  const failures = live ? [] : regression(regressionMetrics, readBaseline());
  const report = {
    mode: live ? "live" : "mock",
    recordedAt: new Date().toISOString(),
    disclaimer: "Mock results say nothing about model quality.",
    gates,
    regressionMetrics,
    regressionFailures: failures,
    batches,
    planted,
    traps,
    deals,
    facts,
    passed: live
      ? falseAfter === 0
      : gates.every((g) => g.passed) &&
        failures.length === 0 &&
        planted.every((p) => p.result === "caught"),
    releaseBlockers: falseAfter ? ["False satisfied after simulated review"] : [],
  };
  fs.mkdirSync("eval", { recursive: true });
  fs.writeFileSync(`eval/${live ? "live" : "latest"}.json`, JSON.stringify(report, null, 2) + "\n");
  if (!live && report.passed) savePassingBaseline(report, process.argv.includes("--set-baseline"));
  writeScorecard();
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        gates,
        failures,
        planted: `${planted.filter((p) => p.result === "caught").length}/${planted.length}`,
        deals,
      },
      null,
      2,
    ),
  );
  await closeDb();
  if (!report.passed) process.exitCode = 1;
}
