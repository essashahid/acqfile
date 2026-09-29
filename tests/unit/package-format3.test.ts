import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { loadPack } from "@/lib/rules/loader";
import { packageReport, packageWorkbook, requiredAction } from "@/lib/deliverables/package";
import { comparison, comparedLabel } from "@/lib/deliverables/comparison";
import {
  diffSnapshots,
  type SnapshotContent,
  type SnapshotDiff,
} from "@/lib/deliverables/snapshot";
import type { FrozenAnswer } from "@/lib/deliverables/answers";
import {
  ANSWER_MEANING,
  laterWorkDetail,
  laterWorkStatus,
  problemTitle,
  typedValue,
} from "@/lib/deliverables/labels";

const pack = loadPack("sop-50-10-8-1");
const rule = (id: string) => [...pack.items, ...pack.consistency].find((r) => r.id === id)!;
const SELLER = "473c2675-38ec-46c7-b54f-c50b7157dbdd";

/** The engine's details for the VCS-2026-015 price disagreement: three prices, three
 * signature records and the whole declared profile. */
const DETAILS = [
  {
    fact_id: "f-loi",
    value: 1000000,
    file: "v-loi",
    page: 1,
    quote: "The total purchase price will be $1,000,000",
  },
  {
    fact_id: "f-apa",
    value: 1050000,
    file: "v-apa",
    page: 1,
    quote: "The aggregate purchase price is $1,050,000",
  },
  { fact_id: "f-su", value: 1000000, file: "v-su", page: 1, quote: "Purchase price $1,000,000" },
  ...["v-loi", "v-apa", "v-su"].map((file) => ({
    fact_id: null,
    value: {
      dated: true,
      signed: true,
      period: null,
      party_id: SELLER,
      signature_date: "2026-08-31",
    },
    file,
    page: 1,
    quote: "Signature: e-signed; Date: 08/31/2026",
  })),
  {
    fact_id: null,
    value: {
      purchase_price: 1000000,
      transaction_category: "initial_acquisition",
      equity_sources: [
        { id: "e1", kind: "cash", party: SELLER, amount: 150000, source_account_last_four: "4321" },
      ],
    },
    file: "Declared deal profile",
    page: null,
    quote:
      'Operator-declared profile; rule parameters: {"price_tolerance":0,"qoe_threshold":3000000}',
  },
];
const FILES: Record<string, [string, string, string]> = {
  "v-loi": ["initial/Seller/attachment-1.pdf", "Transaction/TXN-01_LOI.pdf", "LOI"],
  "v-apa": [
    "amended-purchase-agreement.pdf",
    "Transaction/TXN-02_PURCHASE_AGREEMENT.pdf",
    "PURCHASE_AGREEMENT",
  ],
  "v-su": ["initial/Broker/forwarded.pdf", "Transaction/TXN-03_SOURCES_USES.pdf", "SOURCES_USES"],
};
const priceComparison = () =>
  comparison({
    rule: rule("CON-03"),
    details: DETAILS,
    facts: Object.entries(FILES).map(([v]) => ({
      id: `f-${v.slice(2)}`,
      attribute: "deal.purchase_price",
      segmentId: `s-${v}`,
    })),
    segments: Object.entries(FILES).map(([v, [, , type]]) => ({ id: `s-${v}`, docType: type })),
    profile: DETAILS.at(-1)!.value as Record<string, unknown>,
    parameters: { price_tolerance: 0, qoe_threshold: 3000000 },
    fileName: (v) => FILES[v]?.[0] ?? v,
    packagePath: (v) => FILES[v]?.[1] ?? "",
    partyName: (id) => (id === SELLER ? "Varnholt Climate Services LLC" : "Unassigned"),
  });

