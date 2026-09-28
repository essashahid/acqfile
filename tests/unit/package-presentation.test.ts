import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { loadPack } from "@/lib/rules/loader";
import { explainItem, itemChecks } from "@/lib/staff/explain";
import { preparationReadiness } from "@/lib/deliverables/readiness";
import { outsideChecklistName, type IndexRow } from "@/lib/deliverables/index-build";
import { packageReport, packageWorkbook, readableValue } from "@/lib/deliverables/package";
import { packageReportV1, packageWorkbookV1 } from "@/lib/deliverables/package-v1";
import { dateTimeLabel, statusLabel } from "@/lib/deliverables/labels";
import type { SnapshotContent, SnapshotDiff } from "@/lib/deliverables/snapshot";
import type { FrozenAnswer } from "@/lib/deliverables/answers";

const pack = loadPack("sop-50-10-8-1");
const rules = new Map([...pack.items, ...pack.consistency].map((r) => [r.id, r]));
const rule = (id: string) => rules.get(id)!;

describe("an item opened from a document explains the actual check", () => {
  it("a price disagreement with all three documents on file is not described as missing", () => {
    const message = "fail: Values agree across the named sources";
    const ex = explainItem({
      rule: rule("CON-03"),
      status: "needs_review",
      checks: itemChecks(rule("CON-03"), undefined, message),
      findingType: "conflict",
      findingMessage: message,
      parameters: pack.parameters,
    });
    expect(ex.summary).not.toMatch(/on file/i);
    expect(ex.summary).not.toMatch(/^No /);
  });
  it("a genuinely missing document keeps the missing explanation", () => {
    const checks = rule("GUA-02").checks.map((c, i) => ({
      type: c.type,
      result: i === 0 ? "fail" : "unknown",
      message: c.message,
    }));
    const ex = explainItem({
      rule: rule("GUA-02"),
      status: "missing",
      checks: itemChecks(rule("GUA-02"), { checks }, "anything"),
      findingType: "missing",
      parameters: pack.parameters,
    });
    expect(ex.summary).toMatch(/^No personal tax return on file/);
  });
});

const row = (item_id: string, scope_key: string, party: string, period: string, status: string) =>
  ({
    item_id,
    item: rule(item_id).title,
    party,
    period,
    status,
    scope_key,
    responsible: "buyer",
    checks: [
      {
        type: "presence",
        result: status === "missing" ? "fail" : "unknown",
        message: "Required evidence and named facts are present",
      },
    ],
    segments: [],
  }) as unknown as IndexRow;

describe("the report groups outstanding work by requirement, person and period", () => {
  const index = [
    row("GUA-05", "jaylan", "Jaylan Heller", "", "needs_review"),
    row("GUA-05", "kiel", "Kiel McDermott", "", "needs_review"),
    row("GUA-02", "kiel", "Kiel McDermott", "2024", "missing"),
    row("GUA-02", "kiel", "Kiel McDermott", "2025", "missing"),
  ];
  const finding = (ruleId: string, scopeKey: string, type: string, message: string) => ({
    ruleId,
    scopeKey,
    period: null,
    status: "open",
    severity: "major",
    type,
    responsibleRole: ruleId === "CON-03" ? "broker" : "buyer",
    detailsJson: { message },
  });
  const findings = [
    finding(
      "GUA-05",
      "jaylan",
      "needs_review",
      "unknown: Rule reported under legal challenge; confirm handling with lender",
    ),
    finding(
      "GUA-05",
      "kiel",
      "needs_review",
      "unknown: Rule reported under legal challenge; confirm handling with lender",
    ),
    finding("CON-03", "deal", "conflict", "fail: Values agree across the named sources"),
  ];
  const result = preparationReadiness({
    index,
    rules,
    findings,
    current: true,
    subjectOf: (k) => (k === "deal" ? "Transaction" : k),
  });

  it("keeps two people and two periods apart, and merges a row with the check on it", () => {
    const groups = result.groups!;
    expect(groups.map((g) => [g.title, g.subject, g.period])).toEqual([
      ["Citizenship evidence", "Jaylan Heller", ""],
      ["Citizenship evidence", "Kiel McDermott", ""],
      ["Personal federal tax return", "Kiel McDermott", "2024"],
      ["Personal federal tax return", "Kiel McDermott", "2025"],
      ["Purchase prices agree", "Transaction", ""],
    ]);
    for (const g of groups.slice(0, 2)) {
      expect(g.status).toBe("Needs review");
      expect(g.reasons.join(" ")).toContain("confirm handling with lender");
    }
    expect(groups[4]!.reasons).toEqual(["Values agree across the named sources"]);
    expect(JSON.stringify(groups)).not.toMatch(/needs_review|fail:|unknown:/);
  });

  it("says a missing document is not on file once, without echoing its status", () => {
    const bare = {
      ...row("GUA-02", "kiel", "Kiel McDermott", "2025", "missing"),
      checks: [],
    } as IndexRow;
    const missing = preparationReadiness({
      index: [bare],
      rules,
      findings: [
        {
          ...finding("GUA-02", "kiel", "missing", "Missing: Personal federal tax return"),
          period: "2025",
        },
      ],
      current: true,
    });
    expect(missing.groups).toEqual([
      expect.objectContaining({ status: "Missing", period: "2025", reasons: ["Not on file."] }),
    ]);
  });

  it("does not change what decides readiness", () => {
    expect(result.ready).toBe(false);
    const without = preparationReadiness({ index, rules, findings, current: true });
    expect(without.unresolved).toEqual(result.unresolved);
    // The legacy text list still collapses the two people's checks into one line; the groups do not.
    expect(
      result.unresolved.filter((u) => u.startsWith("Citizenship evidence: unresolved")),
    ).toHaveLength(1);
  });
});

