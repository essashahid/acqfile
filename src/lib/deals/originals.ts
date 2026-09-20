import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { originalAccessAllowed } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import { PUBLIC_VISITOR_ID, type SessionContext } from "@/lib/workspace";

export const ORIGINAL_ACCESS_MESSAGE =
  "Original documents are available to admin and operator roles only.";

/**
 * A35: serve an original to an authorized user and audit the open.
 * One event per signed link (its expiry identifies the open), not per page or range request.
 */
export async function openOriginal(
  context: SessionContext,
  dealId: string,
  versionId: string,
  link: number,
) {
  if (!originalAccessAllowed(context)) throw Error(ORIGINAL_ACCESS_MESSAGE);
  await requireDeal(context, dealId);
  const db = getDb();
  const [version] = await db
    .select()
    .from(schema.documentVersions)
    .where(
      and(
        eq(schema.documentVersions.id, versionId),
        eq(schema.documentVersions.dealId, dealId),
      ),
    );
  if (!version) return null;
  const [opened] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.dealId, dealId),
        eq(schema.events.actorId, context.user.id),
        eq(schema.events.action, "original_opened"),
        eq(schema.events.entityId, versionId),
        sql`${schema.events.maskedAfter}->>'link' = ${String(link)}`,
      ),
    )
    .limit(1);
  if (!opened) {
    // The anonymous demo visitor is audited under its fixed identity: a user row with no password and no membership.
    if (context.isPublic && context.user.id === PUBLIC_VISITOR_ID)
      await db
        .insert(schema.appUsers)
        .values({
          id: PUBLIC_VISITOR_ID,
          email: "public-visitor@example.com",
          displayName: "Public demo visitor",
        })
        .onConflictDoNothing();
    await db.insert(schema.events).values({
      dealId,
      actorId: context.user.id,
      action: "original_opened",
      entityType: "document_version",
      entityId: versionId,
      maskedAfter: {
        documentVersionId: versionId,
        contentHash: version.contentHash,
        link: String(link),
        openedAt: new Date().toISOString(),
      },
    });
  }
  return { version, bytes: await getStorage().get(version.storagePath) };
}
