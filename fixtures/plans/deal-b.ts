import {
  base,
  doc,
  add,
  party,
  owner,
  setOwners,
  checklist,
  status,
  finding,
  plant,
  fault,
  key,
  layout,
  person,
} from "./shared";
export function dealB() {
  const p = base("deal-b");
  party(p, "investor", person(20260926), ["buyer_owner", "investor"]);
  p.ownership[0]!.percent = 85;
  owner(p, "investor", 15);
  setOwners(p, [
    { name: p.parties.find((x) => x.id === "alex")!.legal_name, percent: 85 },
    { name: p.parties.find((x) => x.id === "investor")!.legal_name, percent: 15 },
  ]);
  add(p, "investor-citizen", "CITIZENSHIP_EVIDENCE", "investor");
  p.confirmations.push({ rule: "GUA-05", scope: "investor", key: "citizenship_handling" });
  if (Array.isArray(p.profile.equity_sources))
    p.profile.equity_sources.push({
      id: "minority-equity",
      party: "investor",
      kind: "minority_investor_equity",
      amount: 90000,
      source_account_last_four: "7654",
    });
  add(p, "noncompete", "NON_COMPETE", "target");
  add(p, "addback", "ADDBACK_SCHEDULE", "target");
  p.tracking.push("TXN-09");
  checklist(
    p,
    ["alex"],
    ["alex", "investor"],
    p.profile.equity_sources as { id: string; kind: string }[],
  );
  finding(p, "CON-07");
  plant(
    p,
    "B-LIMITED",
    "Seller note plus minority equity 210000 exceeds 185000 seed limit",
    ["note", "funding", "owners"],
    [key("CON-07")],
  );
  doc(p, "interim").facts["financial.period_end"] = "2026-04-18";
  for (const id of ["ar", "ap"]) doc(p, id).facts["aging.as_of_date"] = "2026-04-18";
  status(p, "TGT-03", "target", "received_with_issues");
  finding(p, "TGT-03", "target", null, "stale");
  plant(
    p,
    18,
    "150-day interim exceeds overlay 60-day window",
    ["interim", "ar", "ap"],
    [key("TGT-03", "target")],
  );
  doc(p, "bank-aug").facts["bank.ending_balance"] = 100000;
  doc(p, "pfs").facts["pfs.cash"] = 100000;
  finding(p, "CON-08", "cash-alex");
  plant(
    p,
    22,
    "Cash claim exceeds August bank balance; PFS cash follows statement",
    ["bank-aug", "pfs", "funding"],
    [key("CON-08", "cash-alex")],
  );
  fault(p, {
    id: "B-F1",
    document: "funding",
    attribute: "funding.uses_total",
    kind: "wrong_value_real_quote",
    expected: "blocked",
    description:
      "Extractor drops the working-capital line from the uses total; the cited total contradicts it.",
    extractor: { value: 3600000, quote: "uses total: 3700000" },
    verifier: {
      status: "unsupported",
      corrected_value: 3700000,
      contradiction: true,
      specificity: 1,
    },
  });
  fault(p, {
    id: "B-F2",
    document: "note",
    attribute: "note.term_months",
    kind: "quote_not_in_block",
    expected: "blocked",
    description:
      "Right term with an invented quote: exact evidence 0 and unsupported evidence blocks.",
    extractor: { value: 120, quote: "term months: 60" },
    verifier: {
      status: "unsupported",
      corrected_value: null,
      contradiction: false,
      specificity: 0,
    },
  });
  fault(p, {
    id: "B-F3",
    document: "bank-aug",
    attribute: "bank.ending_balance",
    kind: "weak_evidence",
    expected: "review",
    description: "Right balance cited only to the statement title: 0.815, review.",
    extractor: { value: 100000, quote: "Monthly Account Statement" },
    verifier: {
      status: "partially_supported",
      corrected_value: 100000,
      contradiction: false,
      specificity: 0.4,
    },
  });
  fault(p, {
    id: "B-F4",
    document: "fin-2024",
    attribute: "financial.total_assets",
    kind: "verifier_corrects",
    expected: "review",
    description:
      "Extractor drops a zero; the verifier corrects from the cited line and the passes disagree: 0.70, review.",
    extractor: { value: 50000, quote: "total assets: 500000" },
    verifier: {
      status: "partially_supported",
      corrected_value: 500000,
      contradiction: false,
      specificity: 0.75,
    },
  });
  doc(p, "plan").format = "docx";
  doc(p, "fin-2025").format = "xlsx";
  layout(p, 28);
  // A91: authored corrections, independent of evaluation. Senior debt replaces
  // 50,000 of claimed cash and 30,000 of limited investor equity; sources still total 3.7m.
  const after = structuredClone(p.batches[0]!);
  after.batch = 2;
  after.profile = structuredClone(p.profile);
  if (Array.isArray(after.profile.equity_sources)) {
    after.profile.equity_sources.find((s) => s.id === "cash-alex")!.amount = 100000;
    after.profile.equity_sources.find((s) => s.id === "minority-equity")!.amount = 60000;
  }
  after.resolves = [key("CON-07"), key("TGT-03", "target"), key("CON-08", "cash-alex")];
  after.findings = [];
  after.checklist.find((r) => r.item_id === "TGT-03" && r.scope_key === "target")!.status =
    "satisfied";
  p.batches.push(after);
  for (const id of ["funding", "interim", "ar", "ap"]) {
    const fixed = structuredClone(doc(p, id));
    fixed.id = `${id}-fixed`;
    fixed.batch = 2;
    fixed.path = `incoming/batch-2/Corrections/${id}-fixed.pdf`;
    fixed.format = "text_pdf";
    fixed.group = undefined;
    fixed.supersedes = id;
    fixed.metadata.document_date = "2026-09-14";
    fixed.metadata.signature_date = "2026-09-14";
    if (id === "funding")
      fixed.facts["funding.sources"] = [
        { label: "Senior loan", amount: 3420000 },
        { label: "Cash injection", amount: 100000 },
        { label: "Seller note", amount: 120000 },
        { label: "Minority investor", amount: 60000 },
      ];
    else fixed.facts[id === "interim" ? "financial.period_end" : "aging.as_of_date"] = "2026-08-31";
    p.documents.push(fixed);
  }
  return p;
}
