import { expect, it } from "vitest";
import { hashObject } from "@/lib/hash";
import { loadPack } from "@/lib/rules/loader";
import { mapDeal, type Data, type ResponseRow } from "@/lib/portal/map";
import type { IndexRow } from "@/lib/deliverables/index-build";

const pack = loadPack("sop-50-10-8");
const row = (status: string, checks: IndexRow["checks"] = []): IndexRow => ({
  item_id: "GUA-02",
  item: "Personal statement",
  party: "Buyer",
  period: "",
  status,
  package_paths: [],
  original_filenames: [],
  file_hashes: [],
  document_date: "",
  open_findings: 0,
  rule_verified: "unverified",
  checks,
  segments: [],
  scope_key: "buyer",
  folder: "",
});
const data = (rows: IndexRow[] = []): Data =>
  ({
    deal: { profileJson: { equity_sources: [], structure: "asset" } },
    pack,
    parties: [{ id: "buyer", legalName: "Buyer", kind: "individual", roles: ["buyer_owner"] }],
    rules: new Map([...pack.items, ...pack.consistency].map((rule) => [rule.id, rule])),
    index: rows,
    findings: [],
    segments: [],
    submittedSegments: [],
    facts: [],
    versions: [],
  }) as unknown as Data;
const reply = (taskKey: string, kind: string, payload: Record<string, unknown>): ResponseRow =>
  ({
    id: crypto.randomUUID(),
    taskKey,
    kind,
    payload,
    createdAt: new Date("2026-09-15T12:00:00Z"),
  }) as ResponseRow;
const finding = (
  ruleId: string,
  details: {
    fact_id: string | null;
    value: unknown;
    file: string;
    page: number | null;
    quote: string;
  }[],
) => ({
  findingKey: hashObject([ruleId, "deal", null]),
  ruleId,
  scopeKey: "deal",
  period: null,
  status: "open",
  type: "conflict",
  detailsJson: { details },
});
const detail = (id: string, value: unknown, file = "v1") => ({
  fact_id: id,
  value,
  file,
  page: 1,
  quote: String(value),
});
function question(
  ruleId: string,
  facts: { id: string; attribute: string; value: unknown; version?: string }[],
  profile?: Record<string, unknown>,
) {
  const d = data();
  d.deal.profileJson = { ...d.deal.profileJson, ...profile };
  d.facts = facts.map((fact, i) => ({
    id: fact.id,
    segmentId: `s${i}`,
    attribute: fact.attribute,
    valueJson: fact.value,
    normalizedValueJson: fact.value,
    recordVersion: 1,
  })) as Data["facts"];
  d.segments = facts.map((fact, i) => ({
    id: `s${i}`,
    documentVersionId: fact.version ?? `v${i}`,
    docType: "LEASE",
    partyId: "buyer",
  })) as Data["segments"];
  d.findings = [
    finding(ruleId, [
      ...facts.map((fact) => detail(fact.id, fact.value, fact.version)),
      {
        fact_id: null,
        value: d.deal.profileJson,
        file: "Declared deal profile",
        page: null,
        quote: "",
      },
    ]),
  ] as Data["findings"];
  return d;
}

it("moves a photo through staff review, a specific signature request, replacement review and done", () => {
  const d = data([row("missing")]);
  d.index[0]!.item_id = "GUA-01";
  const key = mapDeal(d).tasks[0]!.key;
  const first = reply(key, "upload", { versions: ["v1"], photos: true });
  d.versions = [
    { id: "v1", processingStatus: "processing", parseStatus: "parsed" },
  ] as Data["versions"];
  expect(mapDeal(d, [first]).tasks[0]!.state).toBe("With us for review");
  d.versions[0]!.processingStatus = "completed_with_review";
  expect(mapDeal(d, [first]).tasks[0]!.state).toBe("With us for review");
  d.submittedSegments = [
    {
      id: "s1",
      documentVersionId: "v1",
      docType: "SBA_413",
      period: null,
      classificationMethod: "manual",
      status: "confirmed",
      isCurrent: true,
    },
  ] as Data["segments"];
  d.index = [
    row("received_with_issues", [{ type: "signed_and_dated", result: "fail", message: "" }]),
  ];
  d.index[0]!.item_id = "GUA-01";
  expect(mapDeal(d, [first]).tasks[0]).toMatchObject({
    state: "To do",
    sentence: expect.stringContaining("sign and date"),
  });
  const replacement = reply(key, "upload", { versions: ["v2"], photos: true });
  replacement.createdAt = new Date("2026-09-16T12:00:00Z");
  d.versions.push({
    id: "v2",
    processingStatus: "processing",
    parseStatus: "parsed",
  } as Data["versions"][number]);
  expect(mapDeal(d, [first, replacement]).tasks[0]!.state).toBe("With us for review");
  d.versions[1]!.processingStatus = "completed";
  d.submittedSegments = [
    {
      id: "s2",
      documentVersionId: "v2",
      docType: "SBA_413",
      period: null,
      classificationMethod: "manual",
      status: "confirmed",
      isCurrent: true,
    },
  ] as Data["segments"];
  d.index = [row("satisfied")];
  d.index[0]!.item_id = "GUA-01";
  expect(mapDeal(d, [first, replacement]).tasks[0]!.state).toBe("Done");
  expect(mapDeal(d, [first, replacement]).tasks[0]!.state).toBe("Done");
});

