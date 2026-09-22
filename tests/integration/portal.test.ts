import { intake, parseVersion } from "@/lib/deals/intake";
import { seedWorkspace } from "@/lib/seed";
import type { SessionContext } from "@/lib/workspace";
import fs from "node:fs";
import { beforeAll, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { seedPortal } from "../../scripts/seed-portal";
import { getDb, schema } from "@/lib/db/client";
import {
  resolvePortal,
  portalData,
  createPortalLink,
  revokePortalLink,
  tellUs,
  keepDocument,
  answerQuestion,
  mayOpenOriginal,
  ownTask,
} from "@/lib/portal/service";
import { startUpload, uploadResult, photosPdf } from "@/lib/portal/upload";
import { personHome } from "@/lib/portal/map";
import {
  uploadFixture,
  confirmBoundaries,
  reviewTruth,
  unlimited,
  readTruth,
} from "../helpers/deal-proof";
import { parseArrival } from "@/lib/deals/parse";
import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";
import { makePdf } from "./helpers";
let seeded: Awaited<ReturnType<typeof seedPortal>>;
beforeAll(async () => {
  seeded = await seedPortal();
}, 180000);
const kiel = () => seeded["deal-a"]!.people.find((p) => p.name.startsWith("Kiel"))!;
it("tokens store only a digest, isolate parties and originals, and revoke on reissue", async () => {
  const person = kiel(),
    access = (await resolvePortal(person.token, true))!;
  const p = await portalData(access.deal.id);
  for (const other of p.mapped.tasks.filter((t) => t.partyId !== access.party.id)) {
    expect(() => ownTask(p.mapped, access.party.id, other.key)).toThrow();
    for (const id of other.versions) expect(await mayOpenOriginal(access, id)).toBe(false);
  }
  const another = await portalData(seeded["deal-b"]!.id);
  expect(() => ownTask(p.mapped, access.party.id, another.mapped.tasks[0]!.key)).toThrow();
  expect(await mayOpenOriginal(access, another.data.versions[0]!.id)).toBe(false);
  const links = await getDb().select().from(schema.portalLinks);
  expect(JSON.stringify(links)).not.toContain(person.token);
  expect((await resolvePortal(person.token))!.link.lastSeen).toBe("2026-09-15");
  const fresh = await createPortalLink(access.ctx, access.deal.id, access.party.id);
  expect(await resolvePortal(person.token)).toBeNull();
  person.token = fresh;
  expect(await resolvePortal(fresh)).not.toBeNull();
  const someone = seeded["deal-b"]!.people.find((p) => p.name.startsWith("Terrill"))!;
  const a = (await resolvePortal(someone.token))!;
  await revokePortalLink(a.ctx, a.deal.id, a.party.id);
  expect(await resolvePortal(someone.token)).toBeNull();
});
it("can't-send is audited and visible to the adviser without satisfying a row", async () => {
  const access = (await resolvePortal(kiel().token))!,
    before = await portalData(access.deal.id),
    task = before.mapped.tasks.find((t) => t.partyId === access.party.id && t.state === "To do")!;
  const response = await tellUs(access, task.key, {
    reason: "later",
    date: "2026-10-01",
    note: "I will send a new copy.",
  });
  const after = await portalData(access.deal.id);
  expect(after.data.index).toEqual(before.data.index);
  expect(after.mapped.tasks.find((t) => t.key === task.key)!.state).toBe("To do");
  expect(after.mapped.tasks.find((t) => t.key === task.key)!.response!.payload.note).toBe(
    "I will send a new copy.",
  );
  expect(response.auditEventId).toBeTruthy();
});
it("three distinct prices, one adviser answer, correction asks and no edited facts", async () => {
  const a = (await resolvePortal(kiel().token))!,
    before = await portalData(a.deal.id),
    q = before.mapped.questions.find((q) => q.title === "Which purchase price is right?")!;
  expect(q.values.sort()).toEqual(["2,400,000", "2,410,000", "2,425,000"]);
  expect(q.partyId).toBeNull();
  await expect(
    answerQuestion(a.ctx, a.deal.id, q.key, q.values[0]!, "", q.evidenceKey, a),
  ).rejects.toThrow();
  await answerQuestion(
    a.ctx,
    a.deal.id,
    q.key,
    "2,400,000",
    "Confirmed with the seller.",
    q.evidenceKey,
  );
  const after = await portalData(a.deal.id);
  expect(after.data.facts).toEqual(before.data.facts);
  expect(after.mapped.openQuestions.some((x) => x.key === q.key)).toBe(false);
  expect(
    after.mapped.tasks.filter((t) => t.sentence.includes("corrected copy")).length,
  ).toBeGreaterThan(0);
});
it("queued, slow and unsuccessful reads leave a usable recipient list", async () => {
  const a = (await resolvePortal(kiel().token))!,
    p = await portalData(a.deal.id),
    task = p.mapped.tasks.find(
      (t) => t.partyId === a.party.id && t.type === "TAX_PERSONAL" && t.periods.includes("2024"),
    )!;
  await unlimited();
  const work = await startUpload(a, task.key, [
    {
      name: "A readable document.pdf",
      bytes: await makePdf(["SYNTHETIC", "A note to the adviser"]),
    },
  ]);
  expect((await uploadResult(a, work.response.id)).state).toBe("checking");
  const other = (await resolvePortal(
    seeded["deal-a"]!.people.find((p) => p.name.startsWith("Jaylan"))!.token,
  ))!;
  await expect(uploadResult(other, work.response.id)).rejects.toThrow();
  await keepDocument(a, task.key);
  expect(
    (
      await getDb()
        .select()
        .from(schema.intakeReviews)
        .where(
          eq(
            schema.intakeReviews.documentVersionId,
            (work.response.payload.versions as string[])[0]!,
          ),
        )
    ).some((r) => r.type === "classification" && r.status === "open"),
  ).toBe(true);
  await getDb()
    .update(schema.portalResponses)
    .set({ createdAt: new Date(Date.now() - 21000) })
    .where(eq(schema.portalResponses.id, work.response.id));
  expect((await uploadResult(a, work.response.id)).state).toBe("review");
  await getDb()
    .update(schema.documentVersions)
    .set({ processingStatus: "failed" })
    .where(eq(schema.documentVersions.id, (work.response.payload.versions as string[])[0]!));
  expect((await uploadResult(a, work.response.id)).state).toBe("review");
  expect(
    personHome((await portalData(a.deal.id)).mapped, a.party.id, a.party.legalName).tasks.length,
  ).toBeGreaterThan(0);
});
it("ordered photos make an image-only PDF and unsupported images stay calm", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=",
    "base64",
  );
  const bytes = await photosPdf([
    { name: "first.png", bytes: png },
    { name: "second.png", bytes: png },
  ]);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  const parsed = await parseArrival(bytes, FIXTURE_HMAC_KEY);
  expect(parsed.pages).toBe(2);
  expect(parsed.blocks.every((b) => b.text.length < 100)).toBe(true);
  const a = (await resolvePortal(kiel().token))!,
    p = await portalData(a.deal.id),
    task = p.mapped.tasks.find((t) => t.partyId === a.party.id)!;
  await unlimited();
  const photo = await startUpload(a, task.key, [
    { name: "first.png", bytes: png },
    { name: "second.png", bytes: png },
  ]);
  expect((await uploadResult(a, photo.response.id)).state).toBe("review");
  await photo.work();
  expect((await uploadResult(a, photo.response.id)).state).toBe("review");
  await expect(
    photosPdf([{ name: "photo.heic", bytes: Buffer.from("not an image") }]),
  ).rejects.toThrow("Please choose a JPG, a PNG or a PDF.");
});
it("Deal B batch 2 really makes the lender file ready, preserving July on an August replacement", async () => {
  const old = await portalData(seeded["deal-b"]!.id);
  const ctx = (await resolvePortal(
    seeded["deal-b"]!.people.find((p) => p.name.startsWith("Abe"))!.token,
  ))!.ctx;
  const parties = old.data.parties;
  const d = {
    id: old.data.deal.id,
    code: "deal-b",
    truth: readTruth("deal-b", "documents"),
    external: (id: string) => parties.find((p) => p.id === id)?.externalKey ?? id,
    internal: (id: string) => parties.find((p) => p.externalKey === id)?.id ?? id,
  };
  await uploadFixture(ctx, d, 2);
  await confirmBoundaries(ctx, d);
  await reviewTruth(ctx, d);
  const p = await portalData(d.id);
  expect(p.mapped.ready).toBe(true);
  expect(p.mapped.openQuestions).toHaveLength(0);
  const a = (await resolvePortal(
    seeded["deal-b"]!.people.find((p) => p.name.startsWith("Abe"))!.token,
  ))!;
  const task = p.mapped.tasks.find((t) => t.partyId === a.party.id && t.type === "BANK_STATEMENT")!;
  const bank = p.data.segments.filter(
    (s) => task.versions.includes(s.documentVersionId) && s.docType === "BANK_STATEMENT",
  );
  const july = bank.find((s) => s.period === "2026-07")!,
    aug = bank.find((s) => s.period === "2026-08")!;
  const v = p.data.versions.find((v) => v.id === aug.documentVersionId)!,
    doc = d.truth.find((x: { hash: string }) => x.hash === v.contentHash);
  const source = fs.readFileSync("fixtures/deals/deal-b/" + doc.file);
  const pdf = await PDFDocument.load(source);
  pdf.setSubject("Replacement selected by sender");
  const bytes = Buffer.from(await pdf.save());
  await unlimited();
  const work = await startUpload(a, task.key, [{ name: "August copy.pdf", bytes }], v.id);
  await work.work();
  const rows = await getDb().select().from(schema.segments).where(eq(schema.segments.dealId, d.id));
  expect(rows.find((s) => s.id === july.id)!.isCurrent).toBe(true);
  expect(rows.find((s) => s.id === aug.id)!.isCurrent).toBe(false);
  const newId = (work.response.payload.versions as string[])[0]!;
  expect(
    rows.some((s) => s.documentVersionId === newId && s.isCurrent && s.period === "2026-08"),
  ).toBe(true);
});