const source = (document: string, value: string, file: string, path: string) => ({
  document,
  value,
  original_file: file,
  package_path: path,
  page: 1,
  quote: "",
});
const current: FrozenAnswer = {
  state: "current",
  question: "Which purchase price is right?",
  selection: "1,050,000",
  selected_value: true,
  explanation: "Checked both pages. The signed amendment is the latest agreement.",
  recorded_by: "Demo Reviewer (reviewer@example.com)",
  recorded_at: "2026-09-28T10:17:00.000Z",
  supporting: [
    source(
      "Purchase agreement",
      "1,050,000",
      "amended-purchase-agreement.pdf",
      "Transaction/TXN-02_PURCHASE_AGREEMENT.pdf",
    ),
  ],
  corrections_needed: [
    source(
      "Funding plan",
      "1,000,000",
      "initial/Broker/forwarded.pdf",
      "Transaction/TXN-03_SOURCES_USES.pdf",
    ),
    source(
      "Letter of intent",
      "1,000,000",
      "initial/Seller/attachment-1.pdf",
      "Transaction/TXN-01_LOI.pdf",
    ),
  ],
  documents_corrected: false,
  summary:
    "Answer recorded. The supporting documents have not been corrected yet; the disagreement stays open until they agree.",
};
const stale: FrozenAnswer = {
  ...current,
  state: "not_current",
  supporting: [],
  corrections_needed: [],
  summary:
    "Recorded against earlier evidence. The documents have changed since, so this answer is not current.",
};

const later = (
  item: string,
  status: string,
  tracking: string | null,
  checks = [
    {
      type: "tracking",
      result: status === "satisfied" ? "pass" : "unknown",
      message: "Lender-ordered item received",
    },
  ],
  paths: string[] = [],
) => ({
  item_id: item,
  item: {
    "LND-01": "Credit reports",
    "LND-02": "IRS transcripts",
    "LND-03": "Lien searches",
    "LND-04": "Insurance",
    "TXN-08": "Independent business valuation",
  }[item]!,
  party: "Transaction",
  period: "",
  status,
  package_paths: paths,
  original_filenames: [],
  file_hashes: [],
  document_date: "",
  open_findings: 0,
  rule_verified: "unverified" as const,
  checks,
  segments: [],
  scope_key: "deal",
  folder: "Transaction",
  responsible: "lender",
  submission_stage: "later_lender",
  decision_reason: "",
  tracking,
});

