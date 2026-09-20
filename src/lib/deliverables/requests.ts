import { scrubPayload } from "@/lib/deals/identifiers";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assertMutation } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import type { SessionContext } from "@/lib/workspace";
import { buildIndex } from "./index-build";
import type { Rule } from "@/lib/rules/schema";
import { documentName, factValue } from "@/lib/staff/labels";

type Finding = typeof schema.findings.$inferSelect;
type Detail = {
  fact_id: string | null;
  value: unknown;
  file: string;
  page: number | null;
  quote: string;
};
/**
 * A49: one deterministic draft per responsible party, written for the person who receives it.
 * Internal identifiers, file paths, rule parameters and enum names never reach this text; the
 * operator reads that detail on the Review screen instead.
 */
export type DraftItem = {
  /** What the recipient must do, in their words. */
  ask: string;
  /** Why we are asking, from the evidence we hold. */
  because: string;
  /** Each side of a disagreement, named and sourced. */
  sides: { value: string; source: string }[];
};

export function draftItems(
  findings: Finding[],
  rules: Map<string, Rule>,
  partyOf: (id: string) => string,
  documentOf: (versionId: string, page: number | null) => string,
): DraftItem[] {
  return findings.map((f) => {
    const rule = rules.get(f.ruleId);
    const details = (f.detailsJson as { message: string; details: Detail[] }) ?? {
      message: "",
      details: [],
    };
    const subject = partyOf(f.scopeKey);
    const who = subject && subject !== "deal" ? ` for ${subject}` : "";
    const named = midSentence(
      rule?.accepts?.length
        ? documentName(rule.accepts[0]!)
        : (rule?.title ?? "outstanding document"),
    );
    const what = `${f.period ? `${f.period} ` : ""}${named}`;
    const condition = lowerFirst(conditionOf(details.message));
    if (f.type === "conflict")
      return {
        ask: `Please confirm which value is correct${who}.`,
        because:
          "The documents supplied give different values, so we do not know which one to use.",
        // Only a conflict needs both sides; every other type is a single clear request.
        sides: details.details
          .filter((d) => d.page !== null)
          .map((d) => ({
            value: factValue("", "text", d.value),
            source: documentOf(d.file, d.page),
          }))
          .filter((s, i, all) => all.findIndex((o) => o.value === s.value) === i),
      };
    if (f.type === "missing")
      return {
        ask: `Please send the ${what}${who}.`,
        because: "We do not have this yet.",
        sides: [],
      };
    if (f.type === "stale")
      return {
        ask: `Please send a more recent ${what}${who}.`,
        because: "The copy we hold is older than this file allows.",
        sides: [],
      };
    if (f.type === "incomplete")
      return {
        ask: `Please send a complete ${what}${who}.`,
        because: `We have a copy, but we could not confirm that ${condition}.`,
        sides: [],
      };
    return {
      ask: `Please check the ${what}${who}.`,
      because: `We could not confirm that ${condition}.`,
      sides: [],
    };
  });
}

/** A document name inside a sentence: proper form numbers keep their capitals, prose does not. */
const midSentence = (name: string) =>
  /^(SBA|IRS|EIN|QOE|CIM)\b/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);

const conditionOf = (message: string) => message.replace(/^(fail|pass|unknown):\s*/i, "").trim();
const lowerFirst = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : "the requirement");

