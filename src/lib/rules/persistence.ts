import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { hashObject } from "@/lib/hash";
import { canonicalPack, resolvedYaml } from "./loader";
import type { ResolvedPack } from "./schema";
/** Called outside the pure engine; a hash identifies immutable exact content. */
export async function persistPackSnapshot(pack: ResolvedPack) {
  const content = JSON.parse(canonicalPack(pack));
  if (hashObject(content) !== pack.content_hash) throw new Error("Resolved pack hash mismatch");
  const db = getDb();
  await db
    .insert(schema.rulePackSnapshots)
    .values({
      pack: pack.pack,
      version: pack.version,
      overlayId: pack.overlay,
      contentHash: pack.content_hash,
      canonicalJson: content,
      resolvedYaml: resolvedYaml(pack),
    })
    .onConflictDoNothing({ target: schema.rulePackSnapshots.contentHash });
  const [row] = await db
    .select()
    .from(schema.rulePackSnapshots)
    .where(eq(schema.rulePackSnapshots.contentHash, pack.content_hash));
  return row;
}
