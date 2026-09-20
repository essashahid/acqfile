import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { Parsed } from "./parse";
/** The scrubbed source blocks of a version come from its durable parse step; nothing else stores document text. */
export async function parsedVersion(versionId: string): Promise<Parsed | null> {
  const [step] = await getDb()
    .select()
    .from(schema.runSteps)
    .where(and(eq(schema.runSteps.documentVersionId, versionId), eq(schema.runSteps.stepName, "parse"), eq(schema.runSteps.status, "succeeded")))
    .orderBy(desc(schema.runSteps.completedAt))
    .limit(1);
  return (step?.outputJson as Parsed | undefined) ?? null;
}
