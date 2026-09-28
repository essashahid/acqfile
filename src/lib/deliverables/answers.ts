import { mapDeal, questionPolicy, type Data, type ResponseRow } from "@/lib/portal/map";

/** A recorded answer as frozen into a lender-file version. Choosing a value never edits a
 * source fact and never resolves the disagreement: the documents still say what they say. */
export type FrozenAnswer = {
  /** "current": recorded against the evidence the conflict shows now.
   *  "not_current": recorded against earlier evidence; shown for history only. */
  state: "current" | "not_current";
  question: string;
  selection: string;
  /** The answer picked one of the quoted values (not "not sure" or "neither"). */
  selected_value: boolean;
  explanation: string;
  recorded_by: string;
  recorded_at: string;
  supporting: FrozenSource[];
  corrections_needed: FrozenSource[];
  /** Whether the documents themselves now agree. Recording an answer never sets this. */
  documents_corrected: boolean;
  summary: string;
};
export type FrozenSource = {
  document: string;
  value: string;
  original_file: string;
  package_path: string;
  page: number | null;
  quote: string;
};

type Event = { id: string; actorId: string | null; createdAt: Date };
type User = { id: string; displayName: string | null; email: string };

const SELECTION: Record<string, string> = {
  unsure: "Not sure yet",
  neither: "Neither value; the information has changed",
  clarification: "Clarification given",
};

/** The latest recorded answer for each question-backed finding, with its attribution. */
export function frozenAnswers(
  data: Data,
  responses: ResponseRow[],
  events: Event[],
  users: User[],
): Map<string, FrozenAnswer> {
  const mapped = mapDeal(data, responses);
  const out = new Map<string, FrozenAnswer>();
  const pathOf = (versionId: string | null) => {
    if (!versionId) return "";
    for (const [path, id] of data.paths) if (id === versionId) return path;
    return "";
  };
  const attribution = (r: ResponseRow) => {
    const event = events.find((e) => e.id === r.auditEventId);
    const user = users.find((u) => u.id === (event?.actorId ?? ""));
    if (r.linkId) {
      const party = data.parties.find((p) => p.id === r.partyId);
      return `${party?.legalName ?? "The person asked"}, through their personal link`;
    }
    if (!user) return "Not recorded";
    return user.displayName ? `${user.displayName} (${user.email})` : user.email;
  };
  const freeze = (
    r: ResponseRow,
    question: string,
    state: FrozenAnswer["state"],
    sources: (typeof mapped.questions)[number]["sources"],
    documentsCorrected: boolean,
  ): FrozenAnswer => {
    const choice = String(r.payload.choice ?? "");
    const selected = !SELECTION[choice];
    const source = (s: (typeof sources)[number]): FrozenSource => ({
      document: s.label,
      value: s.value,
      original_file: s.versionId ? data.originalPath(s.versionId) : "Deal profile",
      package_path: pathOf(s.versionId),
      page: s.page,
      quote: s.quote,
    });
    const current = state === "current";
    const supporting = current && selected ? sources.filter((s) => s.value === choice) : [];
    const corrections =
      current && selected ? sources.filter((s) => s.versionId && s.value !== choice) : [];
    return {
      state,
      question,
      selection: SELECTION[choice] ?? choice,
      selected_value: selected,
      explanation: String(r.payload.note ?? ""),
      recorded_by: attribution(r),
      recorded_at: r.createdAt.toISOString(),
      supporting: supporting.map(source),
      corrections_needed: corrections.map(source),
      documents_corrected: documentsCorrected,
      summary: !current
        ? documentsCorrected
          ? "Recorded before the documents changed. The documents now agree, so this answer is kept for history only."
          : "Recorded against earlier evidence. The documents have changed since, so this answer is not current."
        : !selected
          ? "Answer recorded. No value was chosen; the disagreement stays open."
          : corrections.length
            ? "Answer recorded. The supporting documents have not been corrected yet; the disagreement stays open until they agree."
            : "Answer recorded. The documents cited agree with the recorded value.",
    };
  };
  for (const q of mapped.questions) {
    if (q.answer) out.set(q.key, freeze(q.answer, q.title, "current", q.sources, false));
    else if (q.history.length)
      out.set(q.key, freeze(q.history.at(-1)!, q.title, "not_current", [], false));
  }
  // Findings that no longer carry a question (for example, resolved by corrected documents)
  // keep their last answer as history, never as a current answer.
  for (const f of data.findings) {
    if (out.has(f.findingKey)) continue;
    const last = responses.filter((r) => r.taskKey === f.findingKey && r.kind === "answer").at(-1);
    if (!last) continue;
    const title = questionPolicy[f.ruleId]?.title ?? data.rules.get(f.ruleId)?.title ?? f.ruleId;
    out.set(f.findingKey, freeze(last, title, "not_current", [], f.status === "resolved"));
  }
  return out;
}
