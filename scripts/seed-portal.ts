import { portalWorkspace } from "../fixtures/portal/workspace";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { seedWorkspace } from "@/lib/seed";
import { createPortalLink, portalData } from "@/lib/portal/service";
import { personHome } from "@/lib/portal/map";
import {
  fixtureDeal,
  attestTruth,
  uploadFixture,
  confirmBoundaries,
  reviewTruth,
} from "../tests/helpers/deal-proof";
import { FIXTURE_HMAC_KEY } from "../fixtures/plans/shared";
import type { SessionContext } from "@/lib/workspace";
export async function seedPortal() {
  process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
  const seed = await seedWorkspace(),
    db = getDb();
  // Local, sample-only credentials. Hosted auth must provision the adviser through its provider.
  if (process.env.AUTH_DRIVER === "supabase")
    throw Error("Provision an adviser through hosted auth before seeding the portal.");
  const [adviser] = await db
    .insert(schema.appUsers)
    .values({
      email: "adviser@example.com",
      displayName: portalWorkspace.contact,
      passwordHash: hashPassword("acqfile-adviser"),
    })
    .onConflictDoUpdate({
      target: schema.appUsers.email,
      set: { displayName: portalWorkspace.contact },
    })
    .returning();
  await db
    .insert(schema.workspaceMembers)
    .values({ workspaceId: seed.workspaceId, userId: adviser!.id, role: "adviser" })
    .onConflictDoNothing();
  await db
    .update(schema.workspaces)
    .set({ firmName: portalWorkspace.firm })
    .where(eq(schema.workspaces.id, seed.workspaceId));
  const ctx: SessionContext = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic operator" },
    workspace: {
      workspaceId: seed.workspaceId,
      slug: "default",
      name: "Synthetic workspace",
      role: "admin",
    },
  };
  const result: Record<
    string,
    {
      id: string;
      people: {
        id: string;
        name: string;
        token: string;
        state: string;
        todo: number;
        tasks: { key: string; type: string; state: string; periods: string[] }[];
      }[];
    }
  > = {};
  for (const code of ["deal-a", "deal-b", "deal-c"]) {
    const [existing] = await db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.code, `Portal-${code}`));
    let id = existing?.id;
    if (!id) {
      const d = await fixtureDeal(ctx, code, "Portal");
      id = d.id;
      await attestTruth(ctx, d, 1, true);
      await uploadFixture(ctx, d, 1);
      await confirmBoundaries(ctx, d);
      if (code !== "deal-b") await reviewTruth(ctx, d);
    }
    const all = await portalData(id);
    await db
      .update(schema.deals)
      .set({
        contactName: portalWorkspace.contact,
        contactEmail: portalWorkspace.email,
        sendBy: portalWorkspace.sendBy,
      })
      .where(eq(schema.deals.id, id));
    const people = [];
    for (const party of all.data.parties.filter((p) =>
      all.mapped.tasks.some((t) => t.partyId === p.id),
    )) {
      const home = personHome(all.mapped, party.id, party.legalName);
      const token = await createPortalLink(
        {
          ...ctx,
          user: { ...ctx.user, id: adviser!.id },
          workspace: { ...ctx.workspace, role: "adviser" },
        },
        id,
        party.id,
      );
      people.push({
        id: party.id,
        name: party.legalName,
        token,
        state: home.state,
        todo: home.todo.length,
        tasks: home.tasks.map(({ key, type, state, periods }) => ({ key, type, state, periods })),
      });
    }
    result[code] = { id, people };
  }
  return result;
}