it("keeps uncertain and staff-owned issues with staff, and reports processing failure truthfully", () => {
  const d = data([row("needs_review")]);
  const key = mapDeal(d).tasks[0]!.key;
  const upload = reply(key, "upload", { versions: ["v1"], photos: true });
  d.versions = [
    { id: "v1", processingStatus: "completed_with_review", parseStatus: "parsed" },
  ] as Data["versions"];
  expect(mapDeal(d, [upload]).tasks[0]!.state).toBe("With us for review");
  d.index = [row("received_with_issues", [{ type: "arithmetic", result: "fail", message: "" }])];
  expect(mapDeal(d, [upload]).tasks[0]!.state).toBe("With us for review");
  d.versions[0]!.processingStatus = "failed";
  d.index = [row("missing")];
  expect(mapDeal(d, [upload]).tasks[0]).toMatchObject({
    state: "To do",
    sentence: expect.stringContaining("couldn't read"),
  });
});

it("uses the named rule's title and a response shape that matches its facts", () => {
  const structure = mapDeal(
    question("CON-11", [{ id: "structure", attribute: "deal.structure", value: "stock" }]),
  ).questions[0]!;
  expect(structure).toMatchObject({
    title: "What is the purchase structure?",
    kind: "choice",
    values: ["stock", "asset"],
  });
  const address = mapDeal(
    question("CON-12", [
      { id: "a1", attribute: "party.address", value: "First Street" },
      { id: "a2", attribute: "party.address", value: "Second Street" },
    ]),
  ).questions[0]!;
  expect(address).toMatchObject({ title: "Which business address should we use?", kind: "choice" });
  const consulting = mapDeal(
    question("CON-14", [{ id: "term", attribute: "consulting.term_months", value: 18 }]),
  ).questions[0]!;
  expect(consulting).toMatchObject({
    title: "What is the consulting period?",
    kind: "clarification",
    values: [],
  });
  const lease = question("CON-13", [
    { id: "expiry", attribute: "lease.expiry", value: "2028-01-01" },
    { id: "years", attribute: "lease.option_years", value: 5 },
  ]);
  const leaseQuestion = mapDeal(lease).questions[0]!;
  expect(leaseQuestion).toMatchObject({ kind: "clarification", values: [] });
  const answered = mapDeal(lease, [
    reply(leaseQuestion.key, "answer", {
      choice: "clarification",
      note: "The option follows expiry.",
      evidenceKey: leaseQuestion.evidenceKey,
    }),
  ]);
  expect(answered.tasks.every((task) => !task.sentence.includes("corrected copy"))).toBe(true);
  lease.findings[0]!.ruleId = "CON-99";
  expect(mapDeal(lease).questions[0]).toMatchObject({
    kind: "staff_review",
    title: "Your adviser needs to review these details",
  });
});

it("keeps old answers historical when values, revisions or source versions change", () => {
  const d = question(
    "CON-03",
    [
      { id: "price1", attribute: "deal.purchase_price", value: 2000000, version: "old-loi" },
      { id: "price2", attribute: "deal.purchase_price", value: 2100000, version: "old-contract" },
    ],
    { purchase_price: 2000000 },
  );
  const first = mapDeal(d).questions[0]!;
  const old = reply(first.key, "answer", {
    choice: "2,000,000",
    note: "Seller confirmed",
    evidenceKey: first.evidenceKey,
  });
  expect(mapDeal(d, [old]).openQuestions).toHaveLength(0);
  expect(mapDeal(d, [old]).openQuestions).toHaveLength(0);
  d.segments[0]!.documentVersionId = "new-copy-same-amount";
  (d.findings[0]!.detailsJson as { details: { file: string }[] }).details[0]!.file =
    "new-copy-same-amount";
  expect(mapDeal(d, [old]).questions[0]).toMatchObject({ answered: false, history: [old] });
  d.facts[0]!.recordVersion = 2;
  d.facts[0]!.valueJson = 3000000;
  d.facts[1]!.valueJson = 4000000;
  d.segments[0]!.documentVersionId = "new-loi";
  d.segments[1]!.documentVersionId = "new-contract";
  d.findings = [
    finding("CON-03", [
      detail("price1", 3000000, "new-loi"),
      detail("price2", 4000000, "new-contract"),
    ]),
  ] as Data["findings"];
  const changed = mapDeal(d, [old]).questions[0]!;
  expect(changed.answered).toBe(false);
  expect(changed.history).toContain(old);
  expect(changed.evidenceKey).not.toBe(first.evidenceKey);
  const current = reply(first.key, "answer", {
    choice: "3,000,000",
    note: "Current price",
    evidenceKey: changed.evidenceKey,
  });
  expect(mapDeal(d, [old, current]).openQuestions).toHaveLength(0);
  expect(mapDeal(d, [old, current]).questions[0]!.history).toHaveLength(2);
  d.findings = [];
  expect(mapDeal(d, [old, current]).questions).toHaveLength(0);
  expect([old, current]).toHaveLength(2);
});

it("reopens a question when its rule changes, even if the quoted amounts do not", () => {
  const d = question("CON-03", [
    { id: "one", attribute: "deal.purchase_price", value: 2000000 },
    { id: "two", attribute: "deal.purchase_price", value: 2100000 },
  ]);
  const before = mapDeal(d).questions[0]!;
  const answer = reply(before.key, "answer", {
    choice: "2,000,000",
    note: "Prior rule",
    evidenceKey: before.evidenceKey,
  });
  const rule = d.rules.get("CON-03")!;
  d.rules.set("CON-03", { ...rule, description: `${rule.description} Revised check.` });
  const after = mapDeal(d, [answer]).questions[0]!;
  expect(after.evidenceKey).not.toBe(before.evidenceKey);
  expect(after.answered).toBe(false);
  d.pack = {
    ...d.pack,
    parameters: {
      ...d.pack.parameters,
      price_tolerance: Number(d.pack.parameters.price_tolerance) + 1,
    },
  };
  expect(mapDeal(d, [answer]).questions[0]!.evidenceKey).not.toBe(after.evidenceKey);
});
