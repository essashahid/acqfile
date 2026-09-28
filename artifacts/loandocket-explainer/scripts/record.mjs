// Records the LoanDocket walkthrough as the Operator on one prepared synthetic deal.
// Usage (from the repository root, app running on the dedicated sample database):
//   EXPLAINER_BASE_URL=http://localhost:3200 \
//   EXPLAINER_DATABASE_URL=postgres://localhost:5432/loandocket_explainer \
//   node artifacts/loandocket-explainer/scripts/record.mjs --deal VCS-2026-015 [--take r2-clean] [--overwrite]
// Output: work/<take>/{frames/, timeline.json, take.json, evidence/}
//   evidence/<deal>-<take>-lender-file-v<n>.zip   the ZIP exactly as downloaded (never rewritten)
//   evidence/zip-listing.txt, 00_Package_Report.html, workbook-inspection.md
// take.json is written last, only after every check passed; render.py refuses a take without it.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { launch, signIn, BASE, ROOT, WORK, OPERATOR, takeDir } from "./lib.mjs";
import { Recorder, CURSOR_SCRIPT, ZOOM_SCRIPT } from "./recorder.mjs";
import { inspectPackage } from "./inspect-package.mjs";

const { values: args } = parseArgs({
  options: {
    deal: { type: "string" },
    take: { type: "string" },
    overwrite: { type: "boolean", default: false },
  },
});
if (!args.deal) throw Error("Usage: record.mjs --deal <DEAL-CODE> [--take <name>] [--overwrite]");
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const TAKE = args.take ?? `take-${stamp}`;
const OUT = takeDir(TAKE);
const UPLOAD = path.join(WORK, "upload");
const ON_CAMERA = [
  "amended-purchase-agreement.pdf",
  "heller-2025-tax-return.pdf",
  "mcdermott-bank-statement-aug-2026.pdf",
];
const DEAL_NAME = "Varnholt Climate Services LLC";
const WORKSPACE = { slug: "default", name: "LoanDocket Demo Workspace" };
const ANSWER = {
  choice: "1,050,000",
  note: "Checked both pages. The signed amendment is the latest agreement.",
};
const DRAFT_ANCHOR = "We do not have this yet.";
const DRAFT_ADDITION =
  "\n\n2. Please send a corrected letter of intent and funding plan that show the $1,050,000 purchase price in the signed amendment.";

function assert(ok, msg) {
  if (!ok) throw Error(`Check failed: ${msg}`);
  console.log(`[check] ${msg}`);
}

if (fs.existsSync(OUT) && !args.overwrite)
  throw Error(
    `Take ${TAKE} already exists. Choose another --take, or pass --overwrite to move it aside.`,
  );

// ── Preflight: the dedicated synthetic database, workspace, role and a fresh deal ────
const dbUrl = process.env.EXPLAINER_DATABASE_URL;
if (!dbUrl)
  throw Error("Set EXPLAINER_DATABASE_URL to the dedicated loandocket_explainer database.");
{
  const u = new URL(dbUrl);
  if (u.pathname !== "/loandocket_explainer" || !["localhost", "127.0.0.1"].includes(u.hostname))
    throw Error(
      `EXPLAINER_DATABASE_URL must be the local loandocket_explainer database, not ${u.hostname}${u.pathname}.`,
    );
}
const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
const [deal] = await sql`
  select d.id, d.code, d.name, w.slug, w.name as workspace, m.role
  from deals d join workspaces w on w.id = d.workspace_id
  left join workspace_members m on m.workspace_id = w.id
    and m.user_id = (select id from app_users where email = ${OPERATOR.email})
  where d.code = ${args.deal}`;
if (!deal) throw Error(`No deal ${args.deal} in loandocket_explainer. Run prepare-deal.ts first.`);
assert(
  deal.slug === WORKSPACE.slug && deal.workspace === WORKSPACE.name,
  `deal is in "${WORKSPACE.name}"`,
);
assert(deal.name === DEAL_NAME, `deal is ${DEAL_NAME}`);
assert(deal.role === "reviewer", `${OPERATOR.email} has the reviewer (Operator) role`);
const [{ n: snapshots }] =
  await sql`select count(*)::int as n from snapshots where deal_id = ${deal.id}`;
