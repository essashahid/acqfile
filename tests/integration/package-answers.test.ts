import { beforeAll, expect, it } from "vitest";
import fs from "node:fs";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { intake } from "@/lib/deals/intake";
import { processDealRun } from "@/lib/deals/process";
import { reviewFact } from "@/lib/extract/review";
import { answerQuestion, portalData } from "@/lib/portal/service";
import { buildIndex } from "@/lib/deliverables/index-build";
import { createSnapshot, type SnapshotContent } from "@/lib/deliverables/snapshot";
import { packageZip } from "@/lib/deliverables/package";
import { demoManifest, seedDemoCase } from "../../scripts/demo-case-seed";
import { unlimited } from "../helpers/deal-proof";
import { makePdf, seeded } from "./helpers";
import type { SessionContext } from "@/lib/workspace";

let ctx: SessionContext;
let dealId: string;
beforeAll(async () => {
  const s = await seeded();
  process.env.ACQFILE_SAMPLE_MODE = "true";
  process.env.REAL_DATA_MODE = "false";
  process.env.DEMO_CASE_WORKSPACE_ID = s.workspaceId;
  ctx = {
    user: { id: s.reviewerId, email: "reviewer@example.com", displayName: "Sample reviewer" },
    workspace: { workspaceId: s.workspaceId, name: "Sample", slug: "default", role: "reviewer" },
  };
  await unlimited();
  dealId = await seedDemoCase({ ...ctx, workspace: { ...ctx.workspace, role: "admin" } }, "D08");
  // The seller's amended agreement ($1,050,000) and one genuinely unknown file arrive.
  const amended = demoManifest("D08").files.find((f) => f.document === "purchase-round-2")!;
  const upload = await intake(ctx, dealId, [
    {
      path: "amended-purchase-agreement.pdf",
      bytes: fs.readFileSync(`fixtures/demo/generated/${amended.stored}`),
    },
    {
      path: "meeting-notes.pdf",
      bytes: await makePdf(["Synthetic meeting notes", "No document type"]),
    },
  ]);
  await processDealRun(ctx, dealId, upload.runId, { sleep: async () => {} });
}, 240_000);

const priceFacts = async () =>
  (
    await getDb()
      .select()
      .from(schema.facts)
      .where(
        and(
          eq(schema.facts.dealId, dealId),
          eq(schema.facts.attribute, "deal.purchase_price"),
          eq(schema.facts.isCurrent, true),
        ),
      )
  )
    .map((f) => [f.id, f.recordVersion, JSON.stringify(f.valueJson), f.routingStatus])
    .sort();
const book = async (bytes: Buffer) => {
  const zip = await JSZip.loadAsync(bytes);
  return {
    zip,
    html: await zip.file("00_Package_Report.html")!.async("string"),
    workbook: XLSX.read(await zip.file("00_Package_Workbook.xlsx")!.async("nodebuffer")),
  };
};
const rows = (b: XLSX.WorkBook, name: string) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(b.Sheets[name]!);
const priceFinding = (content: SnapshotContent) =>
  content.findings.find((f) => f.rule_id === "CON-03" && f.type === "conflict")!;

let firstId = "";
let firstBytes: Buffer;
let firstContent: SnapshotContent;