it("a wrong-person upload cannot replace or add that person's current evidence", async () => {
  const a = (await resolvePortal(kiel().token))!,
    before = await portalData(a.deal.id);
  const other = before.data.parties.find((p) => p.legalName.startsWith("Jaylan"))!;
  const task = before.mapped.tasks.find(
    (t) => t.partyId === a.party.id && t.type === "TAX_PERSONAL" && t.periods.includes("2024"),
  )!;
  const source = readTruth("deal-a", "documents").find(
    (d: { segments: { doc_type: string; party_id: string }[] }) =>
      d.segments.some((s) => s.doc_type === "TAX_PERSONAL" && s.party_id === "bea"),
  );
  const input = await PDFDocument.load(fs.readFileSync("fixtures/deals/deal-a/" + source.file)),
    pdf = await PDFDocument.create();
  pdf.addPage((await pdf.copyPages(input, [0]))[0]!);
  pdf.setSubject("A mistaken personal upload");
  await unlimited();
  const work = await startUpload(a, task.key, [
    { name: "A return.pdf", bytes: Buffer.from(await pdf.save()) },
  ]);
  await work.work();
  const after = await portalData(a.deal.id);
  expect(
    after.data.segments
      .filter((s) => s.partyId === other.id)
      .map((s) => s.id)
      .sort(),
  ).toEqual(
    before.data.segments
      .filter((s) => s.partyId === other.id)
      .map((s) => s.id)
      .sort(),
  );
  expect(after.data.facts.filter((f) => f.subjectPartyId === other.id)).toEqual(
    before.data.facts.filter((f) => f.subjectPartyId === other.id),
  );
  expect((await uploadResult(a, work.response.id)).notice).toContain("2023");
});