function content({
  status = "open",
  answer,
  number = 1,
}: { status?: string; answer?: FrozenAnswer | null; number?: number } = {}): SnapshotContent {
  const { sides, consulted } = priceComparison();
  const index = [
    later("LND-01", "needs_review", null),
    later("LND-02", "tracking", "ordered", [
      { type: "tracking", result: "fail", message: "Lender-ordered item received" },
    ]),
    later("LND-03", "satisfied", "received", undefined, ["Transaction/LND-03_LIEN_SEARCH.pdf"]),
    later("LND-04", "satisfied", "received"),
    later("TXN-08", "needs_review", null, [
      {
        type: "manual_confirmation",
        result: "unknown",
        message: "Confirm with lender whether required",
      },
      { type: "tracking", result: "unknown", message: "Lender-ordered item received" },
    ]),
  ];
  return {
    format: 3,
    number,
    previous_version: number === 1 ? null : number - 1,
    deal: {
      code: "VCS-TEST",
      name: "Varnholt Climate Services LLC",
      pack: "sba7a-cho",
      version: "sop-50-10-8-1",
      overlay: null,
    },
    created_at: "2026-09-28T10:18:00.000Z",
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
      unresolved: ["Purchase prices agree: unresolved conflict."],
      groups:
        status === "open"
          ? [
              {
                key: "CON-03|deal|",
                title: "Purchase prices agree",
                subject: "Transaction",
                period: "",
                status: "Documents disagree",
                reasons: ["Values agree across the named sources"],
                finding_key: "f1",
              },
            ]
          : [],
      later: index.map((r) => ({
        item: r.item_id,
        title: r.item,
        subject: r.party,
        responsible: "lender",
        status: r.status,
        tracking: r.tracking,
        tracking_label: laterWorkStatus(r.status, r.tracking),
        detail: laterWorkDetail({
          status: r.status,
          tracking: r.tracking,
          checks: r.checks,
          filed: r.package_paths.length > 0,
        }),
      })),
    },
    footer: "Prepared from documents supplied by the parties.",
    index,
    findings: [
      {
        finding_key: "f1",
        rule_id: "CON-03",
        title: "Which purchase price is right?",
        problem_title: problemTitle("Purchase prices agree", status),
        compared: comparedLabel(rule("CON-03")),
        description: "Purchase prices agree. Evidence preparation check for lender review.",
        responsible: "broker",
        type: "conflict",
        severity: "blocker",
        party: "Transaction",
        period: null,
        status,
        message: "fail: Values agree across the named sources",
        reason: null,
        answer: answer ?? null,
        sides,
        evidence_consulted: consulted,
      },
    ],
    segment_locations: [],
    source_record: [],
    change_log: [
      {
        at: "2026-09-28T09:00:00.000Z",
        action: "facts_extracted",
        label: "Values read from a document",
        detail: "{}",
      },
    ],
    manifest: [],
  };
}
const diff: SnapshotDiff = {
  newly_satisfied: ["LND-03 · Transaction"],
  new_findings: [],
  resolved_findings: [],
  documents_added: ["amended-purchase-agreement.pdf"],
  documents_superseded: [],
  reviewer_corrections: 0,
  dismissals: [],
  waivers: [],
};
const sheet = (buffer: Buffer, name: string) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(buffer).Sheets[name]!);
/** The reader-facing conflict: the question section of the report. */
const conflictSection = (html: string) =>
  html.slice(
    html.indexOf("<h2>Questions and recorded answers"),
    html.indexOf("<h2>Missing and incomplete"),
  );

