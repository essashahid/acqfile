/**
 * Statements, reports and schedules. Supporting figures are generated deterministically and tie
 * out: running balances reconcile, aging buckets sum to totals, statements balance. Only the
 * stated facts carry planned values; nothing else here feeds a rule.
 */
import type { Doc } from "../../plans/shared";
import { addDays, amount2, longDate, money, money2, split, splitWhole, usDate } from "./format";
import { factQuote, fundingRow, memberRow } from "./quotes";
import {
  BUYER_ADDRESS,
  M,
  R,
  TARGET_ADDRESS,
  buyerName,
  factKv,
  heading,
  industry,
  kv,
  lenderName,
  notes,
  personAddress,
  record,
  synthetic,
  table,
  targetName,
  type Col,
  type Ctx,
} from "./kit";
import { metaLines } from "./quotes";
import { INK, MUTED, RULE, WHITE, type RGB } from "./sheet";

const W = R - M;
const round = (n: number, to = 100) => Math.round(n / to) * to;
const cents = (n: number) => Math.round(n * 100) / 100;
const dateOf = (c: Ctx) =>
  String(c.d.metadata.document_date ?? c.d.metadata.signature_date ?? "2026-08-31");

// ---------------------------------------------------------------- bank statement (Reg E / Reg DD)
const NAVY: RGB = [0.07, 0.2, 0.36];
export function bankStatement(c: Ctx) {
  const bank = c.has("bank.institution") ? c.v<string>("bank.institution") : lenderName(c);
  const end = String(c.d.facts["bank.period_end"] ?? `${c.d.period ?? "2026-08"}-28`);
  const start = `${end.slice(0, 8)}01`;
  const ending = c.has("bank.ending_balance") ? c.v<number>("bank.ending_balance") : 48_210.44;
  // Title and the period first: they identify the document and its dates for anyone reading it.
  c.s.text("Monthly Account Statement", R, 740, {
    size: 13,
    face: "sansB",
    align: "right",
    color: NAVY,
  });
  c.s.text(
    c.has("bank.period_end")
      ? c.sentence("bank.period_end")
      : `Statement period: ${longDate(start)} through ${longDate(end)}`,
    R,
    727,
    { size: 8.6, align: "right" },
  );
  c.s.rect(M, 718, 150, 30, { fill: NAVY });
  c.s.text(c.has("bank.institution") ? factQuote(c.d, "bank.institution") : bank, M + 10, 733, {
    size: 13,
    face: "sansB",
    color: WHITE,
  });
  c.s.text("Business and Personal Banking", M + 10, 722, { size: 6.8, color: [0.8, 0.86, 0.93] });
  c.s.text("1 Harrow Plaza, Tazmervale, ZZ 00000 · (202) 555-0163", M, 708, {
    size: 7.4,
    color: MUTED,
  });
  // Mailing block and the statement details the intake reads, each index line on its own line.
  const owner = c.has("party.legal_name") ? c.v<string>("party.legal_name") : c.name;
  const mail = [
    owner.toUpperCase(),
    ...personAddress(c)
      .toUpperCase()
      .split(", ")
      .reduce<string[]>(
        (a, p, i) => (i < 2 ? [...a, p] : [...a.slice(0, -1), `${a.at(-1)}, ${p}`]),
        [],
      ),
  ];
  mail.forEach((line, i) => c.s.text(line, M + 18, 670 - i * 11, { size: 8.8, face: "mono" }));
  c.s.rect(344, 612, 214, 78, { stroke: RULE, lw: 0.7 });
  c.s.text("Statement details", 352, 680, { size: 8, face: "sansB", color: NAVY });
  metaLines(c.p, c.d).forEach((line, i) => c.s.text(line, 352, 667 - i * 11, { size: 8 }));
  // Summary, with the ending balance stated as the bank prints it.
  let y = 590;
  y = heading(c, "Account summary", y, { color: NAVY });
  const rng = c.rng;
  const deposits = Array.from(
    { length: 4 },
    () => round(2_000 + rng() * 11_000, 1) + round(rng() * 99, 1) / 100,
  );
  const debits = Array.from(
    { length: 7 },
    () => round(180 + rng() * 5_400, 1) + round(rng() * 99, 1) / 100,
  );
  const fee = 0;
  const totalIn = cents(deposits.reduce((a, b) => a + b, 0));
  const totalOut = cents(debits.reduce((a, b) => a + b, 0));
  const beginning = cents(ending - totalIn + totalOut);
  const summary: [string, string][] = [
    [`Beginning balance on ${longDate(start)}`, money2(beginning)],
    [`Deposits and other credits (${deposits.length})`, money2(totalIn)],
    [`Withdrawals and other debits (${debits.length})`, money2(-totalOut)],
    ["Service fees", money2(fee)],
  ];
  for (const [label, value] of summary) {
    kv(c, label, value, M, y, { size: 8.8, align: "right", right: 330, color: INK });
    y -= 13;
  }
  c.s.line(M, y + 8, 330, y + 8, INK, 0.5);
  if (c.has("bank.ending_balance"))
    factKv(c, "bank.ending_balance", M, y, {
      size: 8.8,
      align: "right",
      right: 330,
      labelFace: "sansB",
      face: "sansB",
      color: INK,
    });
  else
    kv(c, `Ending balance on ${longDate(end)}`, money2(ending), M, y, {
      size: 8.8,
      align: "right",
      right: 330,
      labelFace: "sansB",
      face: "sansB",
      color: INK,
    });
  y -= 13;
  if (c.has("party.legal_name"))
    factKv(c, "party.legal_name", M, y, { size: 8.8, align: "right", right: 330 });
  y -= 22;
  // Transaction detail with a running balance that ends on the stated balance.
  y = heading(c, "Transaction detail", y, { color: NAVY });
  const events = [
    ...deposits.map((a, i) => ({
      amount: a,
      text: [
        "DIRECT DEPOSIT PAYROLL",
        "MOBILE DEPOSIT",
        "ACH CREDIT CLIENT PMT",
        "TRANSFER FROM SAVINGS",
      ][i % 4]!,
    })),
    ...debits.map((a, i) => ({
      amount: -a,
      text: [
        "ONLINE PMT CARD SERVICES",
        "CHECK 1042",
        "ACH DEBIT UTILITY CO",
        "DEBIT CARD PURCHASE HARDWARE",
        "ACH DEBIT INSURANCE",
        "ONLINE TRANSFER TO SAVINGS",
        "CHECK 1043",
      ][i % 7]!,
    })),
  ];
  const days = events.map((_, i) =>
    Math.min(27, 1 + Math.floor(((i + 1) * 27) / (events.length + 1))),
  );
  const order = events
    .map((e, i) => ({ ...e, day: days[(i * 5) % events.length]! }))
    .sort((a, b) => a.day - b.day || b.amount - a.amount);
  let balance = beginning;
  const rows = order.map((e) => {
    balance = cents(balance + e.amount);
    return [
      usDate(`${end.slice(0, 8)}${String(e.day).padStart(2, "0")}`).slice(0, 5),
      e.text,
      e.amount > 0 ? amount2(e.amount) : "",
      e.amount < 0 ? amount2(-e.amount) : "",
      amount2(balance),
    ];
  });
  if (Math.abs(balance - ending) > 0.001) throw Error(`${c.d.id}: statement does not reconcile`);
  const cols: Col[] = [
    { w: 44, head: "Date" },
    { w: 230, head: "Description" },
    { w: 76, head: "Deposits", align: "right" },
    { w: 76, head: "Withdrawals", align: "right" },
    { w: 78, head: "Balance", align: "right" },
  ];
  y = table(c, M, y, cols, rows, { size: 8, zebra: [0.965, 0.972, 0.98], headColor: NAVY });
  y -= 14;
  y = heading(c, "Daily ending balance", y, { color: NAVY });
  const daily = new Map<string, string>();
  for (const r of rows) daily.set(r[0]!, r[4]!);
  const cells = [...daily];
  const per = Math.ceil(cells.length / 3);
  for (let i = 0; i < per; i++) {
    [0, 1, 2].forEach((k) => {
      const cell = cells[i + k * per];
      if (!cell) return;
      c.s.text(cell[0], M + k * 172, y, { size: 8 });
      c.s.text(cell[1], M + k * 172 + 130, y, { size: 8, align: "right" });
    });
    y -= 12;
  }
  y -= 6;
  y = heading(c, "Overdraft and returned item fees", y, { color: NAVY });
  const feeCols: Col[] = [
    { w: 260, head: "" },
    { w: 122, head: "Total for this period", align: "right" },
    { w: 122, head: "Total year-to-date", align: "right" },
  ];
  y = table(
    c,
    M,
    y,
    feeCols,
    [
      ["Total overdraft fees", "$0.00", "$0.00"],
      ["Total returned item fees", "$0.00", "$0.00"],
    ],
    { size: 8, head: true },
  );
  y -= 8;
  y = c.s.para(
    `Direct inquiries about this statement to ${bank}, P.O. Box 4120, Tazmervale, ZZ 00000, or call (202) 555-0163. In case of errors or questions about your electronic transfers, tell us as soon as you can, and no later than 60 days after we sent the first statement on which the problem appeared.`,
    M,
    y,
    W,
    { size: 7.2, leading: 9.2, color: MUTED },
  );
  notes(c, y - 8);
  record(c, { meta: false });
  synthetic(c);
}

