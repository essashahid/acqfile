import { scrubPayload } from "@/lib/deals/identifiers";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assertMutation } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import type { SessionContext } from "@/lib/workspace";
import { buildIndex } from "./index-build";
import type { Rule } from "@/lib/rules/schema";
import { attributeName, documentName, factValue } from "@/lib/staff/labels";
import { checksFromMessage } from "@/lib/staff/explain";

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
  /** False when the item asks for an answer or a status, not a document. */
  document?: boolean;
};

export function draftItems(
  findings: Finding[],
  rules: Map<string, Rule>,
  partyOf: (id: string) => string,
  documentOf: (versionId: string, page: number | null) => string,
  valueOf: (detail: Detail) => string = (d) => factValue("", "text", d.value),
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
    const relationshipCheck = rule?.checks?.some((check) =>
      ["arithmetic", "fact_comparison", "date_order"].includes(check.type),
    );
    if (f.type === "conflict")
      return {
        ask: relationshipCheck
          ? `Please check the ${what}${who} and clarify or correct the information below.`
          : `Please confirm which value is correct${who}.`,
        because: relationshipCheck
          ? `We could not confirm that ${condition}.`
          : "The documents supplied give different values, so we do not know which one to use.",
        // Only a conflict needs both sides; every other type is a single clear request.
        sides: details.details
          .filter((d) => d.fact_id !== null)
          .map((d) => ({
            value: valueOf(d),
            source: documentOf(d.file, d.page),
          }))
          .filter(
            (s, i, all) => all.findIndex((o) => o.value === s.value && o.source === s.source) === i,
          ),
      };
    const open = rule?.checks ? checksFromMessage(rule, details.message) : [];
    const noteKey = (type: string) =>
      rule?.checks.find(
        (c) => c.type === type && open.some((o) => o.type === type && o.message === c.message),
      )?.note_key;
    const manual = open.some((c) => c.type === "manual_confirmation");
    const tracking = open.some((c) => c.type === "tracking");
    // A missing record or discussion is a question, never a request for a replacement document.
    if (manual) {
      const key = noteKey("manual_confirmation") ?? "";
      const later = tracking
        ? " If it is required, please also tell us when it has been ordered and received."
        : "";
      const asks: Record<string, DraftItem> = {
        personal_license: {
          ask: `Please tell us whether ${who ? subject : "the business"} operates under the seller's personal license.`,
          because:
            "We have the license on file. We need your answer to record how the license will be handled with the lender.",
          sides: [],
        },
        citizenship_handling: {
          ask: `Please tell us how you want citizenship evidence handled${who}.`,
          because:
            "We need your instructions to record this in the file. No new document is requested.",
          sides: [],
        },
        valuation_required: {
          ask: "Please confirm whether an independent business valuation is required for this loan.",
          because: `We need your answer to record it in the file.${later}`,
          sides: [],
        },
      };
      return {
        ...(asks[key] ?? {
          ask: `Please contact us about the ${midSentence(rule!.title)}${who}.`,
          because:
            "We need your answer to record a check in the file. No new document is requested.",
          sides: [],
        }),
        document: false,
      };
    }
    if (tracking)
      return {
        ask: `Please tell us the status of the ${midSentence(rule!.title)}: not yet ordered, ordered, or received.`,
        because:
          "We track this lender-ordered item in the file. No document is needed from the borrower.",
        sides: [],
        document: false,
      };
    const signature = rule?.checks?.find(
      (c) => c.type === "signed_and_dated" && open.some((o) => o.message === c.message),
    );
    if (signature) {
      const failed = open.some((o) => o.message === signature.message && o.result === "fail");
      const what2 = signature.signed_only ? "signed" : "signed and dated";
      return {
        ask: failed
          ? `Please send a ${what2} copy of the ${what}${who}.`
          : `Please send a copy of the ${what}${who} that clearly shows the ${signature.signed_only ? "signature" : "signature and date"}.`,
        because: failed
          ? `The copy we have is not ${what2}.`
          : `We could not confirm the ${signature.signed_only ? "signature" : "signature and date"} on the copy we have.`,
        sides: [],
      };
    }
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

const conditionOf = (message: string) => {
  const readable = message
    .replace(/\b(fail|pass|unknown):\s*/gi, "")
    .replace(
      /every current confirmed segment matches a deal party/gi,
      "the document belongs to a person or business in this deal",
    )
    .trim();
  return /[{}]|\b[a-z]+_[a-z_]+\b|\b(?:null|undefined)\b/.test(readable)
    ? "all the information needed is present; please check the document and send a complete copy"
    : readable.replace(/[.;]+$/, "");
};
const lowerFirst = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : "the requirement");

export function draftBody(
  deal: { code: string; name: string },
  responsible: string,
  findings: Finding[],
  rules: Map<string, Rule>,
  partyOf: (id: string) => string,
  documentOf: (versionId: string, page: number | null) => string,
  valueOf?: (detail: Detail) => string,
) {
  // An informational finding is context, not a request. It is never turned into a demand.
  const asks = findings.filter((f) => f.type !== "info" && f.severity !== "info");
  const items = draftItems(asks, rules, partyOf, documentOf, valueOf);
  const lines = [
    // A message that asks only for answers or status is not headed as a document request.
    items.some((i) => i.document !== false)
      ? `Documents needed for ${deal.name}`
      : `Information needed for ${deal.name}`,
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
  const { deal, findings, versions, partyName, rules, segments, facts } = await buildIndex(dealId);
  // A recipient recognises "SBA Form 1919, page 2", never an internal path or an identifier.
  const documentOf = (versionId: string, page: number | null) => {
    const segment = segments.find(
      (s) =>
        s.documentVersionId === versionId &&
        (page === null || (s.pageStart <= page && s.pageEnd >= page)),
    );
    const name = segment ? documentName(segment.docType) : null;
    if (!name)
      return versions.some((v) => v.id === versionId)
        ? `supplied document, page ${page}`
        : "the deal profile";
    return page === null ? name : `${name}, page ${page}`;
  };
  const open = findings
    .filter((f) => f.status === "open" && f.type !== "info" && f.severity !== "info")
    .sort((a, b) => a.findingKey.localeCompare(b.findingKey));
  const recipient = (f: Finding) => {
    const rule = rules.get(f.ruleId);
    // A handling question for the lender goes to the lender, whoever supplies the document.
    const open = checksFromMessage(rule, (f.detailsJson as { message: string }).message);
    if (
      open.length &&
      open.every(
        (o) =>
          o.type === "manual_confirmation" &&
          rule?.checks.find((c) => c.message === o.message)?.note_key === "citizenship_handling",
      )
    )
      return "lender";
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
      body: draftBody(deal, responsible, mine, rules, partyName, documentOf, (detail) => {
        const fact = facts.find((f) => f.id === detail.fact_id);
        const value = factValue(
          fact?.attribute ?? "",
          fact?.unit ?? "text",
          fact?.valueJson ?? detail.value,
        );
        return fact ? `${attributeName(fact.attribute)}: ${value}` : value;
      }),
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