describe("documents outside the checklist keep what is known about them", () => {
  const version = { sourceFilename: "attachment-45.pdf", contentHash: "a9b60d01ffff" };
  const names: Record<string, string> = { jaylan: "Jaylan Heller", kiel: "Kiel McDermott" };
  const party = (id: string | null) => names[id ?? ""] ?? "Unassigned";
  const seg = (
    docType: string,
    partyId: string | null,
    period: string | null,
    status = "confirmed",
  ) => ({
    isCurrent: true,
    status,
    docType,
    partyId,
    period,
  });
  const name = (history: ReturnType<typeof seg>[], historical = false) =>
    outsideChecklistName(pack, version, history, historical, party);

  it("names a known supporting document by its type, person and period", () => {
    expect(name([seg("BANK_STATEMENT", "jaylan", "2026-07")])).toBe(
      "SUPPORTING_BANK_STATEMENT_Jaylan-Heller_2026-07_a9b60d01.pdf",
    );
  });
  it("does not give a mixed bundle to one person or one period", () => {
    expect(name([seg("PFS_SUPPLEMENT", "jaylan", null), seg("PFS_SUPPLEMENT", "kiel", null)])).toBe(
      "SUPPORTING_PFS_SUPPLEMENT_Several-people_no-period_a9b60d01.pdf",
    );
    expect(
      name([seg("BANK_STATEMENT", "kiel", "2026-07"), seg("BANK_STATEMENT", "kiel", "2026-08")]),
    ).toBe("SUPPORTING_BANK_STATEMENT_Kiel-McDermott_several-periods_a9b60d01.pdf");
    expect(name([seg("BANK_STATEMENT", "kiel", "2026-07"), seg("RESUME", "kiel", null)])).toMatch(
      /^SUPPORTING_MIXED_Kiel-McDermott_several-periods_/,
    );
  });
  it("keeps explicitly not-required and genuinely unfiled documents distinct", () => {
    expect(name([seg("OTHER_NOT_REQUIRED", null, null)])).toMatch(/^NOT_REQUIRED_OTHER_/);
    expect(name([seg("BANK_STATEMENT", "jaylan", "2026-07", "proposed")])).toBe(
      "UNFILED_attachment-45_unassigned_a9b60d01.pdf",
    );
    expect(name([seg("UNREADABLE", null, null)])).toMatch(/^UNFILED_/);
    expect(name([])).toMatch(/^UNFILED_/);
    expect(
      name([{ ...seg("BANK_STATEMENT", "jaylan", "2026-07"), isCurrent: false }], true),
    ).toMatch(/^UNFILED_/);
  });
});