// ---------------------------------------------------------------- compiled financial statements
type Lines = {
  label: string;
  amount: number;
  bold?: boolean;
  indent?: boolean;
  fact?: string;
  caption?: boolean;
}[];
export function financialLines(c: Ctx) {
  const d = c.d;
  const rng = c.rng;
  const year = d.type === "FIN_YEAR_END";
  const revenue = Number(
    d.facts["financial.revenue"] ?? c.p.model.years[d.period ?? "2025"]?.revenue ?? 1_000_000,
  );
  const net = Number(
    d.facts["financial.net_income"] ??
      (year ? c.p.model.years[d.period ?? "2025"]?.income : undefined) ??
      round(revenue * 0.1, 1_000),
  );
  const cogs = round(revenue * (0.43 + rng() * 0.05));
  const gross = revenue - cogs;
  const opex = splitWhole(gross - net, [31, 8, 1.4, 2.1, 2.6, 3, 1.2, 4.2]);
  const labels = [
    "Salaries and wages",
    "Rent",
    "Utilities",
    "Insurance",
    "Vehicle and fuel",
    "Depreciation",
    "Professional fees",
    "Other operating expenses",
  ];
  const totalOpex = opex.reduce((a, b) => a + b, 0);
  const income: Lines = [
    { label: "Total revenue", amount: revenue, bold: true, fact: "financial.revenue" },
    { label: "Cost of goods sold", amount: cogs },
    { label: "Gross profit", amount: gross, bold: true },
    ...labels.map((label, i) => ({ label, amount: opex[i]!, indent: true })),
    { label: "Total operating expenses", amount: totalOpex, bold: true },
    { label: "Net income", amount: gross - totalOpex, bold: true, fact: "financial.net_income" },
  ];
  if (gross - totalOpex !== net) throw Error(`${d.id}: income statement does not tie out`);
  const assets = Number(d.facts["financial.total_assets"] ?? c.p.model.assets);
  const liabilities = Number(d.facts["financial.total_liabilities"] ?? c.p.model.liabilities);
  const [cash, ar, inventory, prepaid, equipment] = splitWhole(assets, [34, 24, 12, 2, 28]);
  const [ap, accrued, current, longTerm] = splitWhole(liabilities, [30, 15, 10, 45]);
  const balance: Lines = [
    { label: "ASSETS", amount: NaN, caption: true },
    { label: "Cash", amount: cash!, indent: true },
    { label: "Accounts receivable, net", amount: ar!, indent: true },
    { label: "Inventory", amount: inventory!, indent: true },
    { label: "Prepaid expenses", amount: prepaid!, indent: true },
    { label: "Equipment and vehicles, net", amount: equipment!, indent: true },
    { label: "Total assets", amount: assets, bold: true, fact: "financial.total_assets" },
    { label: "LIABILITIES AND MEMBERS’ EQUITY", amount: NaN, caption: true },
    { label: "Accounts payable", amount: ap!, indent: true },
    { label: "Accrued liabilities", amount: accrued!, indent: true },
    { label: "Current portion of long-term debt", amount: current!, indent: true },
    { label: "Long-term debt, less current portion", amount: longTerm!, indent: true },
    {
      label: "Total liabilities",
      amount: liabilities,
      bold: true,
      fact: "financial.total_liabilities",
    },
    { label: "Members’ equity", amount: assets - liabilities, indent: true },
    { label: "Total liabilities and members’ equity", amount: assets, bold: true },
  ];
  return { income, balance };
}
function statementColumn(c: Ctx, x: number, y: number, width: number, title: string, lines: Lines) {
  y = heading(c, title, y, { x, width, size: 9.5, face: "serifB" });
  for (const l of lines) {
    if (l.caption) {
      c.s.text(l.label, x, y, { size: 7.8, face: "serifB", color: MUTED });
      y -= 11;
      continue;
    }
    const face = l.bold ? "serifB" : "serif";
    if (l.fact && c.has(l.fact)) {
      const st = c.stated(l.fact);
      if (!("label" in st)) throw Error("statement fact must be a label");
      c.s.text(st.label, x, y, { size: 8.8, face });
      c.s.text(st.value, x + width, y, { size: 8.8, face, align: "right" });
    } else {
      c.s.text(l.label, x + (l.indent ? 10 : 0), y, { size: 8.8, face });
      c.s.text(money(l.amount), x + width, y, { size: 8.8, face, align: "right" });
    }
    if (l.bold) c.s.line(x + width - 70, y + 9, x + width, y + 9, INK, 0.4);
    y -= 12.4;
  }
  return y;
}
export function financials(c: Ctx) {
  const d = c.d;
  const company = c.name;
  const yearEnd = d.type === "FIN_YEAR_END";
  const periodEnd = yearEnd
    ? `${d.period ?? "2025"}-12-31`
    : String(d.facts["financial.period_end"] ?? dateOf(c));
  c.s.text(
    yearEnd
      ? "Year-end Income Statement and Balance Sheet"
      : "Interim Income Statement and Balance Sheet",
    306,
    740,
    {
      size: 13,
      face: "serifB",
      align: "center",
    },
  );
  c.s.text(company, 306, 725, { size: 11, face: "serif", align: "center" });
  const period = yearEnd
    ? `For the year ended ${longDate(periodEnd)}`
    : c.has("financial.period_end")
      ? c.sentence("financial.period_end")
      : `For the period ended ${longDate(periodEnd)}`;
  c.s.text(period, 306, 712, { size: 9, face: "serifI", align: "center" });
  c.s.text("(Unaudited — see accountant’s compilation report)", 306, 700, {
    size: 8,
    face: "serifI",
    align: "center",
    color: MUTED,
  });
  let y = heading(c, "Accountant’s Compilation Report", 676, { face: "serifB", size: 9.5 });
  y = c.s.para(
    `Management is responsible for the accompanying financial statements of ${company}, which comprise the balance sheet as of ${longDate(periodEnd)} and the related statement of income for the ${yearEnd ? "year" : "period"} then ended, in accordance with accounting principles generally accepted in the United States of America. We have performed a compilation engagement in accordance with Statements on Standards for Accounting and Review Services promulgated by the Accounting and Review Services Committee of the AICPA. We did not audit or review the financial statements nor were we required to perform any procedures to verify the accuracy or completeness of the information provided by management. Accordingly, we do not express an opinion, a conclusion, nor provide any form of assurance on these financial statements. Management has elected to omit substantially all of the disclosures ordinarily included in financial statements prepared in accordance with accounting principles generally accepted in the United States of America.`,
    M,
    y,
    W,
    { size: 8.2, face: "serif", leading: 10.3 },
  );
  c.s.text("Vale & Reed CPAs LLP · Tazmervale, ZZ", M, y - 3, { size: 8.2, face: "serifI" });
  c.s.text(longDate(dateOf(c)), R, y - 3, { size: 8.2, face: "serifI", align: "right" });
  const { income, balance } = financialLines(c);
  const top = y - 26;
  const left = statementColumn(c, M, top, 238, "Statement of Income", income);
  const right = statementColumn(c, M + 266, top, 238, "Balance Sheet", balance);
  y = Math.min(left, right) - 6;
  y = notes(c, y);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- A/R and A/P aging (QuickBooks-style summary)
const CUSTOMERS: Record<string, string[]> = {
  hvac: [
    "Brellcourt Dental Group",
    "Orrin Point Apartments",
    "Tazmervale School District",
    "Halden Medical Offices",
    "Quarrow Cold Storage",
    "Linmere Retail Center",
    "St. Evran Parish Hall",
    "Corvel Printing Co.",
    "Ashgrove Senior Living",
    "Pellam Auto Body",
  ],
  grounds: [
    "Orrin Point Apartments",
    "Tazmervale Office Park",
    "Brellcourt HOA",
    "Linmere Retail Center",
    "Halden Medical Offices",
    "Riverside Church",
    "Corvel Industrial",
    "Ashgrove Senior Living",
    "Pellam Business Park",
    "Quarrow Logistics",
  ],
  fitness: [
    "Corporate wellness — Halden Medical",
    "Tazmervale School District",
    "Brellcourt Dental Group",
    "Linmere Retail Center",
    "Corvel Printing Co.",
    "Quarrow Logistics",
    "Orrin Point Apartments",
    "St. Evran Parish",
    "Ashgrove Senior Living",
    "Pellam Auto Body",
  ],
  general: [
    "Brellcourt Dental Group",
    "Orrin Point Apartments",
    "Tazmervale School District",
    "Halden Medical Offices",
    "Quarrow Cold Storage",
    "Linmere Retail Center",
    "St. Evran Parish Hall",
    "Corvel Printing Co.",
    "Ashgrove Senior Living",
    "Pellam Auto Body",
  ],
};
const VENDORS: Record<string, string[]> = {
  hvac: [
    "Ferrant HVAC Supply",
    "Coldline Refrigerants",
    "Tazmervale Sheet Metal",
    "Orvel Fleet Services",
    "Northway Electric Wholesale",
    "Brask Tool Rental",
    "Quillon Insurance Agency",
    "Merrow Fuel Cards",
    "Delsan Uniforms",
    "Pellam Office Supply",
  ],
  grounds: [
    "Greenrow Seed & Soil",
    "Brask Equipment Rental",
    "Orvel Fleet Services",
    "Tazmervale Stone Supply",
    "Merrow Fuel Cards",
    "Quillon Insurance Agency",
    "Delsan Uniforms",
    "Halcot Irrigation",
    "Northway Hardware",
    "Pellam Office Supply",
  ],
  fitness: [
    "Rellis Fitness Equipment",
    "Ostrelyva Franchising LLC",
    "Quillon Insurance Agency",
    "Tazmervale Power & Light",
    "Delsan Uniforms",
    "Brask Maintenance",
    "Merrow Janitorial",
    "Halcot Water Service",
    "Northway Music Licensing",
    "Pellam Office Supply",
  ],
  general: [
    "Ferrant Supply",
    "Brask Rental",
    "Orvel Fleet Services",
    "Merrow Fuel Cards",
    "Quillon Insurance Agency",
    "Delsan Uniforms",
    "Northway Wholesale",
    "Halcot Services",
    "Tazmervale Utilities",
    "Pellam Office Supply",
  ],
};
export function aging(c: Ctx) {
  const receivable = c.d.type === "AGING_AR";
  const asOf = String(c.d.facts["aging.as_of_date"] ?? dateOf(c));
  const names = (receivable ? CUSTOMERS : VENDORS)[industry(c.name)]!;
  c.s.text(receivable ? "Accounts Receivable Aging" : "Accounts Payable Aging", 306, 740, {
    size: 13,
    face: "sansB",
    align: "center",
  });
  c.s.text(
    c.has("aging.as_of_date") ? c.sentence("aging.as_of_date") : `Aged as of ${longDate(asOf)}`,
    306,
    726,
    { size: 9, align: "center" },
  );
  c.s.text(c.name, 306, 713, { size: 9.5, face: "sansB", align: "center" });
  c.s.text("Summary by due date · Accrual basis · Amounts in U.S. dollars", 306, 701, {
    size: 7.6,
    align: "center",
    color: MUTED,
  });
  const rng = c.rng;
  const rows = names.map((name) => {
    const b = [
      rng() * 9_000,
      rng() < 0.6 ? rng() * 5_000 : 0,
      rng() < 0.35 ? rng() * 3_000 : 0,
      rng() < 0.2 ? rng() * 1_800 : 0,
      rng() < 0.12 ? rng() * 1_200 : 0,
    ].map((n) => (n ? cents(round(n + 40, 1) + round(rng() * 99, 1) / 100) : 0));
    return { name, b, total: cents(b.reduce((x, y) => x + y, 0)) };
  });
  const totals = [0, 1, 2, 3, 4].map((i) => cents(rows.reduce((n, r) => n + r.b[i]!, 0)));
  const grand = cents(totals.reduce((a, b) => a + b, 0));
  const cols: Col[] = [
    { w: 158, head: receivable ? "Customer" : "Vendor" },
    { w: 58, head: "Current", align: "right" },
    { w: 56, head: "1 - 30", align: "right" },
    { w: 56, head: "31 - 60", align: "right" },
    { w: 56, head: "61 - 90", align: "right" },
    { w: 56, head: "> 90", align: "right" },
    { w: 64, head: "Total", align: "right" },
  ];
  let y = table(
    c,
    M,
    672,
    cols,
    [
      ...rows.map((r) => [r.name, ...r.b.map((n) => (n ? amount2(n) : "—")), amount2(r.total)]),
      ["TOTAL", ...totals.map(amount2), amount2(grand)],
    ],
    { size: 8, zebra: [0.965, 0.97, 0.975], bold: new Set([rows.length]), rules: false },
  );
  c.s.line(M, y + 17, R, y + 17, INK, 0.6);
  y -= 8;
  const pct = (n: number) => `${((100 * n) / grand).toFixed(1)}%`;
  y = c.s.para(
    `Aging buckets measure days past the invoice due date. Current: ${pct(totals[0]!)} · 1–30: ${pct(totals[1]!)} · 31–60: ${pct(totals[2]!)} · 61–90: ${pct(totals[3]!)} · over 90: ${pct(totals[4]!)} of the total.`,
    M,
    y,
    W,
    { size: 7.6, leading: 9.6, color: MUTED },
  );
  c.s.text(`Report run ${usDate(dateOf(c))} 9:14 AM from the accounting system`, M, y - 4, {
    size: 7.4,
    color: MUTED,
  });
  notes(c, y - 20);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- business debt schedule (SBA lender format)
export function debtSchedule(c: Ctx) {
  const asOf = String(c.d.facts["debt.as_of_date"] ?? dateOf(c));
  const total = c.has("debt.total") ? c.v<number>("debt.total") : 64_000;
  c.s.text("Business Debt Schedule", 306, 740, { size: 13, face: "sansB", align: "center" });
  c.s.text(
    c.has("debt.as_of_date") ? c.sentence("debt.as_of_date") : `Balances as of ${longDate(asOf)}`,
    306,
    726,
    { size: 9, align: "center" },
  );
  c.s.text(c.name, 306, 713, { size: 9.5, face: "sansB", align: "center" });
  c.s.text(
    "List every business loan, line of credit, note, lease and credit card. Do not include accounts payable or accrued expenses.",
    306,
    700,
    { size: 7.4, align: "center", color: MUTED },
  );
  const [a, b, d] = split(total, [62.4, 25.1, 12.5]);
  const debts = [
    {
      creditor: "Zelmivar Bank — equipment loan",
      date: "03/15/2022",
      original: 110_000,
      balance: a!,
      rate: "6.25%",
      maturity: "03/15/2029",
      payment: 1_712.4,
      collateral: "Service equipment",
      status: "Current",
    },
    {
      creditor: "Orvel Fleet Finance — vehicles",
      date: "08/01/2023",
      original: 48_500,
      balance: b!,
      rate: "7.10%",
      maturity: "08/01/2028",
      payment: 961.18,
      collateral: "2 service vans",
      status: "Current",
    },
    {
      creditor: "Zelmivar Bank — line of credit",
      date: "01/10/2024",
      original: 50_000,
      balance: d!,
      rate: "9.50% var",
      maturity: "01/10/2027",
      payment: 312.5,
      collateral: "Blanket lien",
      status: "Current",
    },
  ];
  const cols: Col[] = [
    { w: 108, head: "Creditor" },
    { w: 46, head: "Orig. date" },
    { w: 56, head: "Orig. amount", align: "right" },
    { w: 60, head: "Present bal.", align: "right" },
    { w: 44, head: "Rate", align: "right" },
    { w: 46, head: "Maturity" },
    { w: 48, head: "Monthly pmt", align: "right" },
    { w: 60, head: "Collateral" },
    { w: 36, head: "Status" },
  ];
  let y = table(
    c,
    M,
    672,
    cols,
    debts.map((x) => [
      x.creditor,
      x.date,
      amount2(x.original),
      amount2(x.balance),
      x.rate,
      x.maturity,
      amount2(x.payment),
      x.collateral,
      x.status,
    ]),
    { size: 6.9, rules: true, lead: 16 },
  );
  // The total row states the present balance exactly as the schedule totals it.
  const totalStyle = {
    size: 7.6,
    labelFace: "sansB",
    face: "sansB",
    color: INK,
    align: "right",
    right: M + 266,
  } as const;
  if (c.has("debt.total")) factKv(c, "debt.total", M + 4, y, totalStyle);
  else kv(c, "Total present balance", money2(total), M + 4, y, totalStyle);
  c.s.text(amount2(debts.reduce((n, x) => n + x.payment, 0)), M + 404, y, {
    size: 7.6,
    face: "sansB",
    align: "right",
  });
  c.s.line(M, y + 11, R, y + 11, INK, 0.6);
  y -= 26;
  y = c.s.para(
    "I certify that the information above is true and complete to the best of my knowledge and includes all business debt of the applicant. I understand the lender will rely on this schedule when underwriting the requested SBA loan.",
    M,
    y,
    W,
    { size: 8, leading: 10.2 },
  );
  c.s.line(M, y - 26, M + 220, y - 26, INK, 0.6);
  if (c.d.metadata.signed !== false)
    c.s.text("/s/ e-signed", M + 4, y - 23, { size: 10, face: "serifI", color: [0.1, 0.18, 0.45] });
  c.s.text("Signature of owner or authorized officer", M, y - 35, { size: 7.4, color: MUTED });
  notes(c, y - 54);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- sources and uses
export function sourcesUses(c: Ctx) {
  const buyer = buyerName(c),
    target = targetName(c);
  c.s.text("Sources and Uses of Funds", 306, 740, { size: 14, face: "sansB", align: "center" });
  c.s.text(`Proposed acquisition of the business of ${target} by ${buyer}`, 306, 726, {
    size: 9,
    align: "center",
  });
  c.s.text(`Prepared ${longDate(dateOf(c))} for ${lenderName(c)} · SBA 7(a) request`, 306, 713, {
    size: 7.8,
    align: "center",
    color: MUTED,
  });
  let y = 684;
  const block = (
    title: string,
    attribute: string,
    totalAttribute: string,
    fallback: { label: string; amount: number }[],
  ) => {
    y = heading(c, title, y, { width: 300, x: 154 });
    const rows = c.v<{ label: string; amount: number }[]>(attribute) ?? fallback;
    // Rows print as label then amount, consecutively, the order the funding value reads in.
    for (const r of rows) {
      c.s.text(r.label, 160, y, { size: 9.5 });
      c.s.text(money(r.amount), 448, y, { size: 9.5, align: "right" });
      y -= 14;
    }
    if (c.has(attribute) && factQuote(c.d, attribute) !== rows.map(fundingRow).join(" "))
      throw Error("funding rows drift");
    c.s.line(360, y + 10, 454, y + 10, INK, 0.5);
    if (c.has(totalAttribute)) {
      const st = c.stated(totalAttribute);
      if ("label" in st) {
        c.s.text(st.label, 160, y, { size: 9.5, face: "sansB" });
        c.s.text(st.value, 448, y, { size: 9.5, face: "sansB", align: "right" });
      }
    } else {
      c.s.text(title === "Sources" ? "Total sources" : "Total uses", 160, y, {
        size: 9.5,
        face: "sansB",
      });
      c.s.text(money(rows.reduce((n, r) => n + r.amount, 0)), 448, y, {
        size: 9.5,
        face: "sansB",
        align: "right",
      });
    }
    y -= 28;
  };
  block("Sources", "funding.sources", "funding.sources_total", [
    { label: "Senior loan", amount: c.p.model.loan },
    { label: "Cash injection", amount: c.p.model.cash },
  ]);
  block("Uses", "funding.uses", "funding.uses_total", [
    { label: "Purchase", amount: c.p.model.price },
    { label: "Working capital", amount: 100_000 },
  ]);
  y = heading(c, "Transaction summary", y, { width: 300, x: 154 });
  for (const attribute of [
    "deal.purchase_price",
    "deal.seller_note_amount",
    "deal.seller_note_terms",
  ]) {
    if (!c.has(attribute)) continue;
    const st = c.stated(attribute);
    if (!("label" in st)) continue;
    c.s.text(st.label, 160, y, { size: 9.5 });
    c.s.text(st.value, 448, y, { size: 9.5, align: "right" });
    y -= 14;
  }
  y -= 10;
  y = c.s.para(
    "Equity injection is verified by the buyer’s bank statements for the two months before closing. Any seller note counted toward the injection must be on full standby for the life of the SBA loan. Closing costs and the SBA guaranty fee are financed within the working capital line.",
    154,
    y,
    300,
    { size: 7.8, leading: 10, color: MUTED },
  );
  notes(c, y - 10);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- SDE add-back recast
export function addbacks(c: Ctx) {
  const years = ["2023", "2024", "2025"] as const;
  const model = c.p.model.years;
  c.s.text("Schedule of Add-backs", 306, 740, { size: 14, face: "sansB", align: "center" });
  c.s.text(`Seller’s discretionary earnings recast — ${targetName(c)}`, 306, 726, {
    size: 9,
    align: "center",
  });
  c.s.text("Prepared from the business tax returns and year-end statements · Unaudited", 306, 713, {
    size: 7.8,
    align: "center",
    color: MUTED,
  });
  const rng = c.rng;
  const lines = [
    "Owner salary (Form 1120-S line 7)",
    "Depreciation (line 14)",
    "Interest expense",
    "Owner health insurance",
    "One-time: roof repair 2024",
    "Personal vehicle use",
  ];
  const values = lines.map((_, li) =>
    years.map((y) =>
      li === 4
        ? y === "2024"
          ? 18_400
          : 0
        : round([82_000, 21_000, 6_400, 11_800, 0, 5_200][li]! * (0.92 + rng() * 0.16), 100),
    ),
  );
  const net = years.map((y) => model[y]?.income ?? 0);
  const sde = years.map((_, i) => net[i]! + values.reduce((n, v) => n + v[i]!, 0));
  const cols: Col[] = [
    { w: 236, head: "Line item" },
    ...years.map((y) => ({ w: 89, head: `FY${y}`, align: "right" as const })),
  ];
  let y = table(
    c,
    M,
    684,
    cols,
    [
      ["Net income (ordinary business income)", ...net.map((n) => money(n))],
      ...lines.map((label, i) => [`Add: ${label}`, ...values[i]!.map((n) => (n ? money(n) : "—"))]),
      ["Seller’s discretionary earnings", ...sde.map((n) => money(n))],
    ],
    { size: 8.6, rules: true, bold: new Set([0, lines.length + 1]), lead: 16 },
  );
  y -= 8;
  y = c.s.para(
    "Each add-back traces to a general ledger account and supporting invoice. Owner salary is added back in full because the buyer will replace the seller in the business; the lender’s underwriting deducts a market salary for the buyer.",
    M,
    y,
    W,
    { size: 7.8, leading: 10, color: MUTED },
  );
  notes(c, y - 10);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- projections
export function projections(c: Ctx) {
  const base = c.p.model.years["2025"]?.revenue ?? 1_400_000;
  c.s.text("Financial Projections", 306, 740, { size: 14, face: "sansB", align: "center" });
  c.s.text(`Three-year projected income statement — ${buyerName(c)}`, 306, 726, {
    size: 9,
    align: "center",
  });
  c.s.text(
    "Prepared by management for the SBA 7(a) application · Not reviewed by an accountant",
    306,
    713,
    { size: 7.8, align: "center", color: MUTED },
  );
  const rev = [1.04, 1.08, 1.12].map((g) => round(base * g, 1_000));
  const cogs = rev.map((r) => round(r * 0.45, 1_000));
  const opex = rev.map((r) => round(r * 0.38, 1_000));
  const ebitda = rev.map((r, i) => r - cogs[i]! - opex[i]!);
  const debtService = 287_400;
  const cols: Col[] = [
    { w: 236, head: "" },
    ...["Year 1", "Year 2", "Year 3"].map((h) => ({ w: 89, head: h, align: "right" as const })),
  ];
  let y = table(
    c,
    M,
    684,
    cols,
    [
      ["Revenue", ...rev.map((n) => money(n))],
      ["Cost of goods sold", ...cogs.map((n) => money(n))],
      ["Gross profit", ...rev.map((r, i) => money(r - cogs[i]!))],
      ["Operating expenses (including buyer salary)", ...opex.map((n) => money(n))],
      ["EBITDA", ...ebitda.map((n) => money(n))],
      [
        "Annual debt service (SBA loan and seller note)",
        ...[0, 1, 2].map(() => money(debtService)),
      ],
      ["Debt service coverage ratio", ...ebitda.map((e) => `${(e / debtService).toFixed(2)}x`)],
    ],
    { size: 8.8, rules: true, bold: new Set([2, 4, 6]), lead: 17 },
  );
  y = heading(c, "Key assumptions", y - 12);
  for (const line of [
    "Revenue grows 4% in year 1 from retained customers and 4% a year after that from price increases.",
    "Gross margin holds at 55%, in line with the last three years of the business.",
    "Operating expenses include a market salary for the buyer as general manager.",
    "Debt service assumes a 10-year SBA 7(a) term at 10.5% and no seller note payments while on standby.",
  ]) {
    c.s.text(`•  ${line}`, M, y, { size: 8.6 });
    y -= 13;
  }
  notes(c, y - 8);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- equipment list and inventory
const EQUIPMENT: Record<string, [string, string, string, number][]> = {
  hvac: [
    ["Service van, high roof", "Ferrant Transit 250", "2022", 38_500],
    ["Service van, high roof", "Ferrant Transit 250", "2021", 33_200],
    ["Refrigerant recovery machine", "Coldline RR-4", "2023", 1_850],
    ["Vacuum pump, 8 CFM", "Coldline VP-8", "2023", 720],
    ["Digital manifold set", "Brask DM-44", "2024", 640],
    ["Combustion analyzer", "Brask CA-310", "2022", 1_120],
    ["Sheet metal brake, 10 ft", "Tazmervale SM-10", "2019", 6_400],
    ["Duct fabrication plasma table", "Tazmervale PT-48", "2020", 18_900],
    ["Leak detector kit", "Coldline LD-2", "2024", 410],
    ["Office furniture and computers", "Various", "2021", 7_300],
  ],
  grounds: [
    ["Zero-turn mower, 60 in", "Greenrow ZT-60", "2023", 12_800],
    ["Zero-turn mower, 52 in", "Greenrow ZT-52", "2022", 9_900],
    ["Crew truck with dump bed", "Ferrant F-450", "2021", 42_000],
    ["Enclosed trailer, 16 ft", "Halcot ET-16", "2022", 7_400],
    ["Commercial leaf blower (6)", "Brask BP-9", "2024", 3_300],
    ["String trimmers (8)", "Brask ST-4", "2024", 2_560],
    ["Aerator, walk-behind", "Greenrow AR-26", "2020", 3_900],
    ["Skid steer loader", "Halcot SL-70", "2019", 28_500],
    ["Salt spreader", "Halcot SS-8", "2021", 4_100],
    ["Office furniture and computers", "Various", "2021", 5_200],
  ],
  fitness: [
    ["Commercial treadmills (8)", "Rellis T-900", "2022", 52_000],
    ["Elliptical trainers (6)", "Rellis E-70", "2022", 27_600],
    ["Selectorized strength line (12)", "Rellis S-Series", "2021", 61_000],
    ["Free weight set with racks", "Rellis FW-Pro", "2021", 14_800],
    ["Rowing machines (6)", "Rellis R-2", "2023", 7_800],
    ["Group cycling bikes (20)", "Rellis C-4", "2022", 23_000],
    ["Sound system", "Northway AV-12", "2021", 4_600],
    ["Front desk and check-in system", "Various", "2021", 6_900],
    ["Locker room fixtures", "Various", "2020", 11_200],
    ["Office furniture and computers", "Various", "2021", 4_300],
  ],
};
export function equipmentList(c: Ctx) {
  const items = EQUIPMENT[industry(c.name)] ?? EQUIPMENT.hvac!;
  c.s.text("Equipment List", 306, 740, { size: 14, face: "sansB", align: "center" });
  c.s.text(`Fixed assets included in the sale — ${c.name}`, 306, 726, { size: 9, align: "center" });
  c.s.text(
    `As of ${longDate(dateOf(c))} · Values are the seller’s estimate of fair market value`,
    306,
    713,
    { size: 7.8, align: "center", color: MUTED },
  );
  const rows = items.map(([desc, model, year, fmv], i) => [
    String(i + 1),
    desc,
    model,
    `SN-${year}-${String(4100 + i * 37).padStart(4, "0")}`,
    year,
    i % 3 === 2 ? "Fair" : "Good",
    money(fmv),
  ]);
  const cols: Col[] = [
    { w: 22, head: "#" },
    { w: 150, head: "Description" },
    { w: 102, head: "Make / model" },
    { w: 72, head: "Serial no." },
    { w: 36, head: "Year" },
    { w: 46, head: "Condition" },
    { w: 76, head: "Est. FMV", align: "right" },
  ];
  let y = table(c, M, 684, cols, rows, { size: 8.4, zebra: [0.965, 0.97, 0.975], lead: 16 });
  c.s.line(M, y + 12, R, y + 12, INK, 0.6);
  c.s.text("Total estimated fair market value", M + 4, y, { size: 8.8, face: "sansB" });
  c.s.text(money(items.reduce((n, x) => n + x[3], 0)), R - 4, y, {
    size: 8.8,
    face: "sansB",
    align: "right",
  });
  y = notes(c, y - 24);
  record(c);
  synthetic(c);
}
export function inventorySummary(c: Ctx) {
  const kind = industry(c.name);
  const categories: [string, number, number][] =
    kind === "grounds"
      ? [
          ["Seed and sod", 42, 6_900],
          ["Fertilizer and chemicals", 36, 9_400],
          ["Irrigation parts", 118, 5_300],
          ["Hardscape stone", 24, 11_200],
          ["Small tools and parts", 210, 3_600],
        ]
      : kind === "fitness"
        ? [
            ["Retail apparel", 64, 4_800],
            ["Supplements and drinks", 88, 3_100],
            ["Replacement parts", 57, 2_700],
            ["Cleaning supplies", 31, 900],
            ["Towels and linens", 12, 1_400],
          ]
        : [
            ["Furnaces and air handlers", 18, 24_600],
            ["Condensing units", 11, 19_800],
            ["Refrigerant (cylinders)", 46, 7_300],
            ["Ductwork and fittings", 320, 8_900],
            ["Thermostats and controls", 74, 5_100],
            ["Parts and consumables", 540, 6_800],
          ];
  c.s.text("Inventory Summary", 306, 740, { size: 14, face: "sansB", align: "center" });
  c.s.text(`Physical count — ${c.name}`, 306, 726, { size: 9, align: "center" });
  c.s.text(
    `Counted ${longDate(dateOf(c))} · Valued at lower of cost (FIFO) or net realizable value`,
    306,
    713,
    { size: 7.8, align: "center", color: MUTED },
  );
  const cols: Col[] = [
    { w: 210, head: "Category" },
    { w: 70, head: "SKUs", align: "right" },
    { w: 90, head: "Units on hand", align: "right" },
    { w: 134, head: "Extended cost", align: "right" },
  ];
  const rows = categories.map(([name, skus, cost]) => [
    name,
    String(Math.max(3, Math.round(skus / 6))),
    String(skus),
    money(cost),
  ]);
  let y = table(c, M, 684, cols, rows, { size: 9, rules: true, lead: 17 });
  c.s.text("Total inventory at cost", M + 4, y, { size: 9, face: "sansB" });
  c.s.text(money(categories.reduce((n, x) => n + x[2], 0)), R - 4, y, {
    size: 9,
    face: "sansB",
    align: "right",
  });
  y = c.s.para(
    "Counted by the seller and observed by the buyer’s representative. Slow-moving items older than 12 months are excluded from the valuation and listed separately on request.",
    M,
    y - 22,
    W,
    { size: 7.8, leading: 10, color: MUTED },
  );
  notes(c, y - 10);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- ownership chart
export function ownershipChart(c: Ctx) {
  const members =
    c.v<{ name: string; percent: number; title?: string }[]>("ownership.members") ?? [];
  const company = c.name;
  c.s.text("Ownership Chart", 306, 740, { size: 14, face: "sansB", align: "center" });
  c.s.text(`${company} — ownership after closing`, 306, 726, { size: 9, align: "center" });
  const boxW = 150,
    gap = 30;
  const rowW = members.length * boxW + (members.length - 1) * gap;
  let x = 306 - rowW / 2;
  for (const m of members) {
    c.s.rect(x, 640, boxW, 44, { stroke: INK, lw: 0.8, fill: [0.96, 0.97, 0.98] });
    c.s.text(m.name, x + boxW / 2, 666, { size: 8.6, face: "sansB", align: "center" });
    c.s.text(`${m.percent}% member`, x + boxW / 2, 652, { size: 8, align: "center", color: MUTED });
    c.s.line(x + boxW / 2, 640, 306, 610, INK, 0.7);
    x += boxW + gap;
  }
  c.s.rect(216, 566, 180, 44, { stroke: INK, lw: 1, fill: [0.9, 0.93, 0.97] });
  c.s.text(company, 306, 592, { size: 9, face: "sansB", align: "center" });
  c.s.text("Borrower · Tazmervale LLC", 306, 578, { size: 8, align: "center", color: MUTED });
  c.s.line(306, 566, 306, 536, INK, 0.7);
  c.s.rect(216, 492, 180, 44, { stroke: INK, lw: 1 });
  c.s.text(`Business of ${targetName(c)}`, 306, 518, { size: 8.4, face: "sansB", align: "center" });
  c.s.text("Acquired by asset purchase", 306, 504, { size: 8, align: "center", color: MUTED });
  let y = heading(c, "Ownership table", 464);
  c.s.text("Owner", M + 4, y, { size: 8.6, face: "sansB", color: MUTED });
  c.s.text("Interest", 330, y, { size: 8.6, face: "sansB", color: MUTED });
  y -= 15;
  for (const m of members) {
    c.s.text(m.name, M + 4, y, { size: 9.2 });
    c.s.text(`${m.percent}%${m.title ? ` ${m.title}` : ""}`, 330, y, { size: 9.2 });
    y -= 14;
  }
  if (members.length && factQuote(c.d, "ownership.members") !== members.map(memberRow).join(" "))
    throw Error("ownership rows drift");
  y = c.s.para(
    "Every person who owns 20% or more of the borrower, directly or indirectly, guarantees the loan and provides a personal financial statement.",
    M,
    y - 8,
    W,
    { size: 7.8, leading: 10, color: MUTED },
  );
  notes(c, y - 10);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- wire transfer confirmation
export function wireConfirmation(c: Ctx) {
  const gift = c.p.documents.find((d: Doc) => d.type === "GIFT_LETTER");
  const amount = Number(gift?.facts["gift.amount"] ?? c.p.model.gift) || 50_000;
  const donor = String(gift?.facts["gift.donor"] ?? "Donor");
  const recipient = String(gift?.facts["gift.recipient"] ?? c.name);
  c.s.text("Wire Transfer Confirmation", M, 740, { size: 14, face: "sansB" });
  c.s.text("Outgoing domestic wire · Completed", M, 726, { size: 9, color: [0.1, 0.45, 0.2] });
  c.s.rect(M, 694, W, 22, { fill: NAVY });
  c.s.text(lenderName(c), M + 10, 701, { size: 11, face: "sansB", color: WHITE });
  c.s.text("Online Banking · printed 08/12/2026 2:41 PM", R - 10, 701, {
    size: 7.6,
    color: [0.8, 0.86, 0.93],
    align: "right",
  });
  let y = 672;
  const rows: [string, string][] = [
    ["Amount", money2(amount)],
    ["Value date", longDate("2026-08-12")],
    ["Status", "Completed — funds delivered to beneficiary bank"],
    ["Originator", donor],
    ["Originator account", "Checking ******4410"],
    ["Beneficiary", recipient],
    ["Beneficiary bank", `${lenderName(c)}, Tazmervale, ZZ`],
    ["Beneficiary bank routing", "ABA ending 0418"],
    ["Beneficiary account", "******4321"],
    ["Reference for beneficiary", "Gift funds per signed gift letter"],
    ["IMAD", "20260812ZLMVB1QC000417"],
    ["OMAD", "20260812ZLMVB2RD004122FT03"],
    ["Confirmation number", "WT-2026-0812-00417"],
  ];
  for (const [label, value] of rows) {
    kv(c, label, value, M, y, { w: 170, size: 9.2 });
    c.s.line(M, y - 5, R, y - 5, [0.9, 0.91, 0.92], 0.4);
    y -= 17;
  }
  y = c.s.para(
    "This confirmation shows the wire was accepted and sent through the Fedwire Funds Service. Keep it with the gift letter. Questions: (202) 555-0163.",
    M,
    y - 8,
    W,
    { size: 7.8, leading: 10, color: MUTED },
  );
  notes(c, y - 10);
  record(c);
  synthetic(c);
}

export { BUYER_ADDRESS, TARGET_ADDRESS, personAddress, usDate, addDays, WHITE, INK, MUTED, RULE };
