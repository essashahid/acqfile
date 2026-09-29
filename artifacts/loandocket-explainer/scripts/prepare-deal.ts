/**
 * Off-camera preparation for the LoanDocket explainer.
 *
 * Creates ONE dedicated synthetic deal in a dedicated sample database, using the same
 * service calls as `pnpm demo:cases seed` (saveDeal -> intake -> processDealRun) and the
 * D08 synthetic profile and files. Nothing is reviewed, answered or accepted here.
 *   - the seller's amended purchase agreement (D08 round 2, $1,050,000), Kiel McDermott's
 *     August bank statement and Jaylan Heller's 2025 personal tax return are held back and
 *     uploaded on camera through the normal Documents screen;
 *   - Kiel McDermott's 2025 personal tax return is never supplied, so it stays missing.
 *
 * Run from the repository root with a new code for every take (a take consumes its deal):
 *   DATABASE_URL=postgres://localhost:5432/loandocket_explainer \
 *   LOCAL_STORAGE_DIR=.data/explainer-storage \
 *   corepack pnpm exec tsx artifacts/loandocket-explainer/scripts/prepare-deal.ts VCS-2026-015
 */
import "../../../scripts/load-env";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/lib/db/client";
import { databaseUrl, env } from "@/lib/env";
import { saveDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { processDealRun } from "@/lib/deals/process";
import { assertSampleKey } from "@/lib/deals/identifiers";
import type { SessionContext } from "@/lib/workspace";

const CODE = process.argv[2] ?? "";
if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/.test(CODE))
  throw Error("Usage: prepare-deal.ts <NEW-DEAL-CODE>");
const CASE = "D08";
/** Held back from the first batch and uploaded on camera, under these plain names. */
const ON_CAMERA: Record<string, string> = {
  "purchase-round-2": "amended-purchase-agreement.pdf",
  "bank-aug": "mcdermott-bank-statement-aug-2026.pdf",
  "bea-personal-2025": "heller-2025-tax-return.pdf",
};
const NEVER_SUPPLIED = ["personal-2025"]; // stays missing and becomes a follow-up

type ManifestFile = {
  path: string;
  stored: string;
  sha256: string;
  batch: number;
  document: string;
};

async function main() {
  if (process.env.REAL_DATA_MODE !== "false") throw Error("Sample data only.");
  if (env().LLM_PROVIDER !== "mock") throw Error("Requires LLM_PROVIDER=mock.");
  if (!databaseUrl().endsWith("/loandocket_explainer"))
    throw Error("Point DATABASE_URL at the dedicated loandocket_explainer database.");
  assertSampleKey();

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .innerJoin(schema.appUsers, eq(schema.appUsers.id, schema.workspaceMembers.userId))
    .where(
      and(eq(schema.appUsers.email, "admin@example.com"), eq(schema.workspaces.slug, "default")),
    );
  if (!row) throw Error("Run `pnpm db:seed` against this database first.");
  const ctx: SessionContext = {
    user: {
      id: row.app_users.id,
      email: row.app_users.email,
      displayName: row.app_users.displayName,
    },
    workspace: {
      workspaceId: row.workspaces.id,
      slug: row.workspaces.slug,
      name: row.workspaces.name,
      role: row.workspace_members.role,
    },
  };

  const [existing] = await db.select().from(schema.deals).where(eq(schema.deals.code, CODE));
  if (existing)
    throw Error(`${CODE} already exists (${existing.id}); use a new code for a new take.`);

  const manifest = JSON.parse(
    fs.readFileSync(`fixtures/demo/generated/${CASE}/manifest.json`, "utf8"),
  );
  const files = manifest.files as ManifestFile[];
  for (const f of files) {
    const bytes = fs.readFileSync(`fixtures/demo/generated/${f.stored}`);
    if (createHash("sha256").update(bytes).digest("hex") !== f.sha256)
      throw Error(`Hash mismatch: ${f.path}`);
  }

  const id = await saveDeal(ctx, {
    ...manifest.draft,
    code: CODE,
    name: "Varnholt Climate Services LLC",
  });
  const initial = files.filter(
    (f) => f.batch === 1 && !(f.document in ON_CAMERA) && !NEVER_SUPPLIED.includes(f.document),
  );
  const upload = await intake(
    ctx,
    id,
    initial.map((f) => ({
      path: f.path,
      bytes: fs.readFileSync(`fixtures/demo/generated/${f.stored}`),
    })),
  );
  await processDealRun(ctx, id, upload.runId, { sleep: async () => {} });

  // Copy the on-camera files to a neutral folder the recording picks from.
  const out = "artifacts/loandocket-explainer/work/upload";
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const f of files.filter((x) => x.document in ON_CAMERA))
    fs.copyFileSync(`fixtures/demo/generated/${f.stored}`, `${out}/${ON_CAMERA[f.document]}`);
  console.log(
    `${CODE} ${id}: ${initial.length} files in first batch; on camera: ${Object.values(ON_CAMERA).join(", ")}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
