import type { buildIndex, IndexRow } from "@/lib/deliverables/index-build";
import type { schema } from "@/lib/db/client";
import { hashObject } from "@/lib/hash";
import { labelFor, numberWord, dateLabel } from "./copy";
export type Data = Awaited<ReturnType<typeof buildIndex>> & {
  submittedSegments?: Awaited<ReturnType<typeof buildIndex>>["segments"];
};
export type ResponseRow = typeof schema.portalResponses.$inferSelect;
export type State = "To do" | "With us for review" | "Done";
export type Task = {
  key: string;
  partyId: string;
  title: string;
  type: string;
  accepted: string[];
  periods: string[];
  state: State;
  sentence: string;
  rows: IndexRow[];
  versions: string[];
  response?: ResponseRow;
  business: boolean;
};
export type Question = {
  key: string;
  title: string;
  partyId: string | null;
  values: string[];
  sources: {
    label: string;
    quote: string;
    page: number | null;
    versionId: string | null;
    segmentId: string | null;
    value: string;
  }[];
  answered: boolean;
  answer?: ResponseRow;
};
const active = (status: string) => ["open", "requested"].includes(status);
export const valueLabel = (value: unknown): string => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return dateLabel(value);
  if (typeof value === "number")
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(valueLabel).join("; ");
  if (value && typeof value === "object") {
    if ("hmac" in value) return "Ending " + String((value as { last_four?: unknown }).last_four);
    return Object.entries(value)
      .filter(([k]) => !/id|hash|hmac/i.test(k))
      .map(([k, v]) => `${k.replaceAll("_", " ")}: ${valueLabel(v)}`)
      .join("; ");
  }
  return String(value ?? "Not stated");
};
const questionNames: Record<string, string> = {
  "CON-01": "Which business tax number should be used?",
  "CON-02": "Who will own the business?",
  "CON-03": "Which purchase price is right?",
  "CON-04": "How should the funding plan balance?",
  "CON-05": "What are the seller loan terms?",
  "CON-06": "How will the seller loan be repaid?",
  "CON-07": "How will the purchase be funded?",
  "CON-08": "Which money will you use for the purchase?",
  "CON-09": "Which cash balance is current?",
  "CON-10": "Which business revenue is right?",
  "CON-11": "Which date should we use?",
  "CON-12": "Which business name should be used?",
  "CON-13": "What are the lease terms?",
  "CON-14": "What are the franchise arrangements?",
  "CON-15": "Is the letter of intent still current?",
  "CON-16": "Who does this document belong to?",
};
export function mapDeal(data: Data, responses: ResponseRow[] = []) {
  const parties = data.parties;
  const sourceParty = (scope: string) => {
    const sources = data.deal.profileJson.equity_sources;
    const key = Array.isArray(sources)
      ? (sources.find((s) => s.id === scope)?.party ?? scope)
      : scope;
    return parties.find((p) => p.id === key || p.externalKey === key)?.id ?? key;
  };
  const recipient = (row: IndexRow) => {
    const rule = data.rules.get(row.item_id)!;
    if (parties.some((p) => p.id === sourceParty(row.scope_key))) return sourceParty(row.scope_key);
    if (
      rule.responsible === "seller" ||
      rule.responsible === "seller_entity" ||
      rule.responsible === "cpa"
    )
      return (
        parties.find((p) => p.roles.includes(rule.responsible === "cpa" ? "cpa" : "seller_entity"))
          ?.id ??
        parties.find((p) => p.roles.includes("seller_entity"))?.id ??
        ""
      );
    return (
      parties.find((p) => p.roles.includes("buyer_owner") && p.kind === "individual")?.id ?? ""
    );
  };
  const tasks: Task[] = [];
  for (const originalRow of data.index) {
    const row = { ...originalRow, segments: [...originalRow.segments] };
    const rule = data.rules.get(row.item_id);
    if (!rule || row.status === "not_applicable" || rule.checks.some((c) => c.type === "tracking"))
      continue;
    // The export index keeps satisfying evidence only. A sender must also see current
    // copies that need work; this association never changes an engine status.
    const scopeParty = sourceParty(row.scope_key);
    const sources = data.deal.profileJson.equity_sources;
    const account = Array.isArray(sources)
      ? sources.find((s) => s.id === row.scope_key)?.source_account_last_four
      : undefined;
    for (const s of data.segments.filter(
      (s) =>
        rule.accepts.some((type) => type === s.docType) &&
        (!row.period || s.period === row.period) &&
        (!parties.some((p) => p.id === scopeParty) || s.partyId === scopeParty) &&
        (!account ||
          account === "unknown" ||
          s.docType !== "BANK_STATEMENT" ||
          s.accountLastFour === account),
    )) {
      if (!row.segments.some((x) => x.id === s.id))
        row.segments.push({
          id: s.id,
          versionId: s.documentVersionId,
          page: s.pageStart,
          label: labelFor(s.docType),
        });
    }
    const partyId = recipient(row),
      type = rule.accepts[0] ?? "OTHER_NOT_REQUIRED";
    const key = hashObject([
      row.item_id,
      row.scope_key,
      type === "BANK_STATEMENT" ? "monthly" : row.period,
    ]);
    const existing = tasks.find((t) => t.key === key);
    if (existing) {
      existing.rows.push(row);
      existing.periods.push(row.period);
      continue;
    }
    tasks.push({
      key,
      partyId,
      type,
      accepted: [...rule.accepts],
      title: `${row.period && type !== "BANK_STATEMENT" ? row.period + " " : ""}${labelFor(type)}`,
      periods: [row.period],
      state: "To do",
      sentence: "",
      rows: [row],
      versions: [],
      business: !["per_guarantor", "per_owner_or_guarantor", "per_equity_source"].includes(
        rule.scope,
      ),
    });
  }
  for (const task of tasks) {
    const replies = responses
      .filter((r) => r.taskKey === task.key)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const latest = replies.at(-1);
    task.response = replies.filter((r) => ["cant_send", "accept_later"].includes(r.kind)).at(-1);
    task.versions = [...new Set(task.rows.flatMap((r) => r.segments.map((s) => s.versionId)))];
    for (const r of replies.filter((r) => r.kind === "upload"))
      for (const id of (r.payload.versions as string[]) ?? [])
        if (!task.versions.includes(id)) task.versions.push(id);
    const complete = task.rows.every((r) => ["satisfied", "waived"].includes(r.status));
    const pending =
      task.rows.some((r) => r.status === "needs_review") || latest?.kind === "keep_document";
    const upload = replies.filter((r) => r.kind === "upload").at(-1);
    const inFlight =
      upload &&
      (upload.payload.versions as string[]).some((id) =>
        data.versions.some(
          (v) => v.id === id && ["queued", "processing"].includes(v.processingStatus),
        ),
      );
    const raw = (data.submittedSegments ?? []).filter(
      (s) => upload && (upload.payload.versions as string[]).includes(s.documentVersionId),
    );
    const certainProblem = raw.some(
      (s) =>
        s.classificationMethod === "signature" &&
        (!task.accepted.includes(s.docType) ||
          (task.periods.some(Boolean) && !task.periods.includes(s.period ?? ""))),
    );
    const waitingUpload =
      upload &&
      !certainProblem &&
      (upload.payload.photos || raw.some((s) => s.classificationMethod !== "signature")) &&
      (upload.payload.versions as string[]).some((id) =>
        data.versions.some(
          (v) =>
            v.id === id &&
            !["failed", "unsupported"].includes(v.processingStatus) &&
            v.parseStatus !== "failed",
        ),
      );
    task.state = complete
      ? "Done"
      : pending || inFlight || waitingUpload
        ? "With us for review"
        : "To do";
    if (
      task.response?.kind === "cant_send" &&
      !complete &&
      (!upload || task.response.createdAt > upload.createdAt)
    )
      task.state = "To do";
    const checks = task.rows.flatMap((r) => r.checks).filter((c) => c.result === "fail");
    task.sentence =
      task.state === "Done"
        ? "We have what we need from you."
        : task.state === "With us for review"
          ? "A person on our team is checking this. We'll tell you if anything is unclear."
          : task.rows.some((r) => r.status === "missing")
            ? "Please send a complete copy so we can prepare your loan file."
            : checks.some((c) => /type|period|year/.test(c.type))
              ? "Please send the document for the period shown here."
              : checks.some((c) => c.type === "signed_and_dated")
                ? "Please sign and date a fresh copy."
                : checks.some((c) => /fresh|age|date/.test(c.type))
                  ? "Please send a more recent copy."
                  : "Please take another look at this document with your adviser.";
    if (task.response?.kind === "accept_later" && !complete)
      task.sentence = `Your adviser knows you plan to send this${task.response.payload.date ? " by " + dateLabel(String(task.response.payload.date)) : " later"}.`;
    if (task.response?.kind === "cant_send" && !complete) {
      const reason = task.response.payload.reason;
      task.sentence =
        reason === "later"
          ? `You plan to send this${task.response.payload.date ? " by " + dateLabel(String(task.response.payload.date)) : " later"}. Your adviser will confirm what happens next.`
          : reason === "already"
            ? "You told us you already sent this. Your adviser will look for it."
            : "You told us this does not apply to you. Your adviser will take a look.";
    }
  }
  const questions: Question[] = data.findings
    .filter((f) => active(f.status) && f.type === "conflict")
    .map((f) => {
      const details =
        (
          f.detailsJson as {
            details: {
              fact_id: string | null;
              value: unknown;
              file: string;
              page: number | null;
              quote: string;
            }[];
          }
        ).details ?? [];
      const rule = data.rules.get(f.ruleId);
      const responsible = rule?.responsible;
      const owner = [
        "buyer",
        "buyer_owner",
        "guarantor",
        "seller",
        "seller_entity",
        "cpa",
      ].includes(responsible ?? "")
        ? (parties.find((p) => p.id === sourceParty(f.scopeKey)) ??
          parties.find((p) =>
            p.roles.includes(responsible === "seller" ? "seller_entity" : responsible!),
          ))
        : undefined;
      const sources = details
        .filter(
          (d) =>
            (d.fact_id &&
              (f.ruleId !== "CON-01" ||
                data.facts.find((f) => f.id === d.fact_id)?.attribute === "party.identifier")) ||
            (f.ruleId === "CON-03" &&
              d.value &&
              typeof d.value === "object" &&
              "purchase_price" in d.value),
        )
        .map((d) => {
          const fact = data.facts.find((x) => x.id === d.fact_id),
            seg = data.segments.find((s) => s.id === fact?.segmentId);
          const raw =
            !d.fact_id && f.ruleId === "CON-03"
              ? (d.value as Record<string, unknown>).purchase_price
              : (fact?.valueJson ?? d.value);
          return {
            label: seg ? labelFor(seg.docType) : "Information you supplied",
            quote: d.fact_id ? d.quote : "",
            page: d.page,
            versionId: seg?.documentVersionId ?? null,
            segmentId: seg?.id ?? null,
            value: valueLabel(raw),
          };
        });
      if (f.ruleId === "CON-07") {
        const profile = data.deal.profileJson;
        const kinds: Record<string, string> = {
          cash: "Cash",
          cash_savings: "Cash",
          seller_standby_note: "Seller loan",
          other_standby_debt: "Other borrowing",
          minority_investor_equity: "Investor contribution",
          gift: "Gift",
        };
        const value = Array.isArray(profile.equity_sources)
          ? profile.equity_sources
              .map((s) => `${kinds[s.kind] ?? "Contribution"}: ${valueLabel(s.amount)}`)
              .join("; ")
          : "Not stated";
        sources.push({
          label: "Funding information you supplied",
          quote: "",
          page: null,
          versionId: null,
          segmentId: null,
          value,
        });
      }
      const answer = responses
        .filter((r) => r.taskKey === f.findingKey && r.kind === "answer")
        .at(-1);
      return {
        key: f.findingKey,
        title: questionNames[f.ruleId] ?? "Could you help us clarify this?",
        partyId:
          owner &&
          sources.every(
            (s) =>
              !s.versionId ||
              data.segments
                .filter((x) => x.documentVersionId === s.versionId)
                .every((x) => x.partyId === owner.id),
          )
            ? owner.id
            : null,
        values: [...new Set(sources.map((s) => s.value))],
        sources,
        answered: !!answer && answer.payload.choice !== "unsure",
        answer,
      };
    });
  // A74: a response creates one correction task per affected document, without changing a fact.
  for (const q of questions.filter((q) => q.answered)) {
    if (data.findings.some((f) => f.findingKey === q.key && f.ruleId === "CON-07")) {
      const funding = tasks.find((t) => t.type === "SOURCES_USES");
      if (funding) {
        funding.state = "To do";
        funding.sentence =
          "Your adviser has asked for an updated funding plan. Please send the current figures.";
      }
    }
    for (const source of q.sources.filter(
      (s) => s.versionId && s.value !== q.answer?.payload.choice,
    )) {
      const task = tasks.find((t) =>
        t.rows.some((r) => r.segments.some((s) => s.id === source.segmentId)),
      );
      if (task) {
        task.state = "To do";
        task.sentence =
          "Your adviser has answered a question about this document. Please send a corrected copy.";
      }
    }
  }
  const openQuestions = questions.filter((q) => !q.answered);
  const ready =
    data.index.every((r) => ["not_applicable", "satisfied", "waived"].includes(r.status)) &&
    !data.findings.some((f) => active(f.status)) &&
    !tasks.some((t) => t.state !== "Done");
  return {
    tasks,
    questions,
    openQuestions,
    ready,
    lenderOrdered: data.index.filter((r) =>
      data.rules.get(r.item_id)?.checks.some((c) => c.type === "tracking"),
    ),
  };
}
export function personHome(mapped: ReturnType<typeof mapDeal>, partyId: string, name: string) {
  const tasks = mapped.tasks.filter((t) => t.partyId === partyId),
    questions = mapped.openQuestions.filter((q) => q.partyId === partyId);
  const todo = tasks.filter((t) => t.state === "To do"),
    waiting = tasks.filter((t) => t.state === "With us for review"),
    done = tasks.filter((t) => t.state === "Done");
  const first = name.split(" ")[0]!,
    count = todo.length + questions.length;
  const state = count ? "todo" : waiting.length ? "waiting" : "done";
  const headline = count
    ? `Hi ${first}. ${numberWord(count)} ${count === 1 ? "thing needs" : "things need"} your attention.`
    : waiting.length
      ? `Nothing for you to do right now, ${first}.`
      : `You're all done for now, ${first}.`;
  const stages = [
    { title: "Your details", note: "Done", done: true },
    {
      title: "Your documents",
      note: count
        ? `${numberWord(count)} ${count === 1 ? "thing" : "things"} to do`
        : waiting.length
          ? "With us for review"
          : "All done",
      done: state === "done",
    },
    { title: "We check everything", note: "We read the documents together", done: mapped.ready },
    { title: "Ready for the lender", note: "One complete loan file", done: mapped.ready },
  ];
  return { tasks, todo, waiting, done, questions, state, headline, first, stages };
}