const diff: SnapshotDiff = {
  newly_satisfied: [],
  new_findings: ["CON-03 · Transaction · conflict"],
  resolved_findings: [],
  documents_added: ["amended-purchase-agreement.pdf"],
  documents_superseded: [],
  reviewer_corrections: 0,
  dismissals: [],
  waivers: [],
};
const source = (document: string, value: string, file: string, path: string) => ({
  document,
  value,
  original_file: file,
  package_path: path,
  page: 1,
  quote: `Purchase price ${value}`,
});
const current: FrozenAnswer = {
  state: "current",
  question: "Which purchase price is right?",
  selection: "1,050,000",
  selected_value: true,
  explanation: "Checked both pages. The signed amendment is the latest agreement.",
  recorded_by: "Demo reviewer (reviewer@example.com)",
  recorded_at: "2026-09-27T14:05:03.620Z",
  supporting: [
    source(
      "Purchase agreement",
      "1,050,000",
      "amended-purchase-agreement.pdf",
      "Transaction/TXN-02.pdf",
    ),
  ],
  corrections_needed: [
    source("Letter of intent", "1,000,000", "attachment-1.pdf", "Transaction/TXN-01.pdf"),
    source("Funding plan", "1,000,000", "forwarded.pdf", "Transaction/TXN-03.pdf"),
  ],
  documents_corrected: false,
  summary:
    "Answer recorded. The supporting documents have not been corrected yet; the disagreement stays open until they agree.",
};
const content = (
  answer: FrozenAnswer | null | undefined,
  format: 2 | "legacy" = 2,
): SnapshotContent => ({
  ...(format === 2 ? { format } : {}),
  number: 1,
  deal: {
    code: "VCS-TEST",
    name: "Varnholt Climate Services LLC",
    pack: "sba7a-cho",
    version: "sop-50-10-8-1",
    overlay: null,
  },
  created_at: "2026-09-27T14:05:03.620Z",
  event_ids: [],
  readiness: { satisfied: 40, applicable: 44 },
  preparation: {
    ready: false,
    current: true,
    label: "Preparation work outstanding",
    policy: "Illustrative checklist, awaiting lender review",
    satisfied: 40,
    waived: 0,
    notApplicable: 16,
    applicable: 44,
    unresolved: ["Citizenship evidence · Jaylan Heller: needs_review"],
    ...(format === 2
      ? {
          groups: [
            {
              key: "k",
              title: "Citizenship evidence",
              subject: "Jaylan Heller",
              period: "",
              status: "Needs review",
              reasons: ["Confirm handling with lender"],
            },
          ],
        }
      : {}),
    later: [
      {
        item: "LND-01",
        title: "Credit reports",
        subject: "Transaction",
        responsible: "lender",
        status: "needs_review",
      },
    ],
  },
  footer: "Prepared from documents supplied by the parties.",
  index: [],
  findings: [
    {
      finding_key: "f1",
      rule_id: "CON-03",
      title: "Which purchase price is right?",
      description: "Purchase prices agree.",
      responsible: "broker",
      type: "conflict",
      severity: "blocker",
      party: "Transaction",
      period: null,
      status: "open",
      message: "fail: Values agree across the named sources",
      reason: null,
      ...(answer !== undefined ? { answer } : {}),
      sides: [
        {
          value: "1050000",
          file: "amended-purchase-agreement.pdf",
          page: 1,
          quote: "The aggregate purchase price is $1,050,000",
          package_path: "Transaction/TXN-02.pdf",
        },
        {
          value: '{"dated":true,"signed":true,"party_id":"abc","signature_date":"2026-09-10"}',
          file: "amended-purchase-agreement.pdf",
          page: 1,
          quote: "Signature: e-signed",
          package_path: "Transaction/TXN-02.pdf",
        },
      ],
    },
  ],
  segment_locations: [
    {
      id: "s1",
      type: "BANK_STATEMENT",
      subject: "Jaylan Heller",
      original_filename: "attachment-45.pdf",
      page_start: 1,
      page_end: 1,
      package_path:
        "Z_Unfiled_or_Not_Required/SUPPORTING_BANK_STATEMENT_Jaylan-Heller_2026-07_a9b60d01.pdf",
    },
  ],
  source_record: [],
  change_log: [
    {
      at: "2026-09-27T14:04:00.000Z",
      action: "portal_answer",
      label: "Answer recorded",
      detail: "Which purchase price is right?: 1,050,000",
    },
  ],
  manifest: [
    {
      package_path:
        "Z_Unfiled_or_Not_Required/SUPPORTING_BANK_STATEMENT_Jaylan-Heller_2026-07_a9b60d01.pdf",
      original_filename: "attachment-45.pdf",
      sha256: "x",
      bytes: 1,
    },
    {
      package_path: "Z_Unfiled_or_Not_Required/UNFILED_notes_unassigned_12345678.pdf",
      original_filename: "notes.pdf",
      sha256: "y",
      bytes: 1,
    },
  ],
});
const sheet = (buffer: Buffer, name: string) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(buffer).Sheets[name]!);