describe("a disagreement reads as the problem it is", () => {
  it("states the open condition as a problem, never as a passed check", () => {
    expect(problemTitle("Purchase prices agree", "open")).toBe("Purchase prices do not agree");
    expect(problemTitle("Seller identity agrees", "requested")).toBe(
      "Seller identity does not agree",
    );
    expect(problemTitle("Ownership agrees and totals 100", "open")).toBe(
      "Ownership does not agree or total 100",
    );
    expect(problemTitle("Sources total equals uses total", "open")).toBe(
      "Sources total does not equal uses total",
    );
    expect(problemTitle("Transaction dates remain current", "open")).toBe(
      "Transaction dates do not remain current",
    );
    expect(problemTitle("Lease horizon: for lender review", "open")).toBe(
      "Lease horizon: for lender review",
    );
    expect(problemTitle("Purchase prices agree", "resolved")).toBe("Purchase prices agree");
  });

  it("an unresolved disagreement without an answer", () => {
    const html = packageReport(content(), diff);
    const section = conflictSection(html);
    expect(section).toContain("<h3>Purchase prices do not agree</h3>");
    expect(section).toContain(
      "CON-03 · Transaction · Responsible: Broker · Open · Documents disagree",
    );
    expect(section).toContain("Question asked: Which purchase price is right?");
    expect(section).toContain(
      "Required action: Confirm which purchase price is correct, then correct the documents that differ, or provide updated documents, so the cited sources show the same purchase price.",
    );
    expect(section).toContain(
      "No answer was recorded for this question when this version was created.",
    );
    // The unresolved-work row says the same thing.
    expect(html).toContain(
      "<td>Purchase prices do not agree</td><td>Transaction</td><td></td><td>Documents disagree</td>",
    );
    expect(html).not.toContain("Purchase prices agree");
    expect(html).not.toContain("Values agree across the named sources");
  });

  it("an unresolved disagreement with a current answer", () => {
    const html = packageReport(content({ answer: current }), diff);
    const section = conflictSection(html);
    const action =
      "Correct the letter of intent and funding plan, or provide updated documents, so the cited sources show the same purchase price.";
    expect(section).toContain(`Required action: ${action}`);
    expect(section).toContain("Answer recorded (current)");
    expect(section).toContain("No. The documents still disagree; the answer does not change them.");
    expect(html).toContain(`<td>Documents disagree</td><td>${action}</td>`);
    const conflicts = sheet(packageWorkbook(content({ answer: current }), diff), "Conflicts");
    expect(conflicts[0]).toMatchObject({
      Status: "Open",
      "Issue title": "Purchase prices do not agree",
      "Description / question": "Which purchase price is right?",
      "Required action": action,
      "Recorded answer": "1,050,000",
    });
    expect(
      sheet(packageWorkbook(content({ answer: current }), diff), "Recorded answers")[0],
    ).toMatchObject({
      "Disagreement status": "Open",
      "Supporting documents corrected": "No",
      "Required action": action,
    });
  });

  it("a stale answer after the evidence changed", () => {
    const section = conflictSection(packageReport(content({ answer: stale }), diff));
    expect(section).toContain("Not current: earlier evidence");
    expect(section).toContain(
      "Required action: The recorded answer refers to earlier evidence. Confirm the correct purchase price against the current documents, then correct the documents that differ, or provide updated documents, so the cited sources show the same purchase price.",
    );
    expect(section).not.toContain("Answer recorded (current)");
  });

  it("a resolved disagreement after the documents were corrected", () => {
    const resolved = content({
      status: "resolved",
      answer: {
        ...stale,
        documents_corrected: true,
        summary: "Recorded before the documents changed.",
      },
    });
    const html = packageReport(resolved, diff);
    expect(conflictSection(html)).toContain("No open questions.");
    expect(html).not.toContain("do not agree");
    expect(requiredAction(resolved.findings[0]!)).toBe("None. The cited sources now agree.");
    expect(sheet(packageWorkbook(resolved, diff), "Conflicts")[0]).toMatchObject({
      Status: "Resolved",
      "Issue title": "Purchase prices agree",
      "Required action": "None. The cited sources now agree.",
    });
  });
});

describe("a disagreement shows only the values it compares", () => {
  it("keeps the three prices and the declared price; moves signature details and the profile aside", () => {
    const { sides, consulted } = priceComparison();
    expect(sides.map((s) => [s.source, s.display, s.file, s.page, s.package_path])).toEqual([
      [
        "Letter of intent",
        "$1,000,000",
        "initial/Seller/attachment-1.pdf",
        1,
        "Transaction/TXN-01_LOI.pdf",
      ],
      [
        "Purchase agreement",
        "$1,050,000",
        "amended-purchase-agreement.pdf",
        1,
        "Transaction/TXN-02_PURCHASE_AGREEMENT.pdf",
      ],
      [
        "Funding plan",
        "$1,000,000",
        "initial/Broker/forwarded.pdf",
        1,
        "Transaction/TXN-03_SOURCES_USES.pdf",
      ],
      ["Deal profile", "$1,000,000", "Deal profile", null, ""],
    ]);
    expect(consulted.map((c) => c.kind)).toEqual([
      "Document details",
      "Document details",
      "Document details",
      "Deal profile",
    ]);
    expect(consulted[0]!.detail).toBe(
      "Signed: Yes; Dated: Yes; Signature date: 31 Aug 2026; Period: Not stated; Filed to: Varnholt Climate Services LLC",
    );
    expect(consulted[3]!.detail).toBe(
      "Declared deal profile; rule settings applied: Price tolerance: 0",
    );
    expect(JSON.stringify(consulted)).not.toContain(SELLER);
  });

  it("no identifier, raw code, rule parameter or misformatted account number reaches the reader", () => {
    const html = packageReport(content({ answer: current }), diff);
    const section = conflictSection(html);
    expect(section).toContain("<td>Deal profile</td><td>$1,000,000</td>");
    for (const text of [
      SELLER,
      "initial_acquisition",
      "4,321",
      "price_tolerance",
      "qoe_threshold",
      "party_id",
      "Signature: e-signed",
      "{&quot;",
    ])
      expect(section).not.toContain(text);
    const conflicts = sheet(
      packageWorkbook(content({ answer: current }), diff),
      "Conflicts",
    ).filter((r) => r.Rule);
    expect(conflicts.map((r) => r.Source)).toEqual([
      "Letter of intent",
      "Purchase agreement",
      "Funding plan",
      "Deal profile",
    ]);
    for (const text of [
      SELLER,
      "initial_acquisition",
      "4,321",
      "price_tolerance",
      "Signature: e-signed",
    ])
      expect(JSON.stringify(conflicts)).not.toContain(text);
    const consulted = sheet(
      packageWorkbook(content({ answer: current }), diff),
      "Evidence consulted",
    );
    expect(consulted.filter((r) => r.Rule)).toHaveLength(4);
    expect(JSON.stringify(consulted)).not.toContain(SELLER);
  });

  it("formats values by their type; an account ending is never a number", () => {
    expect(typedValue(1050000, "money")).toBe("$1,050,000");
    expect(typedValue({ amount: 25000.5, currency: "USD" }, "money")).toBe("$25,000.50");
    expect(typedValue({ last_four: "4321" }, "identifier")).toBe("ending 4321");
    expect(typedValue("0042", "masked_identifier")).toBe("ending 0042");
    expect(typedValue("2026-09-10", "date")).toBe("10 Sep 2026");
    expect(typedValue([{ name: "Kiel McDermott", percent: 60 }], "owners")).toBe(
      "Kiel McDermott 60%",
    );
  });
});

