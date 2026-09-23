import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assertDemo, demoAllowed } from "./access";
import { DEMO_CASES, demoCase, demoCode } from "./registry";
import type { SessionContext } from "@/lib/workspace";
export const DEMO_MARKER = "synthetic-demo-case-v1";
export async function markedCase(ctx: SessionContext, caseId: string) {
  assertDemo(ctx);
  const c = demoCase(caseId);
  const [deal] = await getDb()
    .select()
    .from(schema.deals)
    .where(
      and(
        eq(schema.deals.workspaceId, ctx.workspace.workspaceId),
        eq(schema.deals.code, demoCode(c.id)),
      ),
    );
  if (!deal) return null;
  const [marker] = await getDb()
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.dealId, deal.id), eq(schema.events.action, DEMO_MARKER)));
  const value = marker?.maskedAfter as { caseId?: string; workspaceId?: string } | undefined;
  if (value?.caseId !== c.id || value.workspaceId !== ctx.workspace.workspaceId)
    throw Error("Refusing an unmarked demo target.");
  return { ...c, seededDealId: deal.id };
}
export async function availableCases(ctx: SessionContext) {
  if (!demoAllowed(ctx)) return [];
  const found = await Promise.all(DEMO_CASES.map((c) => markedCase(ctx, c.id)));
  return found.filter((c) => c !== null);
}
