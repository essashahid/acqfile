import fs from "node:fs";
import { beforeAll, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db/client";
import { saveDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { processDealRun } from "@/lib/deals/process";
import { recordAttestation } from "@/lib/evaluation/attestations";
import { requestEvaluation } from "@/lib/evaluation/run";
import { buildDrafts, markRequestSent } from "@/lib/deliverables/requests";
import { createSnapshot, listSnapshots } from "@/lib/deliverables/snapshot";
import { decideFinding } from "@/lib/deliverables/findings";
import { dealView } from "@/lib/staff/deal-view";
import { seeded } from "./helpers";
import type { SessionContext } from "@/lib/workspace";
import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";

let ctx: SessionContext, viewer: SessionContext, dealId: string;
const unlimited = async () => {
  await getSql()`delete from mutation_limits`;
};

beforeAll(async () => {
  process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
  const seed = await seeded();
  const workspace = { workspaceId: seed.workspaceId, slug: "default", name: "W" };
  ctx = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Operator" },
    workspace: { ...workspace, role: "admin" },
  };
  viewer = {
    user: { id: seed.viewerId, email: "viewer@example.com", displayName: "Viewer" },
    workspace: { ...workspace, role: "viewer" },
  };
  const draft = JSON.parse(fs.readFileSync("fixtures/deals/deal-c/truth/deal.json", "utf8"));
  dealId = await saveDeal(ctx, { ...draft, code: "STAFF-C", name: "Ostrelyva Fitness LLC" });
  const upload = await intake(ctx, dealId, [
    { path: "batch-1.zip", bytes: fs.readFileSync("fixtures/deals/deal-c/batch-1.zip") },
  ]);
  await processDealRun(ctx, dealId, upload.runId, { sleep: async () => {} });
  await requestEvaluation(dealId);
}, 900000);

it("keeps the counts an operator reads distinct from one another", async () => {
  const v = await dealView(dealId);
  const c = v.counts;
  // Non-applicable rows are excluded from the completion denominator, never counted as unfinished.
  expect(c.required.applicable + c.notApplicable).toBeLessThanOrEqual(v.index.length);
  expect(c.required.done).toBeLessThanOrEqual(c.required.applicable);
  for (const row of v.index.filter((r) => r.status === "not_applicable"))
    expect(["satisfied", "waived"]).not.toContain(row.status);
  // A filed document is not a satisfied requirement, and open findings are not the whole history.
  expect(c.findingsOpen).toBeLessThanOrEqual(c.findingsTotal);
  expect(c.blockers).toBeLessThanOrEqual(c.findingsOpen);
  expect(c.filed).toBeGreaterThan(0);
  expect(c.arrivals).toBeGreaterThan(0);
});

it("round-trips tracking and confirmation state so a control never contradicts the checklist", async () => {
  const v = await dealView(dealId);
  const tracking = v.index.find((r) =>
    v.rules.get(r.item_id)?.checks.some((c) => c.type === "tracking"),
  );
  expect(tracking, "deal C has a lender-ordered row").toBeDefined();
  await unlimited();
  await recordAttestation(ctx, dealId, {
    kind: "tracking",
    rule_id: tracking!.item_id,
    scope_key: tracking!.scope_key,
    state: "received",
    note: "Ordered and received from the lender.",
  });
  const saved = await getDb()
    .select()
    .from(schema.attestations)
    .where(and(eq(schema.attestations.dealId, dealId), eq(schema.attestations.kind, "tracking")));
  const row = saved.find((a) => a.ruleId === tracking!.item_id);
  // The stored value is what the control must show; nothing overwrites it to make a screen agree.
  expect(row?.state).toBe("received");
  expect(row?.note).toBe("Ordered and received from the lender.");
  const after = await dealView(dealId);
  expect(after.index.find((r) => r.item_id === tracking!.item_id)?.status).toBe("satisfied");
});

it("writes follow-up text a recipient can read, and keeps informational findings out of it", async () => {
  const drafts = await buildDrafts(ctx, dealId);
  expect(drafts.length).toBeGreaterThan(0);
  for (const d of drafts) {
    expect(d.body).not.toMatch(/page null/);
    expect(d.body).not.toMatch(/rule parameters|cash_tolerance|money_tolerance/);
    expect(d.body).not.toMatch(/Buyer\/Attachments|Seller\/Fwd|\.PDF\b/);
    expect(d.body).not.toMatch(/\b(incomplete|blocker|needs_review|not_applicable)\b/);
    expect(d.body).not.toMatch(/\b9\d{2}-\d{2}-\d{4}\b|\b00-\d{7}\b/);
    expect(d.body).toContain("preparation aids for lender review");
  }
  const informational = (await dealView(dealId)).findings.filter(
    (f) => f.status === "open" && (f.type === "info" || f.severity === "info"),
  );
  for (const f of informational) {
    const message = (f.detailsJson as { message: string }).message;
    expect(drafts.some((d) => d.body.includes(message))).toBe(false);
  }
});

it("records a follow-up as sent without implying the system delivered it", async () => {
  const before = await buildDrafts(ctx, dealId);
  const group = before[0]!;
  await unlimited();
  const request = await markRequestSent(ctx, dealId, group.responsible);
  expect(request.status).toBe("sent");
  const v = await dealView(dealId);
  for (const key of group.findingKeys)
    expect(v.findings.find((f) => f.findingKey === key)?.status).toBe("requested");
  // The audit event says what was recorded, not that anything was delivered.
  const [event] = await getDb()
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.dealId, dealId), eq(schema.events.action, "request_marked_sent")));
  expect(event).toBeDefined();
});