it("sample reseed preserves existing deals, facts and decisions while reissuing links", async () => {
  const db = getDb();
  const before = await db.select().from(schema.facts);
  const versions = await db.select().from(schema.documentVersions);
  const again = await seedPortal();
  for (const code of Object.keys(seeded)) expect(again[code]!.id).toBe(seeded[code]!.id);
  expect(await db.select().from(schema.facts)).toEqual(before);
  expect(await db.select().from(schema.documentVersions)).toEqual(versions);
});

it("follow-up uploads hash a repeated synthetic identifier like the seed, and reject server key drift", async () => {
  const seed = await seedWorkspace();
  const ctx: SessionContext = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Sample operator" },
    workspace: { workspaceId: seed.workspaceId, slug: "default", name: "Sample", role: "admin" },
  };
  const dealId = seeded["deal-a"]!.id;
  const facts = await getDb().select().from(schema.facts).where(eq(schema.facts.dealId, dealId));
  const parties = await getDb()
    .select()
    .from(schema.parties)
    .where(eq(schema.parties.dealId, dealId));
  const target = parties.find((p) => p.externalKey === "target")!;
  const identifier = facts.find(
    (f) =>
      f.attribute === "party.identifier" &&
      f.subjectPartyId === target.id &&
      (f.valueJson as { last_four: string }).last_four === "4567",
  )!.valueJson as { hmac: string };
  const bytes = await makePdf(["SYNTHETIC follow-up identifier", "EIN: 00-1234567"]);
  await unlimited();
  const upload = await intake(ctx, dealId, [{ path: "identifier-follow-up.pdf", bytes }]);
  const parsed = await parseVersion(ctx, dealId, upload.rows[0]!.documentVersionId, upload.runId);
  expect(parsed.identifiers.find((i) => i.last_four === "4567")!.hmac).toBe(identifier.hmac);
  const previous = process.env.PII_HMAC_KEY;
  try {
    process.env.PII_HMAC_KEY = "different-server-key-that-is-long-enough";
    await expect(intake(ctx, dealId, [{ path: "another-follow-up.pdf", bytes }])).rejects.toThrow(
      /key mismatch/,
    );
  } finally {
    process.env.PII_HMAC_KEY = previous;
  }
});