it("freezes a current answer beside the open disagreement without changing any source fact", async () => {
  const question = (await portalData(dealId)).mapped.questions.find(
    (q) => q.title === "Which purchase price is right?",
  )!;
  expect(question.values.sort()).toEqual(["1,000,000", "1,050,000"]);
  const before = await priceFacts();
  await answerQuestion(
    ctx,
    dealId,
    question.key,
    "1,050,000",
    "Checked both pages. The signed amendment is the latest agreement.",
    question.evidenceKey,
  );
  // Choosing a value is not a correction: facts and the disagreement are unchanged.
  expect(await priceFacts()).toEqual(before);
  const finding = (await buildIndex(dealId)).findings.find((f) => f.findingKey === question.key)!;
  expect(finding.status).toBe("open");

  const first = await createSnapshot(ctx, dealId);
  firstId = first.id;
  firstContent = first.contentJson as SnapshotContent;
  expect(firstContent.format).toBe(3);
  expect(firstContent.previous_version).toBeNull();
  // Only the compared prices, in the rule's document order, and the declared price.
  const price = priceFinding(firstContent);
  expect(price.problem_title).toBe("Purchase prices do not agree");
  expect(price.sides.map((s) => [s.source, s.display])).toEqual([
    ["Letter of intent", "$1,000,000"],
    ["Purchase agreement", "$1,050,000"],
    ["Funding plan", "$1,000,000"],
    ["Deal profile", "$1,000,000"],
  ]);
  expect(price.evidence_consulted!.map((e) => e.kind)).toContain("Document details");
  const answer = priceFinding(firstContent).answer!;
  expect(answer).toMatchObject({
    state: "current",
    selection: "1,050,000",
    selected_value: true,
    explanation: "Checked both pages. The signed amendment is the latest agreement.",
    // Attribution comes from the stored account behind the audit event.
    recorded_by: "Demo Reviewer (reviewer@example.com)",
    documents_corrected: false,
  });
  expect(answer.supporting.map((s) => s.document)).toEqual(["Purchase agreement"]);
  expect(answer.supporting[0]!.original_file).toBe("amended-purchase-agreement.pdf");
  expect(answer.corrections_needed.map((s) => [s.document, s.value]).sort()).toEqual([
    ["Funding plan", "1,000,000"],
    ["Letter of intent", "1,000,000"],
  ]);
  for (const s of [...answer.supporting, ...answer.corrections_needed])
    expect(firstContent.manifest.some((m) => m.package_path === s.package_path)).toBe(true);

  firstBytes = (await packageZip(dealId, firstId)).bytes;
  const { html, workbook } = await book(firstBytes);
  expect(html).toContain("Answer recorded (current)");
  expect(html).toContain("Corrections still needed");
  expect(html).toContain("No. The documents still disagree; the answer does not change them.");
  expect(html).not.toMatch(/needs_review|received_with_issues|later_lender|party_id/);
  expect(html).toContain("<h3>Purchase prices do not agree</h3>");
  expect(html).toContain(
    "Required action: Correct the letter of intent and funding plan, or provide updated documents, so the cited sources show the same purchase price.",
  );
  expect(html).not.toMatch(/Purchase prices agree|Values agree across the named sources/);
  expect(html).toContain("<h2>Initial version</h2>");
  expect(rows(workbook, "Recorded answers")[0]).toMatchObject({
    "Answer status": "Current",
    "Recorded selection": "1,050,000",
    "Supporting documents corrected": "No",
    "Disagreement status": "Open",
  });
  const log = rows(workbook, "Change log").filter((r) => r.Action === "Answer recorded");
  expect(log).toHaveLength(1);
  expect(log[0]!.Action).toBe("Answer recorded");
  expect(String(log[0]!.Detail)).toBe(
    "Which purchase price is right?: 1,050,000 — “Checked both pages. The signed amendment is the latest agreement.”",
  );
  expect(String(log[0]!.At)).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC$/);
});

it("keeps known supporting documents named, and genuinely unfiled documents unfiled", async () => {
  const paths = firstContent.manifest.map((m) => m.package_path);
  const heller = paths.filter((p) =>
    /^Z_Unfiled_or_Not_Required\/SUPPORTING_BANK_STATEMENT_Jaylan-Heller_2026-0[78]_[0-9a-f]{8}\.pdf$/.test(
      p,
    ),
  );
  expect(heller).toHaveLength(2);
  expect(paths.filter((p) => p.includes("Jaylan-Heller") && p.includes("UNFILED"))).toEqual([]);
  expect(
    paths.some((p) => /^Z_Unfiled_or_Not_Required\/UNFILED_meeting-notes_unassigned_/.test(p)),
  ).toBe(true);
  const { zip, html } = await book(firstBytes);
  for (const p of heller) expect(zip.file(p)).not.toBeNull();
  expect(html).toContain(
    "Additional supporting document</td><td>Bank statement</td><td>Jaylan Heller",
  );
});

it("shows an answer as not current once the evidence changes, and leaves the older version unchanged", async () => {
  // A reviewer reopens the letter of intent's price: the disagreement's evidence changes.
  const [loi] = await getDb()
    .select({ fact: schema.facts })
    .from(schema.facts)
    .innerJoin(schema.segments, eq(schema.segments.id, schema.facts.segmentId))
    .where(
      and(
        eq(schema.facts.dealId, dealId),
        eq(schema.facts.attribute, "deal.purchase_price"),
        eq(schema.facts.isCurrent, true),
        eq(schema.segments.docType, "LOI"),
      ),
    );
  await reviewFact(ctx, dealId, {
    fact_id: loi!.fact.id,
    expected_record_version: loi!.fact.recordVersion,
    action: "reopen",
    comment: "Rechecking the letter of intent against the amendment.",
  });
  const question = (await portalData(dealId)).mapped.questions.find(
    (q) => q.title === "Which purchase price is right?",
  )!;
  expect(question.answered).toBe(false);

  const second = await createSnapshot(ctx, dealId);
  const answer = priceFinding(second.contentJson as SnapshotContent).answer!;
  expect(answer.state).toBe("not_current");
  expect(answer.corrections_needed).toEqual([]);
  expect(answer.summary).toMatch(/not current/);
  const { html } = await book((await packageZip(dealId, second.id)).bytes);
  expect(html).toContain("Not current: earlier evidence");
  expect(html).not.toContain("Answer recorded (current)");

  // The earlier version keeps its frozen answer and its exact bytes.
  const [stored] = await getDb()
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.id, firstId));
  expect(stored!.contentJson).toEqual(firstContent);
  expect((await packageZip(dealId, firstId)).bytes.equals(firstBytes)).toBe(true);
});