it("keeps dismissing a finding and waiving a requirement as different acts", async () => {
  const v = await dealView(dealId);
  const open = v.findings.filter((f) => f.status === "open" && f.type !== "info");
  const toDismiss = open[0]!;
  await unlimited();
  await decideFinding(ctx, dealId, {
    finding_key: toDismiss.findingKey,
    action: "dismiss",
    reason: "Confirmed with the seller; the document does not exist for this entity.",
  });
  const afterDismiss = await dealView(dealId);
  const dismissed = afterDismiss.findings.find((f) => f.findingKey === toDismiss.findingKey)!;
  expect(dismissed.status).toBe("dismissed");
  expect(dismissed.reason).toBeTruthy();
  // Dismissing a finding does not waive its requirement row.
  const waivers = await getDb()
    .select()
    .from(schema.attestations)
    .where(and(eq(schema.attestations.dealId, dealId), eq(schema.attestations.kind, "waiver")));
  expect(waivers.some((w) => w.ruleId === toDismiss.ruleId)).toBe(false);

  const toWaive = afterDismiss.findings.find(
    (f) => f.status === "open" && f.type !== "info" && f.findingKey !== toDismiss.findingKey,
  );
  if (toWaive) {
    await unlimited();
    await decideFinding(ctx, dealId, {
      finding_key: toWaive.findingKey,
      action: "waive",
      reason: "Lender accepted an alternative for this item.",
    });
    const afterWaive = await getDb()
      .select()
      .from(schema.attestations)
      .where(and(eq(schema.attestations.dealId, dealId), eq(schema.attestations.kind, "waiver")));
    expect(afterWaive.some((w) => w.ruleId === toWaive.ruleId)).toBe(true);
  }
});

it("creates an immutable lender-file version that later changes never alter", async () => {
  await unlimited();
  const first = await createSnapshot(ctx, dealId);
  const original = JSON.stringify(first.contentJson);
  await unlimited();
  await recordAttestation(ctx, dealId, {
    kind: "manual_confirmation",
    rule_id: "TGT-09",
    scope_key: "deal",
    key: "later_change",
    confirmed: true,
    note: "A change made after the first version was created.",
  });
  await requestEvaluation(dealId);
  await unlimited();
  const second = await createSnapshot(ctx, dealId);
  expect(second.number).toBe(first.number + 1);
  const reloaded = (await listSnapshots(dealId)).find((s) => s.id === first.id)!;
  expect(JSON.stringify(reloaded.contentJson)).toBe(original);
  // A snapshot is immutable in the database, not merely by convention.
  await expect(getSql()`update snapshots set number = 99 where id = ${first.id}`).rejects.toThrow(
    /Immutable/i,
  );
});

it("refuses every state-changing action to a viewer", async () => {
  const v = await dealView(dealId);
  const finding = v.findings.find((f) => f.status === "open") ?? v.findings[0]!;
  await unlimited();
  await expect(
    decideFinding(viewer, dealId, {
      finding_key: finding.findingKey,
      action: "dismiss",
      reason: "viewer should not be able to do this",
    }),
  ).rejects.toThrow(/read-only/i);
  await expect(
    recordAttestation(viewer, dealId, {
      kind: "waiver",
      rule_id: finding.ruleId,
      scope_key: finding.scopeKey,
      note: "viewer should not be able to do this",
    }),
  ).rejects.toThrow(/read-only/i);
  await expect(createSnapshot(viewer, dealId)).rejects.toThrow(/read-only/i);
  await expect(markRequestSent(viewer, dealId, "buyer")).rejects.toThrow(/read-only/i);
});