describe("later lender work says what is actually recorded", () => {
  it("covers every tracking state", () => {
    expect(laterWorkDetail({ status: "needs_review", tracking: null })).toBe(
      "Lender-ordered item; not included in this preparation package.",
    );
    expect(laterWorkDetail({ status: "tracking", tracking: "not_started" })).toBe(
      "Lender-ordered item; recorded as not started. Not included in this preparation package.",
    );
    expect(laterWorkDetail({ status: "tracking", tracking: "ordered" })).toBe(
      "Ordered by the lender; not yet received. Not included in this preparation package.",
    );
    expect(laterWorkDetail({ status: "satisfied", tracking: "received", filed: true })).toBe(
      "Recorded as received by the lender. A document is filed in this package.",
    );
    expect(laterWorkDetail({ status: "satisfied", tracking: "received" })).toBe(
      "Recorded as received by the lender. Not included in this preparation package.",
    );
    expect(
      laterWorkDetail({
        status: "not_applicable",
        decision_reason: "The configured applicability condition is false.",
      }),
    ).toBe("The configured applicability condition is false.");
    expect(
      laterWorkDetail({
        status: "needs_review",
        tracking: null,
        checks: [
          {
            type: "manual_confirmation",
            result: "unknown",
            message: "Confirm with lender whether required",
          },
          { type: "tracking", result: "unknown", message: "Lender-ordered item received" },
        ],
      }),
    ).toBe(
      "Confirm with lender whether required. Lender-ordered item; not included in this preparation package.",
    );
    expect(laterWorkStatus("needs_review", null)).toBe("Not recorded");
    expect(laterWorkStatus("tracking", "ordered")).toBe("Ordered");
    expect(laterWorkStatus("satisfied", "received")).toBe("Received");
    expect(laterWorkStatus("not_applicable", null)).toBe("Not applicable");
  });

  it("never says received without a recorded receipt, in the report, missing items or status summary", () => {
    const c = content();
    const html = packageReport(c, diff);
    expect(html).not.toContain("Lender-ordered item received");
    expect(html).toContain(
      "<td>LND-01</td><td>Credit reports</td><td>Transaction</td><td>Lender</td><td>Not recorded</td><td>Lender-ordered item; not included in this preparation package.</td>",
    );
    expect(html).toContain(
      "<td>Ordered</td><td>Ordered by the lender; not yet received. Not included in this preparation package.</td>",
    );
    const book = packageWorkbook(c, diff);
    expect(sheet(book, "Missing items").find((r) => r.Item === "LND-01")).toMatchObject({
      Status: "Not recorded",
      Why: "Lender-ordered item; not included in this preparation package.",
    });
    expect(sheet(book, "Status summary")).toContainEqual(
      expect.objectContaining({
        Section: "Later lender work",
        Item: "Lien searches",
        "Status / detail":
          "Received — Recorded as received by the lender. A document is filed in this package.",
      }),
    );
    for (const name of XLSX.read(book).SheetNames)
      expect(JSON.stringify(sheet(book, name))).not.toContain("Lender-ordered item received");
  });
});

