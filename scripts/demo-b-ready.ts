import "./load-env";
import { eq } from "drizzle-orm";
import { getDb, schema, closeDb } from "@/lib/db/client";
import { seedWorkspace } from "@/lib/seed";
import { portalData } from "@/lib/portal/service";
import {
  readTruth,
  uploadFixture,
  confirmBoundaries,
  reviewTruth,
} from "../tests/helpers/deal-proof";
import { FIXTURE_HMAC_KEY } from "../fixtures/plans/shared";
import type { SessionContext } from "@/lib/workspace";
async function main() {
  process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
  const seed = await seedWorkspace(),
    db = getDb();
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.code, "Portal-deal-b"));
  if (!deal) throw Error("Run pnpm demo:seed first.");
  const ctx: SessionContext = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic operator" },
    workspace: {
      workspaceId: seed.workspaceId,
      slug: "default",
      name: "Synthetic workspace",
      role: "admin",
    },
  };
  const parties = await db.select().from(schema.parties).where(eq(schema.parties.dealId, deal.id));
  const d = {
    id: deal.id,
    code: "deal-b",
    truth: readTruth("deal-b", "documents"),
    external: (id: string) => parties.find((p) => p.id === id)?.externalKey ?? id,
    internal: (key: string) => parties.find((p) => p.externalKey === key)?.id ?? key,
  };
  await uploadFixture(ctx, d, 2);
  await confirmBoundaries(ctx, d);
  await reviewTruth(ctx, d);
  if (!(await portalData(deal.id)).mapped.ready)
    throw Error("Lender file still has work outstanding");
  console.log(
    "Deal B's authored second batch has been processed and reviewed. The lender file is ready.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