export function draftBody(
  deal: { code: string; name: string },
  responsible: string,
  findings: Finding[],
  rules: Map<string, Rule>,
  partyOf: (id: string) => string,
  documentOf: (versionId: string, page: number | null) => string,
) {
  // An informational finding is context, not a request. It is never turned into a demand.
  const asks = findings.filter((f) => f.type !== "info" && f.severity !== "info");
  const items = draftItems(asks, rules, partyOf, documentOf);
  const lines = [
    `Documents needed for ${deal.name}`,
    "",
    "Hello,",
    "",
    items.length === 1
      ? "We are preparing the loan file and need one more thing from you."
      : `We are preparing the loan file and need ${items.length} things from you.`,
    "",
  ];
  items.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.ask}`);
    if (item.because) lines.push(`   ${item.because}`);
    for (const side of item.sides) lines.push(`   - ${side.value} (${side.source})`);
    lines.push("");
  });
  lines.push(
    "If you have already sent one of these, please reply and we will check our records.",
    "",
    "Prepared from documents supplied by the parties. Flags are preparation aids for lender review. They are not credit, legal, tax or eligibility determinations.",
  );
  return scrubPayload(lines.join("\n"));
}

/** Rebuild one draft per responsible party from the currently open findings. */
export async function buildDrafts(context: SessionContext, dealId: string) {
  await requireDeal(context, dealId);
  const { deal, findings, versions, partyName, rules } = await buildIndex(dealId);
  const { segments } = await buildIndex(dealId);
  // A recipient recognises "SBA Form 1919, page 2", never an internal path or an identifier.
  const documentOf = (versionId: string, page: number | null) => {
    const segment = segments.find((s) => s.documentVersionId === versionId);
    const name = segment ? documentName(segment.docType) : null;
    if (!name)
      return versions.some((v) => v.id === versionId)
        ? `supplied document, page ${page}`
        : "the deal profile";
    return page === null ? name : `${name}, page ${page}`;
  };
  const open = findings
    .filter((f) => f.status === "open")
    .sort((a, b) => a.findingKey.localeCompare(b.findingKey));
  const recipient = (f: Finding) => {
    const rule = rules.get(f.ruleId);
    return rule?.scope.startsWith("per_")
      ? `${f.responsibleRole} · ${partyName(f.scopeKey)}`
      : f.responsibleRole;
  };
  const parties = [...new Set(open.map(recipient))].sort();
  return parties.map((responsible) => {
    const mine = open.filter((f) => recipient(f) === responsible);
    return {
      responsible,
      findingKeys: mine.map((f) => f.findingKey),
      body: draftBody(deal, responsible, mine, rules, partyName, documentOf),
      /** Informational findings travel with the group but never become a demand. */
      informational: mine.filter((f) => f.type === "info" || f.severity === "info").length,
    };
  });
}

/** Mark as sent: persist the draft, move its findings to requested, and start aging. Nothing is sent by the system. */
export async function markRequestSent(
  context: SessionContext,
  dealId: string,
  responsible: string,
) {
  await assertMutation(context, "deal-request");
  await requireDeal(context, dealId);
  const drafts = await buildDrafts(context, dealId);
  const draft = drafts.find((d) => d.responsible === responsible);
  if (!draft || !draft.findingKeys.length) throw Error("No open findings for that party");
  const db = getDb();
  return db.transaction(async (tx) => {
    const now = new Date();
    const [request] = await tx
      .insert(schema.requests)
      .values({
        dealId,
        responsible,
        body: draft.body,
        findingKeys: draft.findingKeys,
        status: "sent",
        sentAt: now,
        actorId: context.user.id,
      })
      .returning();
    for (const key of draft.findingKeys)
      await tx
        .update(schema.findings)
        .set({ status: "requested", requestId: request!.id, requestedAt: now })
        .where(and(eq(schema.findings.dealId, dealId), eq(schema.findings.findingKey, key)));
    await tx.insert(schema.events).values({
      dealId,
      actorId: context.user.id,
      action: "request_marked_sent",
      entityType: "request",
      entityId: request!.id,
      maskedAfter: { responsible, findings: draft.findingKeys.length },
    });
    return request!;
  });
}

export async function listRequests(dealId: string) {
  return getDb()
    .select()
    .from(schema.requests)
    .where(eq(schema.requests.dealId, dealId))
    .orderBy(schema.requests.createdAt);
}

export const ageInDays = (sentAt: Date | null, now = new Date()) =>
  sentAt ? Math.floor((now.getTime() - sentAt.getTime()) / 86400000) : null;