describe("the first version does not pretend a previous one exists", () => {
  it("version 1 says initial version and lists no version-to-version changes", () => {
    const c = content();
    const html = packageReport(c, diff);
    expect(html).toContain("<h2>Initial version</h2>");
    expect(html).not.toContain("Changes since");
    expect(html).not.toContain("Newly satisfied");
    const log = sheet(packageWorkbook(c, diff), "Change log");
    expect(log.map((r) => r.Action)).not.toContain("Newly satisfied");
    expect(log.map((r) => r.Action)).toContain("Values read from a document");
  });

  it("a later version compares with the one before it", () => {
    const c = content({ number: 2 });
    const html = packageReport(c, diff);
    expect(html).toContain("<h2>Changes since version 1</h2>");
    expect(html).toContain("<td>Newly satisfied</td><td>LND-03 · Transaction</td>");
    expect(sheet(packageWorkbook(c, diff), "Change log")[0]).toMatchObject({
      Action: "Newly satisfied",
    });
  });

  it("a finding raised and settled before the first version is not a resolution", () => {
    const first = content({ status: "resolved" });
    expect(diffSnapshots(null, first).resolved_findings).toEqual([]);
    const later = content({ status: "resolved", number: 2 });
    expect(diffSnapshots(content({ status: "open" }), later).resolved_findings).toEqual([
      "CON-03 · Transaction · conflict",
    ]);
  });
});

describe("a recorded answer is described as the reviewer's preferred value", () => {
  it("in the report and the workbook", () => {
    const c = content({ answer: current });
    expect(ANSWER_MEANING).toBe(
      "A recorded answer captures the reviewer’s preferred value and reason. It does not change the supporting documents or close the disagreement.",
    );
    expect(packageReport(c, diff)).toContain(ANSWER_MEANING);
    expect(packageReport(c, diff)).not.toContain("which value the file should use");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      XLSX.read(packageWorkbook(c, diff)).Sheets["Recorded answers"]!,
      { header: 1 },
    );
    expect(rows.map((r) => r[0])).toContain(ANSWER_MEANING);
  });
});

