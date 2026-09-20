import fs from "node:fs";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { saveDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { openOriginal, ORIGINAL_ACCESS_MESSAGE } from "@/lib/deals/originals";
import { resetEnvCache } from "@/lib/env";
import { makePdf, seeded } from "./helpers";
import type { SessionContext, WorkspaceRole } from "@/lib/workspace";
let workspaceId: string, dealId: string, versionId: string;
const users: Record<Exclude<WorkspaceRole, "adviser">, string> = {
  admin: "",
  reviewer: "",
  viewer: "",
};
const ctx = (role: Exclude<WorkspaceRole, "adviser">, isPublic = false): SessionContext => ({
  user: {
    id: isPublic ? "00000000-0000-0000-0000-000000000000" : users[role],
    email: `${role}@example.com`,
    displayName: role,
  },
  workspace: { workspaceId, slug: "default", name: "Synthetic workspace", role },
  isPublic,
});
const events = () =>
  getDb()
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.dealId, dealId), eq(schema.events.action, "original_opened")));
beforeAll(async () => {
  process.env.PII_HMAC_KEY = "SYNTHETIC-ORIGINALS-TEST-HMAC-KEY-ONLY-2026";
  const seed = await seeded();
  workspaceId = seed.workspaceId;
  users.admin = seed.adminId;
  users.reviewer = seed.reviewerId;
  users.viewer = seed.viewerId;
  const draft = JSON.parse(fs.readFileSync("fixtures/deals/deal-a/truth/deal.json", "utf8"));
  dealId = await saveDeal(ctx("admin"), {
    ...draft,
    code: "ORIGINALS-A",
    name: "Varnholt Climate Services",
  });
  const result = await intake(ctx("admin"), dealId, [
    {
      path: "Buyer/synthetic-original.pdf",
      bytes: await makePdf(["SYNTHETIC", "Synthetic original for the A35 audit test"]),
    },
  ]);
  versionId = result.rows[0]!.documentVersionId;
});
afterAll(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});
it("A35.1: admin and operator roles open originals, the viewer role is refused", async () => {
  const admin = await openOriginal(ctx("admin"), dealId, versionId, 1_800_000_000);
  expect(admin?.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(admin?.version.id).toBe(versionId);
  const operator = await openOriginal(ctx("reviewer"), dealId, versionId, 1_800_000_000);
  expect(operator?.version.id).toBe(versionId);
  await expect(openOriginal(ctx("viewer"), dealId, versionId, 1_800_000_000)).rejects.toThrow(
    ORIGINAL_ACCESS_MESSAGE,
  );
  expect((await events()).some((e) => e.actorId === users.viewer)).toBe(false);
});
it("A35.2: every open writes one audit event with user, document version and time, not one per page", async () => {
  const before = await events();
  const link = 1_800_000_060;
  for (let request = 0; request < 3; request++)
    await openOriginal(ctx("admin"), dealId, versionId, link);
  const after = await events();
  const mine = after.filter(
    (e) => e.actorId === users.admin && (e.maskedAfter as { link: string }).link === String(link),
  );
  expect(mine).toHaveLength(1);
  expect(after.length - before.length).toBe(1);
  const event = mine[0]!;
  expect(event.entityType).toBe("document_version");
  expect(event.entityId).toBe(versionId);
  expect((event.maskedAfter as { openedAt: string }).openedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(event.createdAt).toBeTruthy();
  expect(JSON.stringify(event.maskedAfter)).not.toMatch(/SYNTHETIC|Synthetic original/);
  await openOriginal(ctx("admin"), dealId, versionId, link + 900);
  expect((await events()).length - before.length).toBe(2);
});
it("A35.4: public visitors preview originals only while the synthetic public demo is on", async () => {
  vi.stubEnv("PUBLIC_DEMO_MODE", "true");
  resetEnvCache();
  const visitor = await openOriginal(ctx("viewer", true), dealId, versionId, 1_800_001_000);
  expect(visitor?.version.id).toBe(versionId);
  vi.stubEnv("PUBLIC_DEMO_MODE", "false");
  resetEnvCache();
  await expect(openOriginal(ctx("viewer", true), dealId, versionId, 1_800_001_000)).rejects.toThrow(
    ORIGINAL_ACCESS_MESSAGE,
  );
});
