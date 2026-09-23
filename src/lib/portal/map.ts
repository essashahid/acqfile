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
  kind: "choice" | "clarification" | "staff_review";
  evidenceKey: string;
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
  history: ResponseRow[];
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
export const questionPolicy: Record<string, { title: string; kind: Question["kind"] }> = {
  "CON-01": { title: "Can you clarify the seller's name and tax number?", kind: "clarification" },
  "CON-02": { title: "Can you clarify the owners and their shares?", kind: "clarification" },
  "CON-03": { title: "Which purchase price is right?", kind: "choice" },
  "CON-04": { title: "How should the funding plan balance?", kind: "clarification" },
  "CON-05": { title: "Can you clarify the seller loan amount and terms?", kind: "clarification" },
  "CON-06": { title: "Can you clarify the seller loan's standby terms?", kind: "clarification" },
  "CON-07": { title: "Can you explain the planned funding amounts?", kind: "clarification" },
  "CON-08": {
    title: "Can you explain the cash contribution and account balance?",
    kind: "clarification",
  },
  "CON-09": { title: "Can you explain the cash and bank balances?", kind: "clarification" },
  "CON-10": {
    title: "Can you explain the tax receipts and year-end revenue?",
    kind: "clarification",
  },
  "CON-11": { title: "What is the purchase structure?", kind: "choice" },
  "CON-12": { title: "Which business address should we use?", kind: "choice" },
  "CON-13": {
    title: "Can you clarify the lease expiry and renewal options?",
    kind: "clarification",
  },
  "CON-14": { title: "What is the consulting period?", kind: "clarification" },
  "CON-15": { title: "Can you clarify the transaction dates?", kind: "clarification" },
  "CON-16": { title: "Can you clarify who this document belongs to?", kind: "clarification" },
};
const dependencies = (node: unknown, field: "profile" | "param"): string[] => {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((item) => dependencies(item, field));
  const obj = node as Record<string, unknown>;
  return [
    ...Object.entries(obj)
      .filter(
        ([key, value]) =>
          typeof value === "string" &&
          (field === "profile" ? key === "profile" : key === "param" || key.endsWith("_param")),
      )
      .map(([, value]) => value as string),
    ...Object.values(obj).flatMap((value) => dependencies(value, field)),
  ];
};
const profileValue = (profile: unknown, path: string): unknown => {
  let value = profile;
  for (const part of path.replace("[]", "").split(".")) {
    if (Array.isArray(value))
      value = value.map((item) => (item as Record<string, unknown>)?.[part]);
    else
      value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : null;
  }
  return value ?? null;
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
    task.response = replies.filter((r) => ["cant_send", "accept_later"].includes(r.kind)).at(-1);
    task.versions = [...new Set(task.rows.flatMap((r) => r.segments.map((s) => s.versionId)))];
    for (const r of replies.filter((r) => r.kind === "upload"))
      for (const id of (r.payload.versions as string[]) ?? [])
        if (!task.versions.includes(id)) task.versions.push(id);
    const complete = task.rows.every((r) => ["satisfied", "waived"].includes(r.status));
    const upload = replies.filter((r) => r.kind === "upload").at(-1);
    const uploadedIds = (upload?.payload.versions as string[] | undefined) ?? [];
    const uploaded = data.versions.filter((v) => uploadedIds.includes(v.id));
    const failed = uploaded.some(
      (v) =>
        ["failed", "unsupported", "dead_letter"].includes(v.processingStatus) ||
        v.parseStatus === "failed",
    );
    const viable = uploaded.some(
      (v) =>
        !["failed", "unsupported", "dead_letter"].includes(v.processingStatus) &&
        v.parseStatus !== "failed",
    );
    const inFlight =
      upload && uploaded.some((v) => ["queued", "processing"].includes(v.processingStatus));
    const raw = (data.submittedSegments ?? []).filter((s) =>
      uploadedIds.includes(s.documentVersionId),
    );
    const latestFiling = raw
      .filter((s) => s.isCurrent && task.accepted.includes(s.docType))
      .map((s) => s.createdAt?.getTime() ?? 0)
      .reduce((latest, time) => Math.max(latest, time), 0);
    const evaluationCurrent =
      !data.evaluation || !latestFiling || data.evaluation.createdAt.getTime() >= latestFiling;
    // A photo's upload record remains in history. A current, confirmed staff filing
    // and the latest checks supersede its earlier "we are reading it" state.
    const acceptedFiling = raw.some(
      (s) =>
        s.isCurrent &&
        s.status === "confirmed" &&
        task.accepted.includes(s.docType) &&
        (!task.periods.some(Boolean) || task.periods.includes(s.period ?? "")) &&
        evaluationCurrent &&
        ["manual", "signature"].includes(s.classificationMethod),
    );
    const decided = acceptedFiling || raw.some((s) => s.status === "rejected");
    const certainProblem = raw.some(
      (s) =>
        s.classificationMethod === "signature" &&
        (!task.accepted.includes(s.docType) ||
          (task.periods.some(Boolean) && !task.periods.includes(s.period ?? ""))),
    );
    const waitingUpload = !!upload && viable && !certainProblem && !decided;
    const checks = task.rows.flatMap((r) => r.checks).filter((c) => c.result === "fail");
    const repairable = checks.some((c) =>
      [
        "signed_and_dated",
        "page_completeness",
        "freshness",
        "form_revision",
        "period_coverage",
      ].includes(c.type),
    );
    const pending =
      task.rows.some((r) => r.status === "needs_review") ||
      (!!replies
        .filter(
          (r) => r.kind === "keep_document" && r.createdAt >= (upload?.createdAt ?? new Date(0)),
        )
        .at(-1) &&
        !decided);
    const staffIssue = task.rows.some((r) => r.status === "received_with_issues") && !repairable;
    const authoritativeComplete = complete && acceptedFiling;
    const failedRequiresAction = !!upload && failed && !acceptedFiling;
    task.state = authoritativeComplete
      ? "Done"
      : inFlight || waitingUpload
        ? "With us for review"
        : failedRequiresAction
          ? "To do"
          : complete
            ? "Done"
            : pending || staffIssue
              ? "With us for review"
              : "To do";
    if (
      task.response?.kind === "cant_send" &&
      !complete &&
      (!upload || task.response.createdAt > upload.createdAt)
    )
      task.state = "To do";
    task.sentence =
      task.state === "Done"
        ? "We have what we need from you."
        : task.state === "With us for review"
          ? "A person on our team is checking this. We'll tell you if anything is unclear."
          : failedRequiresAction
            ? "We couldn't read this copy. Please send a clear, unlocked copy."
            : task.rows.some((r) => r.status === "missing")
              ? "Please send a complete copy so we can prepare your loan file."
              : checks.some((c) => /type|period|year/.test(c.type))
                ? "Please send the document for the period shown here."
                : checks.some((c) => c.type === "signed_and_dated")
                  ? "Please sign and date a fresh copy."
                  : checks.some((c) => c.type === "page_completeness")
                    ? "Please send every page of this document."
                    : checks.some((c) => c.type === "form_revision")
                      ? "Please send the current version of this form."
                      : checks.some((c) => /fresh|age|date/.test(c.type))
                        ? "Please send a more recent copy."
                        : "Please take another look at this document with your adviser.";
    if (
      task.response?.kind === "accept_later" &&
      !complete &&
      (!upload || task.response.createdAt > upload.createdAt)
    )
      task.sentence = `Your adviser knows you plan to send this${task.response.payload.date ? " by " + dateLabel(String(task.response.payload.date)) : " later"}.`;
    if (
      task.response?.kind === "cant_send" &&
      !complete &&
      (!upload || task.response.createdAt > upload.createdAt)
    ) {
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
    .filter(
      (f) =>
        active(f.status) &&
        (f.type === "conflict" ||
          // An unresolved consulting duration needs clarification even before a numeric comparison is possible.
          (f.type === "needs_review" && f.ruleId === "CON-14")),
    )
    .map((f) => {
      const policy = questionPolicy[f.ruleId] ?? {
        title: "Your adviser needs to review these details",
        kind: "staff_review" as const,
      };
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
      const evidence = {
        rule: rule ?? null,
        scope: f.scopeKey,
        period: f.period,
        parameters: [...new Set(dependencies(rule, "param"))]
          .sort()
          .map((key) => [key, data.pack?.parameters[key] ?? null]),
        profile: [...new Set(dependencies(rule, "profile"))]
          .sort()
          .map((path) => [path, profileValue(data.deal.profileJson, path)]),
        evidence: details
          .filter((d) => d.file !== "Declared deal profile")
          .map((d) => {
            const fact = data.facts.find((x) => x.id === d.fact_id);
            const segment = data.segments.find((s) => s.id === fact?.segmentId);
            return {
              fact: d.fact_id,
              attribute: fact?.attribute ?? null,
              revision: fact?.recordVersion ?? null,
              segment: segment?.id ?? null,
              version: segment?.documentVersionId ?? d.file,
              value: d.value,
            };
          })
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      };
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
            d.fact_id ||
            (["CON-03", "CON-11"].includes(f.ruleId) &&
              d.value &&
              typeof d.value === "object" &&
              (f.ruleId === "CON-03" ? "purchase_price" : "structure") in d.value),
        )
        .map((d) => {
          const fact = data.facts.find((x) => x.id === d.fact_id),
            seg = data.segments.find((s) => s.id === fact?.segmentId);
          const raw =
            !d.fact_id && ["CON-03", "CON-11"].includes(f.ruleId)
              ? (d.value as Record<string, unknown>)[
                  f.ruleId === "CON-03" ? "purchase_price" : "structure"
                ]
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
      const history = responses.filter((r) => r.taskKey === f.findingKey && r.kind === "answer");
      const values = policy.kind === "choice" ? [...new Set(sources.map((s) => s.value))] : [];
      const kind = policy.kind === "choice" && values.length < 2 ? "clarification" : policy.kind;
      const evidenceKey = hashObject({ ...evidence, kind });
      const answer = history.filter((r) => r.payload.evidenceKey === evidenceKey).at(-1);
      return {
        key: f.findingKey,
        title: policy.title,
        kind,
        evidenceKey,
        partyId:
          kind !== "staff_review" &&
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
        values: kind === "choice" ? values : [],
        sources,
        answered:
          !!answer &&
          !["unsure", "neither"].includes(String(answer.payload.choice)) &&
          kind !== "staff_review",
        answer,
        history,
      };
    });
  // Only a selected value for the same fact supports asking for a different copy.
  // Explanations of relationships go to staff and never imply that a document is wrong.
  for (const q of questions.filter((q) => q.answered && q.kind === "choice")) {
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
  const ready = data.preparation?.ready ?? false;
  return {
    tasks,
    questions,
    openQuestions,
    ready,
    preparation: data.preparation,
    lenderOrdered: data.index.filter(
      (r) => data.rules.get(r.item_id)?.submission_stage === "later_lender",
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
    { title: "Ready for the lender", note: "Prepared for lender review", done: mapped.ready },
  ];
  return { tasks, todo, waiting, done, questions, state, headline, first, stages };
}