describe("the workbook is practical to inspect", () => {
  it("freezes and filters the header, wraps text, and prints landscape with repeated headers", async () => {
    const zip = await JSZip.loadAsync(packageWorkbook(content({ answer: current }), diff));
    const workbook = await zip.file("xl/workbook.xml")!.async("string");
    const styles = await zip.file("xl/styles.xml")!.async("string");
    expect(styles).toContain('<xf numFmtId="0" fontId="1" fillId="2" borderId="1"');
    expect(styles).toContain('<alignment vertical="top" wrapText="1"/>');
    const names = XLSX.read(await zip.generateAsync({ type: "nodebuffer" })).SheetNames;
    for (const [i, name] of names.entries()) {
      const xml = await zip.file(`xl/worksheets/sheet${i + 1}.xml`)!.async("string");
      expect(xml, name).toContain('state="frozen"');
      expect(xml, name).toContain('orientation="landscape"');
      // Scaled to a few pages across, never cut at full size into many.
      expect(xml, name).toContain('<pageSetUpPr fitToPage="1"/>');
      const across = Number(/fitToWidth="(\d+)" fitToHeight="0"/.exec(xml)?.[1]);
      expect(across, name).toBeGreaterThanOrEqual(1);
      expect(across, name).toBeLessThanOrEqual(3);
      expect(xml, name).toMatch(/<c r="A1" s="1"/);
      expect(workbook, name).toContain(
        `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${name}'!$1:$1</definedName>`,
      );
    }
    const conflicts = await zip.file("xl/worksheets/sheet3.xml")!.async("string");
    expect(conflicts).toContain('<autoFilter ref="A1:R5"/>');
    expect(conflicts).toMatch(/<c r="A2" s="2"/);
  });

  it("is deterministic", () => {
    const c = content({ answer: current });
    expect(packageWorkbook(c, diff).equals(packageWorkbook(c, diff))).toBe(true);
  });
});

