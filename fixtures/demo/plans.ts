// Independently authored source documents. No evaluator or application database imports.
import { base, doc, add, guarantor, owner, party, setOwners, type Plan } from "../plans/shared";
import type { DemoCaseId } from "../../src/lib/demo/registry";
export const DEMO_DATE = "2026-09-15";
export function cleanDemo(): Plan {
  const p = base("deal-a");
  p.id = "demo-shared";
  p.profile.expected_loan_number_date = "2026-09-15";
  p.profile.premises = "none";
  p.profile.purchase_price = 1000000;
  p.profile.total_project_cost = 1100000;
  p.profile.seller_note = { present: "yes", amount: 50000, counted_toward_injection: "no" };
  p.model = { ...p.model, price: 1000000, project: 1100000, loan: 900000, note: 50000 };
  if (Array.isArray(p.profile.equity_sources))
    p.profile.equity_sources = p.profile.equity_sources.filter((s) => s.kind === "cash");
  guarantor(p, "bea", 20260916);
  p.ownership[0]!.percent = 60;
  owner(p, "bea", 40);
  party(p, "broker", "Morgan Vale", ["broker"]);
  setOwners(p, [
    { name: p.parties.find((s) => s.id === "alex")!.legal_name, percent: 60 },
    { name: p.parties.find((s) => s.id === "bea")!.legal_name, percent: 40 },
  ]);
  for (const d of p.documents) {
    if ("deal.purchase_price" in d.facts) d.facts["deal.purchase_price"] = 1000000;
    if ("deal.seller_note_amount" in d.facts) d.facts["deal.seller_note_amount"] = 50000;
    if ("note.principal" in d.facts) d.facts["note.principal"] = 50000;
  }
  Object.assign(doc(p, "funding").facts, {
    "funding.sources": [
      { label: "Senior loan", amount: 900000 },
      { label: "Buyer cash", amount: 150000 },
      { label: "Seller financing", amount: 50000 },
    ],
    "funding.uses": [
      { label: "Purchase", amount: 1000000 },
      { label: "Other uses", amount: 100000 },
    ],
    "funding.sources_total": 1100000,
    "funding.uses_total": 1100000,
  });
  doc(p, "plan").format = "docx";
  doc(p, "fin-2025").format = "xlsx";
  for (const [i, d] of p.documents.entries()) {
    const ext = d.format === "docx" ? "docx" : d.format === "xlsx" ? "xlsx" : "pdf";
    d.path = `initial/${d.party === "target" ? "Seller" : "Buyer"}/attachment-${i + 1}.${ext}`;
  }
  return p;
}
export function casePlan(id: DemoCaseId) {
  const p = cleanDemo();
  // Keep identical baseline bytes across all eight cases.
  function revise(key: string, batch = 2) {
    const old = doc(p, key),
      copy = structuredClone(old);
    copy.id = `${key}-round-${batch}`;
    copy.batch = batch;
    copy.supersedes = old.id;
    copy.path = `corrections/round-${batch}/${copy.id}.${copy.format === "xlsx" ? "xlsx" : copy.format === "docx" ? "docx" : "pdf"}`;
    copy.metadata.document_date = batch === 2 ? "2026-09-10" : "2026-09-14";
    copy.metadata.signature_date = copy.metadata.document_date;
    if (copy.type === "SBA_413") copy.facts["pfs.as_of_date"] = copy.metadata.document_date;
    p.documents.push(copy);
    return copy;
  }
  if (id === "D02") {
    const tax = p.documents.find(
      (d) => d.type === "TAX_PERSONAL" && d.party === "alex" && d.period === "2025",
    )!;
    revise(tax.id);
    tax.period = "2022";
    tax.facts["tax.year"] = 2022;
    revise("bank-aug");
    const bank = doc(p, "bank-aug");
    bank.period = "2026-06";
    bank.facts["bank.period_end"] = "2026-06-30";
    const duplicate = structuredClone(doc(p, "loi"));
    duplicate.id = "duplicate";
    duplicate.duplicate_of = "loi";
    duplicate.path = "initial/Accountant/copy-final.pdf";
    p.documents.push(duplicate);
    const unrelated = add(
      p,
      "unrelated",
      "TAX_BUSINESS",
      "outside-party",
      { "party.legal_name": "Varnholt Climate Parts LLC", "tax.year": 2025 },
      "2025",
    );
    unrelated.path = "initial/Accountant/return.pdf";
    // Six-page custom personal statements, not truncated official forms. Full official forms remain in baseline.
    const bundle = add(
      p,
      "mixed-bundle",
      "PURCHASE_AGREEMENT",
      "target",
      structuredClone(doc(p, "purchase").facts),
    );
    p.documents = p.documents.filter((d) => d.id !== "purchase");
    bundle.path = "initial/Accountant/document.pdf";
    bundle.notes = ["See authored six-page agreement and personal-statement packet."];
  }
  if (id === "D03") {
    revise("pfs");
    const pfs = doc(p, "pfs");
    pfs.facts["pfs.total_liabilities"] = "N/A";
    pfs.facts["pfs.total_assets"] = "$?00,000";
    pfs.facts["pfs.net_worth"] = "($25,000)";
    pfs.facts["pfs.cash"] = "$25,000.50";
    pfs.facts["pfs.as_of_date"] = "08/31/2026";
    doc(p, "bea-pfs").facts["pfs.total_liabilities"] = 0;
    doc(p, "bea-pfs").facts["pfs.net_worth"] = 500000;
    doc(p, "bea-pfs").format = "scan_pdf";
    p.faults.push({
      id: "D03-ambiguous",
      document: "pfs",
      attribute: "pfs.total_assets",
      kind: "missing_value",
      expected: "review",
      description: "Amount is ambiguous; inspect the supporting revision.",
      extractor: { value: null, quote: null },
      verifier: null,
    });
    // The prepared reading fault is authored; it does not alter evaluation or acceptance.
    doc(p, "pfs").notes.push("An amount needs clarification against the revised signed statement.");
  }
  if (id === "D04") {
    const signed = revise("pfs");
    signed.format = "scan_pdf";
    const pfs = doc(p, "pfs");
    pfs.format = "scan_pdf";
    pfs.metadata.signed = null;
  }
  if (id === "D05") {
    p.profile.premises = "leased";
    p.profile.seller_staying = { present: "yes", role: "consultant", months: 6 };
    revise("purchase").facts["party.address"] = "14 Velnoric Way, Tazmervale, ZZ 00000";
    doc(p, "purchase").facts["deal.structure"] = "stock";
    doc(p, "purchase").facts["party.address"] = "28 Velnoric Way, Tazmervale, ZZ 00000";
    for (const d of p.documents.filter((d) => d.type === "TAX_BUSINESS"))
      d.facts["party.address"] = "14 Velnoric Way, Tazmervale, ZZ 00000";
    for (const months of [6, 12]) {
      const d = add(p, `consult-${months}`, "CONSULTING_AGREEMENT", "target", {
        "consulting.party": p.parties[1]!.legal_name,
        "consulting.term_months": months,
      });
      d.path = `initial/Seller/notes-${months}.pdf`;
    }
    const clarified = revise("consult-12");
    clarified.facts["consulting.term_months"] = 6;
    clarified.notes = [
      "The signed six-month transition replaces both earlier drafts. broker@example.com confirms this is the current synthetic agreement.",
    ];
    const lease = add(p, "lease", "LEASE", "target", {
      "lease.expiry": "2029-09-30",
      "lease.option_years": 5,
      "lease.assignment_present": false,
      "party.address": "14 Velnoric Way, Tazmervale, ZZ 00000",
    });
    lease.path = "initial/Seller/scan0007.pdf";
    lease.notes.push(
      "Five-year option mentioned; supporting option terms not supplied. Do not assume exercisability.",
    );
    const replacement = revise("lease");
    replacement.facts["lease.expiry"] = "2036-09-30";
    replacement.facts["lease.assignment_present"] = true;
    replacement.notes = ["Synthetic executed replacement lease and assignment; review required."];
    const consent = add(p, "consent", "LEASE_CONSENT", "target");
    consent.batch = 2;
    consent.path = "corrections/round-2/consent.pdf";
  }
  if (id === "D06") {
    doc(p, "purchase").facts["deal.purchase_price"] = 900000;
    doc(p, "loi").facts["deal.purchase_price"] = 950000;
    doc(p, "funding").facts["deal.purchase_price"] = 900000;
    for (const key of ["purchase", "loi", "funding"]) {
      const second = revise(key);
      second.facts["deal.purchase_price"] = key === "loi" ? 1050000 : 1000000;
      const third = revise(key, 3);
      third.supersedes = second.id;
      third.facts["deal.purchase_price"] = 1000000;
    }
  }
  if (id === "D07") {
    const d = p.documents.find((d) => d.type === "FORMATION_DOC")!;
    revise(d.id);
    d.format = "protected_pdf";
    d.unreadable = true;
  }
  if (id === "D08") {
    doc(p, "funding").path = "initial/Broker/forwarded.pdf";
    doc(p, "funding").notes.push(
      "Buyer funding statement supplied by Morgan Vale, broker@example.com.",
    );
    const amendment = revise("purchase");
    amendment.facts["deal.purchase_price"] = 1050000;
  }
  return p;
}