it("exports no internal record id, account id or finding key, and names the reviewer", async () => {
  const db = getDb();
  // Every id this deal's records carry, from every table that belongs to a deal, plus the
  // accounts and workspace behind them and the findings' keys.
  const tables = (await db.execute(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'deal_id'`,
  )) as unknown as { table_name: string }[];
  const ids = new Set<string>([dealId, ctx.workspace.workspaceId]);
  for (const { table_name } of tables) {
    const has = (await db.execute(
      sql`select 1 from information_schema.columns where table_schema = 'public' and table_name = ${table_name} and column_name = 'id'`,
    )) as unknown as unknown[];
    if (!has.length) continue;
    const found = (await db.execute(
      sql`select id::text as id from ${sql.identifier(table_name)} where deal_id = ${dealId}`,
    )) as unknown as { id: string }[];
    for (const r of found) ids.add(r.id);
  }
  for (const u of await db.select({ id: schema.appUsers.id }).from(schema.appUsers)) ids.add(u.id);
  for (const f of await db
    .select({ key: schema.findings.findingKey })
    .from(schema.findings)
    .where(eq(schema.findings.dealId, dealId)))
    ids.add(f.key);
  expect(ids.size).toBeGreaterThan(100);

  // The reviewer accepts the reopened letter-of-intent price: a value with a named reviewer.
  const [loi] = await db
    .select({ fact: schema.facts })
    .from(schema.facts)
    .innerJoin(schema.segments, eq(schema.segments.id, schema.facts.segmentId))
    .where(
      and(
        eq(schema.facts.dealId, dealId),
        eq(schema.facts.attribute, "deal.purchase_price"),
        eq(schema.facts.isCurrent, true),
        eq(schema.segments.docType, "LOI"),
      ),
    );
  await reviewFact(ctx, dealId, {
    fact_id: loi!.fact.id,
    expected_record_version: loi!.fact.recordVersion,
    action: "accept",
    comment: "Letter of intent rechecked.",
  });
  await createSnapshot(ctx, dealId);

  const versions = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.dealId, dealId));
  const current = versions.filter((v) => (v.contentJson as SnapshotContent).format === 3);
  expect(current.length).toBeGreaterThanOrEqual(3);
  for (const version of current) {
    const zip = await JSZip.loadAsync((await packageZip(dealId, version.id)).bytes);
    const parts = [Object.keys(zip.files).join("\n")];
    parts.push(await zip.file("00_Package_Report.html")!.async("string"));
    const workbook = await JSZip.loadAsync(
      await zip.file("00_Package_Workbook.xlsx")!.async("nodebuffer"),
    );
    for (const entry of Object.values(workbook.files))
      if (!entry.dir) parts.push(await entry.async("string"));
    const text = parts.join("\n");
    // Braced GUIDs are Office Open XML schema constants SheetJS writes, not records.
    const uuid = /(?<!\{)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(text);
    expect(uuid && text.slice(uuid.index - 120, uuid.index + 40)).toBeNull();
    for (const id of ids) expect(text, `${id} in version ${version.number}`).not.toContain(id);
    // Identifier facts are stored with a keyed hash; the package shows only the last four.
    expect(text).not.toMatch(/hmac/i);
  }

  // The accepted letter-of-intent price names the reviewer who accepted it.
  const latest = current.sort((a, b) => b.number - a.number)[0]!;
  const { workbook } = await book((await packageZip(dealId, latest.id)).bytes);
  const reviewed = rows(workbook, "Source record").filter((r) => r.Reviewer);
  expect(reviewed.length).toBeGreaterThan(0);
  expect(new Set(reviewed.map((r) => r.Reviewer))).toEqual(
    new Set(["Demo Reviewer (reviewer@example.com)"]),
  );
  // The internal record keeps the account id.
  const record = (latest.contentJson as SnapshotContent).source_record.find((r) => r.reviewer)!;
  expect(record.reviewer).toBe(ctx.user.id);
});

it("renders a version frozen before answers existed without inventing one", async () => {
  const legacy = structuredClone(firstContent) as SnapshotContent;
  delete legacy.format;
  for (const f of legacy.findings) delete f.answer;
  delete legacy.preparation!.groups;
  const [row] = await getDb()
    .insert(schema.snapshots)
    .values({
      dealId,
      number: 99,
      evaluationId: (await buildIndex(dealId)).evaluation!.id,
      contentJson: legacy,
      diffJson: (
        await getDb().select().from(schema.snapshots).where(eq(schema.snapshots.id, firstId))
      )[0]!.diffJson,
      actorId: ctx.user.id,
    })
    .returning();
  const { html, workbook } = await book((await packageZip(dealId, row!.id)).bytes);
  expect(html).not.toContain("Recorded selection");
  expect(html).toContain("Conflicts — for lender review");
  expect(workbook.SheetNames).not.toContain("Recorded answers");
});