describe("the lender file shows a recorded answer beside its disagreement", () => {
  it("states the selection, explanation, attribution, sources and corrections still needed", () => {
    const html = packageReport(content(current), diff);
    for (const text of [
      "Answer recorded (current)",
      "Recorded selection",
      "1,050,000",
      "Checked both pages. The signed amendment is the latest agreement.",
      "Demo reviewer (reviewer@example.com)",
      "27 Sep 2026, 14:05 UTC",
      "Corrections still needed",
      "Letter of intent: 1,000,000 — attachment-1.pdf, page 1 (Transaction/TXN-01.pdf)",
      "No. The documents still disagree; the answer does not change them.",
    ])
      expect(html).toContain(text);
    // The disagreement stays open and readable: amounts and metadata in words, no raw codes.
    expect(html).toContain("1,050,000</td>");
    expect(html).toContain("Signature date: 10 Sep 2026");
    expect(html).not.toMatch(/needs_review|party_id|&quot;dated&quot;/);
    expect(html).toContain("Open");
    const answers = sheet(packageWorkbook(content(current), diff), "Recorded answers");
    expect(answers[0]).toMatchObject({
      "Answer status": "Current",
      "Recorded selection": "1,050,000",
      "Recorded by": "Demo reviewer (reviewer@example.com)",
      "Recorded at": "27 Sep 2026, 14:05 UTC",
      "Supporting documents corrected": "No",
      "Disagreement status": "Open",
    });
    expect(String(answers[0]!["Corrections still needed"])).toContain("Funding plan: 1,000,000");
  });

  it("presents an answer recorded against earlier evidence as not current", () => {
    const stale: FrozenAnswer = {
      ...current,
      state: "not_current",
      supporting: [],
      corrections_needed: [],
      summary:
        "Recorded against earlier evidence. The documents have changed since, so this answer is not current.",
    };
    const html = packageReport(content(stale), diff);
    expect(html).toContain("Not current: earlier evidence");
    expect(html).toContain("not current");
    expect(html).not.toContain("Answer recorded (current)");
    expect(html).not.toContain("Corrections still needed");
    expect(sheet(packageWorkbook(content(stale), diff), "Conflicts")[0]).toMatchObject({
      "Recorded answer": "1,050,000",
      "Answer status": "Not current: earlier evidence",
    });
    expect(packageReport(content(null), diff)).toContain(
      "No answer was recorded for this question when this version was created.",
    );
  });

  it("separates supporting documents from unfiled ones", () => {
    const html = packageReport(content(null), diff);
    expect(html).toContain(
      "Additional supporting document</td><td>Bank statement</td><td>Jaylan Heller",
    );
    expect(html).toContain("Unfiled</td><td>Not filed</td><td></td><td>notes.pdf");
  });

  it("renders a version frozen before this format exactly as it was", () => {
    const legacy = content(undefined, "legacy");
    expect(packageReport(legacy, diff)).toBe(packageReportV1(legacy, diff));
    expect(packageWorkbook(legacy, diff).equals(packageWorkbookV1(legacy, diff))).toBe(true);
    expect(packageReport(legacy, diff)).not.toContain("Recorded selection");
  });
});

describe("labels", () => {
  it("reads codes, dates and values as words", () => {
    expect(statusLabel("needs_review")).toBe("Needs review");
    expect(statusLabel("later_lender")).toBe("Later lender work");
    expect(dateTimeLabel("2026-09-27T14:05:03.620Z")).toBe("27 Sep 2026, 14:05 UTC");
    expect(readableValue("1050000")).toBe("1,050,000");
    expect(readableValue('[{"label":"Buyer cash","amount":150000}]')).toBe(
      "Label: Buyer cash; Amount: 150,000",
    );
  });
});
