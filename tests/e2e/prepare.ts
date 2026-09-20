import "../../scripts/load-env";
import fs from "node:fs";
import { seedWorkspace } from "@/lib/seed";
import { closeDb } from "@/lib/db/client";
import {
  fixtureDeal,
  attestTruth,
  uploadFixture,
  confirmBoundaries,
  reviewTruth,
} from "../helpers/deal-proof";
import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";
import type { SessionContext } from "@/lib/workspace";
async function main() {
  process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
  const seed = await seedWorkspace();
  const ctx: SessionContext = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic operator" },
    workspace: {
      workspaceId: seed.workspaceId,
      slug: "default",
      name: "Synthetic workspace",
      role: "admin",
    },
  };
  const ids: Record<string, unknown> = {};
  for (const code of ["deal-a", "deal-b"]) {
    const d = await fixtureDeal(ctx, code, "Browser");
    await attestTruth(ctx, d, 1, true);
    await uploadFixture(ctx, d, 1);
    await confirmBoundaries(ctx, d);
    await reviewTruth(ctx, d);
    ids[code] = { id: d.id, bea: d.internal("bea") };
  }
  fs.writeFileSync("/tmp/acqfile-browser-deals.json", JSON.stringify(ids));
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