describe("the package names people and records, never their internal ids", () => {
  const REVIEWER = "9a3c1f2e-5b7d-4e8f-a1b2-c3d4e5f60718";
  const FACT = "091893a1-3f0f-4dc2-b350-4fa456602677";
  const SEGMENT = "ac4a2852-5b7b-4250-836c-afab5ece251f";
  const EVENT = "b95aa78f-ba08-468f-855c-bfbe057ca518";
  const KEY = "e56921646c0189246aff8989211537d49e96f6f980c96b40082923277bf59ea4";
  const HMAC = "9f2d0e5ef05f6ccc18f7cc786724a3a736dade119175d484d70506d572866596";
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const row = (over: Partial<SnapshotContent["source_record"][number]>) => ({
    fact_id: FACT,
    subject: "Transaction",
    attribute: "deal.purchase_price",
    value: "1050000",
    period: "",
    original_filename: "amended-purchase-agreement.pdf",
    package_path: "Transaction/TXN-02_PURCHASE_AGREEMENT.pdf",
    page: 1,
    quote: "The aggregate purchase price is $1,050,000",
    method: "text",
    confidence: 1,
    review_status: "auto_accepted",
    reviewer: "",
    reviewed_at: "",
    file_hash: "0e90df6369ab9b61813208a942e9b8071b5e6483a1e430f7431a4f5bf8550d95",
    record_version: 1,
    audit_event: EVENT,
    support_kind: "text",
    ...over,
  });
  const withIds = (): SnapshotContent => {
    const c = content({ answer: current });
    c.event_ids = [EVENT];
    c.findings[0]!.finding_key = KEY;
    c.source_record = [
      row({}),
      row({
        fact_id: "0920a526-7996-4a39-9a0c-df7a87a8d2d8",
        value: "1000000",
        review_status: "accepted",
        reviewer: REVIEWER,
        reviewer_name: "Demo Reviewer (reviewer@example.com)",
        reviewed_at: "2026-09-28T10:10:00.000Z",
      }),
      // Frozen without a name (the reviewer's account is unknown to the package).
      row({ fact_id: "13929fac-db12-4f50-ba70-a4189db2e511", reviewer: REVIEWER }),
      // A taxpayer identifier is stored with a keyed hash; only its last four are shown.
      row({
        fact_id: "4c4d8a3e-1b2f-4e8f-9a0b-1c2d3e4f5a6b",
        attribute: "party.identifier",
        value: JSON.stringify({ hmac: HMAC, last_four: "4321" }),
        package_path: "Buyer/ENT-04_EIN_LETTER.pdf",
      }),
    ];
    c.segment_locations = [
      {
        id: SEGMENT,
        type: "PURCHASE_AGREEMENT",
        subject: "Varnholt Climate Services LLC",
        original_filename: "amended-purchase-agreement.pdf",
        page_start: 1,
        page_end: 1,
        package_path: "Transaction/TXN-02_PURCHASE_AGREEMENT.pdf",
      },
    ];
    // A detail captured as raw event data still never exports the reference.
    c.change_log.push({
      at: "2026-09-28T09:01:00.000Z",
      action: "file_uploaded",
      label: "File uploaded",
      detail: `amended-purchase-agreement.pdf; arrival ${EVENT}`,
    });
    return c;
  };
  const allText = (buffer: Buffer) => {
    const book = XLSX.read(buffer);
    return book.SheetNames.map((n) => XLSX.utils.sheet_to_csv(book.Sheets[n]!)).join("\n");
  };

  it("report and workbook contain no record ids, account ids or finding keys", () => {
    const c = withIds();
    const html = packageReport(c, diff);
    const text = allText(packageWorkbook(c, diff));
    for (const out of [html, text]) {
      expect(out).not.toMatch(UUID);
      for (const id of [REVIEWER, FACT, SEGMENT, EVENT, KEY, HMAC]) expect(out).not.toContain(id);
      expect(out).not.toMatch(/hmac/i);
    }
    // Checksums of the original files stay: they let a lender verify the bytes.
    expect(text).toContain("0e90df6369ab9b61813208a942e9b8071b5e6483a1e430f7431a4f5bf8550d95");
  });

  it("names the reviewer who accepted a value, or the role when the account is unknown", () => {
    const records = sheet(packageWorkbook(withIds(), diff), "Source record").filter(
      (r) => r.Attribute,
    );
    // Rows sort by file, page, attribute and value: the EIN letter, then $1,000,000.
    expect(records.map((r) => [r.Attribute, r.Value, r.Reviewer ?? ""])).toEqual([
      ["party.identifier", "ending 4321", ""],
      ["deal.purchase_price", "$1,000,000", "Demo Reviewer (reviewer@example.com)"],
      ["deal.purchase_price", "$1,050,000", ""],
      ["deal.purchase_price", "$1,050,000", "Operator"],
    ]);
    expect(Object.keys(records[0]!)).not.toContain("Fact id");
    expect(Object.keys(records[0]!)).not.toContain("Audit event");
    const conflicts = sheet(packageWorkbook(withIds(), diff), "Conflicts").filter((r) => r.Rule);
    expect(new Set(conflicts.map((r) => r.Finding))).toEqual(new Set([1]));
    const segments = sheet(packageWorkbook(withIds(), diff), "Segment locations").filter(
      (r) => r.Type,
    );
    expect(segments.map((r) => r.Segment)).toEqual([1]);
    const log = sheet(packageWorkbook(withIds(), diff), "Change log").filter((r) => r.Action);
    expect(Object.keys(log[0]!)).not.toContain("Action code");
    expect(log.at(-1)!.Detail).toBe("amended-purchase-agreement.pdf; arrival [internal reference]");
  });
});

describe("stored values read as words, never as stored records", () => {
  it("identifiers, amounts, debt schedules, lists and owners", () => {
    expect(typedValue({ hmac: "9f2d0e5e", last_four: "4321" }, "identifier")).toBe("ending 4321");
    expect(typedValue({ hmac: "9f2d0e5e", last_four: "4321" }, undefined)).toBe("ending 4321");
    expect(
      typedValue(
        [
          { label: "Senior loan", amount: 900000 },
          { label: "Buyer cash", amount: 150000 },
        ],
        "amounts",
      ),
    ).toBe("Senior loan $900,000; Buyer cash $150,000");
    expect(
      typedValue([{ creditor: "First Bank", balance: 250000, payment: 3100.5 }], "debts"),
    ).toBe("Creditor: First Bank; Balance: $250,000; Payment: $3,100.50");
    expect(typedValue(["2023", "2024"], "strings")).toBe("2023; 2024");
    expect(typedValue({ name: "A", party_id: "x", token: "t", secret_hash: "h" }, undefined)).toBe(
      "Name: A",
    );
  });
});