const [{ n: answers }] =
  await sql`select count(*)::int as n from portal_responses where deal_id = ${deal.id}`;
const [{ n: uploaded }] = await sql`
  select count(*)::int as n from document_versions where deal_id = ${deal.id} and source_filename = any(${ON_CAMERA})`;
assert(
  snapshots === 0 && answers === 0 && uploaded === 0,
  `${deal.code} is fresh: no versions, answers or on-camera uploads yet`,
);
const uploads = fs.existsSync(UPLOAD) ? fs.readdirSync(UPLOAD).sort() : [];
assert(
  JSON.stringify(uploads) === JSON.stringify([...ON_CAMERA].sort()),
  "work/upload holds exactly the three on-camera files",
);

if (fs.existsSync(OUT)) {
  const aside = `${OUT}.replaced-${stamp}`;
  fs.renameSync(OUT, aside); // --overwrite: keep the old take beside the new one, nothing deleted
  console.log(`Moved the existing take to ${path.relative(ROOT, aside)}.`);
}

const D = `${BASE}/staff/deals/${deal.id}`;
const { browser, context } = await launch({ viewport: { width: 2880, height: 1620 }, scale: 1 });
await context.addInitScript(ZOOM_SCRIPT);
await context.addInitScript(CURSOR_SCRIPT);
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("response", (r) => {
  if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url().replace(BASE, "")}`);
});

// Off camera: sign in and confirm the app serves this deal from the same database.
await signIn(page);
await page.goto(`${D}/documents`);
await page.waitForLoadState("networkidle");
const header = await page.locator("body").innerText();
assert(
  header.includes(WORKSPACE.name) && header.includes("Operator"),
  "app header shows the demo workspace and the Operator role",
);
assert(header.includes("Synthetic data only"), 'app shows "Synthetic data only"');
assert(
  header.includes(deal.code) && header.includes(DEAL_NAME),
  `app serves ${deal.code} (${deal.id}) from loandocket_explainer`,
);

const rec = new Recorder(page, OUT);
const beat = (ms) => page.waitForTimeout(ms);
const mouse = { x: 1500, y: 900 };
async function glide(target, { steps = 34, dx = 0.5, dy = 0.5 } = {}) {
  const box = await target.boundingBox();
  if (!box) throw Error("Target not visible");
  const x = box.x + box.width * dx;
  const y = box.y + box.height * dy;
  await page.mouse.move(x, y, { steps });
  Object.assign(mouse, { x, y });
}
async function click(target, opts) {
  await target.scrollIntoViewIfNeeded();
  await glide(target, opts);
  await beat(250);
  await target.click();
}
async function smoothScrollTo(target, block = "center") {
  await target.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block);
  await beat(1100);
}
async function settle() {
  await page.waitForLoadState("networkidle");
  await beat(400);
}

await rec.start();
await page.mouse.move(mouse.x, mouse.y);
await beat(800);

// ── Scene 2: collect and organize ───────────────────────────────────────────────
rec.mark("s2-documents");
const add = page.getByRole("heading", { name: "Add documents" });
await smoothScrollTo(add, "start");
const input = page.getByLabel("Files or ZIP");
await glide(input, { dx: 0.08 });
await beat(400);
rec.mark("s2-choose");
await input.setInputFiles(uploads.map((f) => path.join(UPLOAD, f)));
await beat(1800);
rec.mark("s2-upload");
await click(page.getByRole("button", { name: "Upload batch", exact: true }));
await page
  .getByRole("status")
  .filter({ hasText: /Batch \d+: \d+ files received/ })
  .waitFor({ timeout: 120000 });
rec.mark("s2-received");
await beat(500);
await smoothScrollTo(page.getByRole("status").filter({ hasText: /files received/ }), "end");
await glide(page.getByRole("link", { name: "amended-purchase-agreement.pdf" }), { dx: 0.9 });
await beat(2200);
await settle();

rec.mark("s2-library");
const library = page.getByRole("heading", { name: "Library" });
await smoothScrollTo(library, "start");
await beat(900);
const party = page.locator('select[name="party"]');
await click(party);
await party.selectOption("Kiel McDermott");
await beat(500);
await click(page.getByRole("button", { name: "Filter", exact: true }));
await page.waitForURL(/party=/);
await settle();
rec.mark("s2-filtered");
await glide(page.getByRole("cell", { name: "2026-08" }).first());
await beat(2600);

// ── Scene 3: find what needs attention, open the source from Review ─────────────
rec.mark("s3-overview-nav");
await click(page.getByRole("link", { name: "Overview", exact: true }));
await page.waitForURL(new RegExp(`/staff/deals/${deal.id}$`));
await settle();
rec.mark("s3-overview");
await beat(900);
await page.evaluate(() => window.scrollBy({ top: 330, behavior: "smooth" }));
await beat(1000);
await glide(page.getByText("Personal federal tax return", { exact: true }).first());
await beat(2200);
await glide(page.getByText("Purchase prices", { exact: true }).last());
await beat(2200);
rec.mark("s3-compare-nav");
await click(page.getByRole("link", { name: /Compare sources/ }).first());
await page.waitForURL(/review/);
await settle();
rec.mark("s3-review");
await beat(700);
await glide(page.getByText("$1,050,000.00", { exact: true }).first());
await beat(1800);
await glide(page.getByText("$1,000,000.00", { exact: true }).first());
await beat(1800);
rec.mark("s3-source-nav");
await click(page.getByRole("link", { name: "amended-purchase-agreement.pdf" }).first());
await page.waitForURL(/\/documents\/[^/?]+\?/);
await settle();
const context_ = page.getByTestId("document-context");
const explanation = (await context_.innerText()).replace(/\s+/g, " ");
assert(
  /Purchase prices agree/.test(explanation) &&
    /The sources give different values/.test(explanation),
  "document page explains the price disagreement",
);
assert(
  !/No letter of intent|on file/.test(explanation),
  "document page does not claim the supporting documents are absent",
);
rec.mark("s3-document");
await glide(context_.getByText("The sources give different values."));
await beat(2600);
rec.mark("s3-values-nav");
await click(context_.getByRole("link", { name: "Compare values with their sources" }));
await page.waitForURL(/\/values\//);
await settle();
const pdf = page.locator('.pdf-page[aria-busy="false"] canvas[aria-label="Source page 1"]');
await pdf.waitFor({ timeout: 60000 });
rec.mark("s3-source");
await glide(page.getByText("$1,050,000.00", { exact: true }).first());
await beat(2200);
const pdfBox = await pdf.boundingBox();
await page.mouse.move(pdfBox.x + pdfBox.width * 0.62, pdfBox.y + pdfBox.height * 0.345, {
  steps: 30,
});
await beat(3600);

// ── Scene 4: record a preferred price, see it kept, follow up ───────────────────
rec.mark("s4-back-nav");
await page.goBack();
await page.waitForURL(/\/documents\/[^/]+\?/);
await settle();
await click(
  page.getByTestId("document-context").getByRole("link", { name: "Back to the review item" }),
);
await page.waitForURL(/\/review/);
await settle();
rec.mark("s4-review");
await beat(600);
rec.mark("s4-question-nav");
await click(page.getByRole("link", { name: "Record an answer" }));
await page.waitForURL(/questions/);
await settle();
rec.mark("s4-question");
await beat(1500);
const choice = page.getByLabel(ANSWER.choice, { exact: true });
await smoothScrollTo(choice);
await click(choice, { dx: 0.04 });
await beat(600);
rec.mark("s4-note");
const note = page.getByLabel(/Add a few words/);
await click(note, { dx: 0.3 });
await note.pressSequentially(ANSWER.note, { delay: 28 });
await beat(700);
rec.mark("s4-send");
await click(page.getByRole("button", { name: "Send my answer" }));
await page.waitForURL((u) => !u.pathname.includes("/questions/"));
await settle();
rec.mark("s4-sent");
const [saved] =
  await sql`select payload from portal_responses where deal_id = ${deal.id} and kind = 'answer' order by created_at desc limit 1`;
assert(
  saved?.payload?.choice === ANSWER.choice && saved?.payload?.note === ANSWER.note,
  "preferred price and reason were saved",
);
// Browser Back to the Review item the answer was opened from (off camera; the adviser page is cut).
await page.goBack();
await page.waitForURL(/questions/);
await page.goBack();
await page.waitForURL(/\/review/);
await settle();
rec.mark("s4-recorded");
const recorded = page.getByText(/^Answer recorded:/);
const recordedText = (await recorded.innerText()).replace(/\s+/g, " ");
assert(
  recordedText.includes(`Answer recorded: ${ANSWER.choice}.`) &&
    recordedText.includes("this stays open until they agree"),
  "Review shows the recorded answer and that the disagreement stays open",
);
assert(
  (await page.getByText("sources disagree").count()) > 0,
  "the price disagreement is still an open review item",
);
await glide(page.getByRole("link", { name: "View recorded answer" }), { dx: 0.8 });
await beat(3000);
rec.mark("s4-reopen-nav");
await click(page.getByRole("link", { name: "View recorded answer" }));
await page.waitForURL(/questions/);
await settle();
const earlier = page.getByRole("heading", { name: "Earlier answers" });
await smoothScrollTo(earlier, "start");
rec.mark("s4-reopened");
const history = (await earlier.locator("xpath=..").innerText()).replace(/\s+/g, " ");
assert(
  history.includes(ANSWER.choice) &&
    history.includes(ANSWER.note) &&
    history.includes("This answer refers to the details shown here."),
  "the saved answer and reason persist after reopening",
);
await glide(page.getByText(ANSWER.note, { exact: true }), { dx: 1.08, dy: 2.2 });
await beat(2600);
await page.goBack();
await page.waitForURL(/\/review/);
await settle();

rec.mark("s4-followups-nav");
await click(page.getByRole("link", { name: /^Follow-ups/ }));
await page.waitForURL(/follow-ups/);
await settle();
rec.mark("s4-followups");
await beat(800);
const tab = page.getByRole("tab", { name: /Kiel McDermott/ });
await click(tab);
await beat(900);
rec.mark("s4-draft");
const draft = page.locator("[role=tabpanel]:visible textarea");
const original = await draft.inputValue();
const at = original.indexOf(DRAFT_ANCHOR);
assert(at >= 0, "Kiel McDermott's draft contains the expected first request");
const expectedDraft =
  original.slice(0, at + DRAFT_ANCHOR.length) +
  DRAFT_ADDITION +
  original.slice(at + DRAFT_ANCHOR.length);
await click(draft, { dy: 0.45 });
await draft.evaluate((el, a) => {
  const i = el.value.indexOf(a) + a.length;
  el.focus();
  el.setSelectionRange(i, i);
}, DRAFT_ANCHOR);
await draft.pressSequentially(DRAFT_ADDITION, { delay: 22 });
await beat(900);
assert(
  (await draft.inputValue()) === expectedDraft,
  "the edited draft is exactly the expected complete text",
);
rec.mark("s4-copy");
await click(page.locator("[role=tabpanel]:visible").getByRole("button", { name: "Copy draft" }));
await beat(1600);
rec.mark("s4-copied");
const copied = await page.evaluate(() => navigator.clipboard.readText());
assert(copied === expectedDraft, '"Copy draft" copied the complete edited draft exactly');

// ── Scene 5: the lender file ────────────────────────────────────────────────────
rec.mark("s5-lender-nav");
await click(page.getByRole("link", { name: "Lender file", exact: true }).first());
await page.waitForURL(/lender-file/);
await settle();
rec.mark("s5-lender");
await beat(2400);
const create = page.getByRole("button", { name: "Create a version while work is outstanding" });
await smoothScrollTo(create);
await click(create);
await beat(1200);
rec.mark("s5-confirm");
await click(page.getByRole("button", { name: "Create version anyway" }));
const zipLink = page.getByRole("link", { name: "Download ZIP" }).first();
await zipLink.waitFor({ timeout: 120000 });
await settle();
rec.mark("s5-version");
await smoothScrollTo(zipLink);
await beat(900);
const download = page.waitForEvent("download");
await click(zipLink);
const file = await download;
const evidence = path.join(OUT, "evidence");
fs.mkdirSync(evidence, { recursive: true });
const suggested = file.suggestedFilename();
const version = Number(/_snapshot_(\d+)\.zip$/.exec(suggested)?.[1]);
assert(
  suggested.startsWith(`${deal.code}_`) && version > 0,
  `download ${suggested} names ${deal.code} and a version`,
);
const zipName = `${deal.code}-${TAKE}-lender-file-v${version}.zip`;
const zipPath = path.join(evidence, zipName);
await file.saveAs(zipPath);
assert(
  (await file.failure()) === null && fs.statSync(zipPath).size > 0,
  "the lender package download completed",
);
const [snap] = await sql`select number from snapshots where deal_id = ${deal.id}`;
const [{ n: snapCount }] =
  await sql`select count(*)::int as n from snapshots where deal_id = ${deal.id}`;
assert(
  snapCount === 1 && snap.number === version,
  `the deal has exactly one version, version ${version}`,
);
const inspected = await inspectPackage(zipPath, evidence, {
  dealCode: deal.code,
  dealName: DEAL_NAME,
  version,
  answer: ANSWER,
});
assert(
  true,
  `package is a valid ZIP for ${inspected.identity} with the recorded answer and open work (${inspected.paths} paths)`,
);
rec.mark("s5-downloaded");
await beat(1200);

// Open the report from the downloaded package, outside the app.
await page.goto(`file://${path.join(evidence, "00_Package_Report.html")}`);
await beat(500);
rec.mark("s5-report");
await page.mouse.move(2820, 1560, { steps: 20 });
await beat(3600);
rec.mark("s5-answer-nav");
const answerBlock = page
  .getByText(/^Answer recorded\. The supporting documents have not been corrected yet/)
  .first();
await answerBlock.evaluate((el) =>
  window.scrollTo({
    top: el.getBoundingClientRect().top + window.scrollY - 24,
    behavior: "smooth",
  }),
);
await beat(1100);
rec.mark("s5-answer");
await page.mouse.move(2820, 1560, { steps: 20 });
await beat(6000);

rec.mark("done");
await rec.stop();
await browser.close();

fs.writeFileSync(
  path.join(OUT, "take.json"),
  JSON.stringify(
    {
      take: TAKE,
      recordedAt: new Date().toISOString(),
      app: "local LoanDocket sample app (loandocket_explainer)",
      dealId: deal.id,
      dealCode: deal.code,
      dealName: DEAL_NAME,
      answer: ANSWER,
      draft: {
        sha256: createHash("sha256").update(expectedDraft).digest("hex"),
        text: expectedDraft,
      },
      package: {
        version,
        zip: zipName,
        downloadedAs: suggested,
        sha256: createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex"),
        listing: "zip-listing.txt",
        report: "00_Package_Report.html",
        inspection: "workbook-inspection.md",
      },
      frames: rec.frames.length,
    },
    null,
    1,
  ),
);
await sql.end();
console.log(
  `Recorded ${rec.frames.length} frames to ${path.relative(ROOT, OUT)}; evidence in ${path.relative(ROOT, evidence)}`,
);
