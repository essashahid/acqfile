/**
 * Letters and agreements: letter of intent, asset/stock purchase agreement, commercial lease, lease
 * consent and estoppel, operating agreement, seller promissory note, consulting and
 * non-competition agreements, franchise agreement, gift letter and credit authorization.
 * Structures follow the researched real-world forms; every party and figure is synthetic.
 */
import { countInWords, longDate, money, money2, usDate } from "./format";
import { factQuote, memberRow } from "./quotes";
import {
  BUYER_ADDRESS,
  M,
  R,
  TARGET_ADDRESS,
  buyerName,
  kv,
  landlordName,
  lenderName,
  notes,
  personAddress,
  record,
  signatureBlock,
  synthetic,
  targetName,
  type Ctx,
} from "./kit";
import { INK, MUTED, RULE, type Face } from "./sheet";

const W = R - M;
type Para = { head?: string; text: string };
/** Numbered clauses: a bold caption run, then the clause text wrapped beneath it. */
function clauses(
  c: Ctx,
  y: number,
  items: Para[],
  o: { size?: number; lead?: number; gap?: number; face?: Face } = {},
) {
  const size = o.size ?? 9.2,
    lead = o.lead ?? 11.6,
    face = o.face ?? "serif";
  for (const item of items) {
    let indent = 0;
    if (item.head) {
      c.s.text(item.head, M, y, { size, face: face === "serif" ? "serifB" : "sansB" });
      indent = c.s.width(item.head, size, face === "serif" ? "serifB" : "sansB") + 4;
    }
    y = c.s.para(item.text, M, y, W, { size, face, leading: lead, indent });
    y -= o.gap ?? 4.5;
  }
  return y;
}
const letterhead = (c: Ctx, name: string, address: string, contact: string, y = 742) => {
  c.s.text(name, M, y, { size: 13, face: "serifB" });
  c.s.text(address, M, y - 13, { size: 8.4, color: MUTED });
  c.s.text(contact, M, y - 24, { size: 8.4, color: MUTED });
  c.s.line(M, y - 31, R, y - 31, INK, 0.8);
  return y - 48;
};
const dateOf = (c: Ctx) =>
  longDate(c.d.metadata.document_date ?? c.d.metadata.signature_date ?? "2026-08-31");
const signed = (c: Ctx) => c.d.metadata.signed !== false;

export function loi(c: Ctx) {
  const buyer = buyerName(c),
    seller = targetName(c);
  // Heading lines first: extraction order is drawing order, and the title identifies the document.
  c.s.text("Letter of Intent", 306, 612, { size: 15, face: "serifB", align: "center" });
  c.s.text(`Non-binding proposal to acquire the business of ${seller}`, 306, 598, {
    size: 9.5,
    face: "serifI",
    align: "center",
  });
  let y = letterhead(c, buyer, BUYER_ADDRESS, "(202) 555-0147 · acquisitions@example.com");
  c.s.text(dateOf(c), M, y, { size: 9.5, face: "serif" });
  [
    seller,
    "Attention: Managing Member",
    ...TARGET_ADDRESS.split(", ").reduce<string[]>(
      (a, part, i) => (i < 2 ? [...a, part] : [...a.slice(0, -1), `${a.at(-1)}, ${part}`]),
      [],
    ),
  ].forEach((line, i) => c.s.text(line, M, y - 16 - i * 11.5, { size: 9.5, face: "serif" }));
  y = 574;
  c.s.text("Dear Managing Member:", M, y, { size: 9.5, face: "serif" });
  y -= 16;
  const price = c.has("deal.purchase_price")
    ? `${c.sentence("deal.purchase_price")}, payable at closing`
    : "The purchase price will be agreed in the definitive agreement, payable at closing";
  const note = c.has("deal.seller_note_amount")
    ? ` in cash from Buyer’s equity injection and the proceeds of an SBA 7(a) loan, and by ${c.sentence("deal.seller_note_amount")} (the “Seller Note”).`
    : " in cash from Buyer’s equity injection and the proceeds of an SBA 7(a) loan.";
  const terms = c.has("deal.seller_note_terms") ? ` ${c.sentence("deal.seller_note_terms")}.` : "";
  y = clauses(c, y, [
    {
      text: `${buyer} (“Buyer”) is pleased to submit this letter of intent to acquire the business of ${seller} (“Seller”) on the principal terms below.`,
    },
    {
      head: "1. Transaction.",
      text: "Buyer will acquire substantially all of the operating assets of Seller, including equipment, inventory, customer relationships, trade names and goodwill, free of liens, in a transaction structured as an asset purchase.",
    },
    { head: "2. Purchase Price.", text: `${price}${note}${terms}` },
    {
      head: "3. Financing.",
      text: `Buyer’s obligations are conditioned on approval of an SBA 7(a) loan from ${lenderName(c)} on terms acceptable to Buyer.`,
    },
    {
      head: "4. Due Diligence.",
      text: "Seller will give Buyer and its advisers reasonable access to Seller’s books, records, contracts, facilities and personnel for 45 days after acceptance of this letter.",
    },
    {
      head: "5. Exclusivity.",
      text: "For 60 days after acceptance, Seller will not solicit, encourage or negotiate any other proposal for the sale of the business or its assets.",
    },
    {
      head: "6. Confidentiality.",
      text: "The parties’ existing confidentiality agreement continues to govern all information exchanged in connection with this proposal.",
    },
    {
      head: "7. Non-binding Effect.",
      text: "Except for Sections 5 and 6, which are binding, this letter is an expression of intent only and creates no obligation until a definitive purchase agreement is signed.",
    },
    {
      head: "8. Expiration.",
      text: c.has("deal.expiry_date")
        ? `${c.sentence("deal.expiry_date")}.`
        : "This letter will expire if not accepted in writing within ten business days.",
    },
  ]);
  y -= 4;
  c.s.text("Sincerely,", M, y, { size: 9.5, face: "serif" });
  c.s.text("AGREED AND ACCEPTED:", 330, y, { size: 9.5, face: "serif" });
  const both = c.v<boolean>("deal.signed_by_both") ?? true;
  signatureBlock(c, M, y - 16, {
    party: `Buyer: ${buyer}`,
    by: "Managing Member",
    signed: signed(c),
    width: 210,
  });
  const after = signatureBlock(c, 330, y - 16, {
    party: `Seller: ${seller}`,
    by: "Managing Member",
    signed: both && signed(c),
    width: 210,
  });
  if (c.has("deal.signed_by_both"))
    c.s.text(`${c.sentence("deal.signed_by_both")}.`, M, after - 2, {
      size: 8.4,
      face: "serifI",
      color: MUTED,
    });
  notes(c, after - 16);
  record(c);
  synthetic(c);
}

export function purchaseAgreement(c: Ctx) {
  const stock = c.v("deal.structure") === "stock";
  const buyer = c.has("deal.buyer") ? c.v<string>("deal.buyer") : buyerName(c);
  const seller = c.has("deal.seller") ? c.v<string>("deal.seller") : targetName(c);
  c.s.text(`${stock ? "STOCK" : "ASSET"} PURCHASE AGREEMENT`, 306, 740, {
    size: 14,
    face: "serifB",
    align: "center",
  });
  c.s.text(`Dated as of ${dateOf(c)}`, 306, 726, {
    size: 9,
    face: "serifI",
    align: "center",
    color: MUTED,
  });
  const parties = [
    `This ${stock ? "STOCK" : "ASSET"} PURCHASE AGREEMENT (this “Agreement”) is entered into as of ${dateOf(c)}`,
    c.has("deal.buyer") ? c.sentence("deal.buyer") : `by and between ${buyer} (“Buyer”)`,
    `${c.has("deal.seller") ? c.sentence("deal.seller") : `and ${seller} (“Seller”)`}.`,
  ].join(" ");
  let y = c.s.para(parties, M, 704, W, { size: 9, face: "serif", leading: 11.4 });
  y = c.s.para(
    `WHEREAS, Seller owns and operates the business conducted under its name (the “Business”); and WHEREAS, Seller wishes to sell, and Buyer wishes to purchase, ${stock ? "all of the issued and outstanding equity interests of the Company" : "substantially all of the assets used in the Business"} on the terms and subject to the conditions of this Agreement. NOW, THEREFORE, the parties agree as follows:`,
    M,
    y - 5,
    W,
    { size: 9, face: "serif", leading: 11.4 },
  );
  const article = (title: string, yy: number) => {
    c.s.text(title, 306, yy, { size: 9.2, face: "serifB", align: "center" });
    return yy - 13;
  };
  y = article("ARTICLE I — PURCHASE AND SALE", y - 8);
  y = clauses(
    c,
    y,
    [
      {
        head: "1.1 Purchase and Sale.",
        text: `On the terms of this Agreement, at the Closing, ${c.has("deal.structure") ? c.sentence("deal.structure") : "Seller shall sell, assign and transfer to Buyer substantially all of the assets used in the Business (an asset purchase)"}, including equipment, inventory, accounts receivable, customer lists, contracts listed on Schedule 1.1, trade names and goodwill (the “Purchased Assets”).`,
      },
      {
        head: "1.2 Excluded Assets.",
        text: "Cash, bank accounts, tax refunds, insurance policies, corporate records and the assets listed on Schedule 1.2 are excluded and remain the property of Seller.",
      },
      {
        head: "1.3 Assumed Liabilities.",
        text: "Buyer assumes only obligations arising after the Closing under the contracts assigned to it. All other liabilities of Seller remain with Seller.",
      },
    ],
    { size: 8.8, lead: 11 },
  );
  y = article("ARTICLE II — PURCHASE PRICE", y - 4);
  const note = c.has("deal.seller_note_amount")
    ? ` and (b) by delivery of ${c.sentence("deal.seller_note_amount")} (the “Seller Note”), subordinated to the SBA lender${c.has("deal.seller_note_terms") ? `. ${c.sentence("deal.seller_note_terms")}` : ""}.`
    : ".";
  y = clauses(
    c,
    y,
    [
      {
        head: "2.1 Purchase Price.",
        text: `${c.has("deal.purchase_price") ? c.sentence("deal.purchase_price") : "The aggregate purchase price is stated on Schedule 2.1 (the “Purchase Price”)"}.`,
      },
      {
        head: "2.2 Payment.",
        text: `The Purchase Price shall be paid (a) in cash at the Closing by wire transfer of immediately available funds${note}`,
      },
      {
        head: "2.3 Working Capital.",
        text: "Inventory shall be counted jointly on the day before Closing and valued at the lower of cost or net realizable value.",
      },
      {
        head: "2.4 Allocation.",
        text: `${c.has("deal.allocation_present") ? c.sentence("deal.allocation_present") : "The Purchase Price shall be allocated among the Purchased Assets as set forth on Schedule 2.4"}, prepared in accordance with Section 1060 of the Internal Revenue Code and IRS Form 8594.`,
      },
    ],
    { size: 8.8, lead: 11 },
  );
  y = article("ARTICLE III — REPRESENTATIONS OF SELLER", y - 4);
  const reps = [
    c.has("party.address")
      ? `${c.sentence("party.address")}.`
      : `Seller’s principal place of business is ${TARGET_ADDRESS}.`,
    c.has("party.identifier") ? `${c.sentence("party.identifier")}.` : "",
    "Seller is duly organized, validly existing and in good standing, and has full authority to enter into this Agreement.",
  ].filter(Boolean);
  y = clauses(c, y, [{ head: "3.1 Organization; Identity.", text: reps.join(" ") }], {
    size: 8.8,
    lead: 11,
  });
  y = article("ARTICLE IX — TERMINATION", y - 4);
  y = clauses(
    c,
    y,
    [
      {
        head: "9.1 Termination.",
        text: `This Agreement may be terminated (a) by mutual written consent, or (b) by either party ${c.has("deal.outside_date") ? c.sentence("deal.outside_date") : "if the Closing has not occurred by the date stated on Schedule 9.1"} (the “Outside Date”), provided the terminating party is not then in breach.`,
      },
    ],
    { size: 8.8, lead: 11 },
  );
  y -= 2;
  c.s.text(
    "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.",
    M,
    y,
    { size: 8.8, face: "serif" },
  );
  y -= 16;
  signatureBlock(c, M, y, { party: `Buyer: ${buyer}`, by: "Managing Member", width: 210 });
  c.s.text(
    c.has("party.legal_name") ? c.sentence("party.legal_name") : `SELLER: ${targetName(c)}`,
    330,
    y,
    { size: 8.5, face: "serifB" },
  );
  c.s.line(330, y - 22, 540, y - 22, INK, 0.6);
  if (signed(c))
    c.s.text("/s/ e-signed", 334, y - 19, { size: 10, face: "serifI", color: [0.1, 0.18, 0.45] });
  c.s.text("By: Managing Member", 330, y - 31, { size: 8, face: "serif" });
  notes(c, y - 50);
  record(c);
  synthetic(c);
}

export function lease(c: Ctx) {
  const tenant = c.has("lease.tenant") ? c.v<string>("lease.tenant") : targetName(c);
  const landlord = c.has("lease.landlord") ? c.v<string>("lease.landlord") : landlordName(c);
  c.s.text("Commercial Premises Lease", 306, 740, { size: 15, face: "serifB", align: "center" });
  c.s.text("Basic Lease Information", M, 716, { size: 10, face: "serifB" });
  c.s.line(M, 712, R, 712, INK, 0.6);
  const expiry = c.has("lease.expiry") ? String(c.v("lease.expiry")) : "2031-08-31";
  const commence = `${Number(expiry.slice(0, 4)) - 5}${expiry.slice(4)}`;
  const rows: [string, string, string | null][] = [
    ["Date of Lease", longDate(commence), null],
    ["Landlord", landlord, "lease.landlord"],
    ["Tenant", tenant, "lease.tenant"],
    [
      "Premises",
      c.has("party.address") ? c.v<string>("party.address") : TARGET_ADDRESS,
      "party.address",
    ],
    ["Rentable Area", "3,850 rentable square feet, ground floor", null],
    ["Permitted Use", "Office, warehouse and service operations of Tenant’s business", null],
    ["Commencement Date", longDate(commence), null],
    ["Expiration Date", longDate(expiry), "lease.expiry"],
    ["Base Rent", "$6,450.00 per month, increasing 3% on each anniversary", null],
    ["Security Deposit", "$12,900.00", null],
    [
      "Renewal option term (years)",
      c.has("lease.option_years") ? String(c.v("lease.option_years")) : "0",
      "lease.option_years",
    ],
  ];
  let y = 698;
  for (const [label, value, fact] of rows) {
    // Fact rows print exactly as stated; the others carry the ordinary lease terms.
    if (fact && c.has(fact)) {
      const st = c.stated(fact);
      if ("label" in st)
        kv(c, st.label, st.value, M, y, {
          w: 160,
          size: 9,
          face: "serif",
          labelFace: "serifB",
          color: INK,
        });
    } else
      kv(c, label, value, M, y, {
        w: 160,
        size: 9,
        face: "serif",
        labelFace: "serifB",
        color: INK,
      });
    c.s.line(M, y - 4, R, y - 4, [0.88, 0.89, 0.9], 0.4);
    y -= 14.5;
  }
  y = clauses(
    c,
    y - 6,
    [
      {
        head: "1. Premises and Term.",
        text: "Landlord leases the Premises to Tenant for the Term stated above, together with the non-exclusive right to use the common areas and parking of the building.",
      },
      {
        head: "2. Rent.",
        text: "Tenant shall pay Base Rent in advance on the first day of each month, plus Tenant’s share of operating expenses, real estate taxes and insurance as additional rent.",
      },
      {
        head: "3. Assignment and Subletting.",
        text: `${c.has("lease.assignment_present") ? `${c.sentence("lease.assignment_present")}.` : "Tenant may not assign this Lease or sublet the Premises without Landlord’s prior written consent."} A sale of substantially all of Tenant’s assets is treated as an assignment for this purpose.`,
      },
      {
        head: "4. Renewal Option.",
        text: "Any renewal option is personal to Tenant and exercisable by written notice given at least 180 days before the Expiration Date, at 95% of fair market rent.",
      },
      {
        head: "5. Maintenance and Insurance.",
        text: "Tenant maintains the interior of the Premises and carries commercial general liability insurance of at least $1,000,000 per occurrence naming Landlord as additional insured.",
      },
    ],
    { size: 8.8, lead: 11 },
  );
  y = notes(c, y - 2);
  signatureBlock(c, M, y - 6, {
    party: `Landlord: ${landlord}`,
    by: "Manager",
    signed: signed(c),
    width: 210,
  });
  signatureBlock(c, 330, y - 6, {
    party: `Tenant: ${tenant}`,
    by: "Managing Member",
    signed: signed(c),
    width: 210,
  });
  record(c);
  synthetic(c);
}

export function leaseConsent(c: Ctx) {
  const tenant = targetName(c),
    buyer = buyerName(c),
    landlord = landlordName(c);
  c.s.text("Consent to Assignment of Lease", 306, 740, {
    size: 15,
    face: "serifB",
    align: "center",
  });
  c.s.text("and Landlord Estoppel Certificate", 306, 725, {
    size: 11,
    face: "serif",
    align: "center",
  });
  let y = letterhead(
    c,
    landlord,
    "5 Harrow Plaza, Tazmervale, ZZ 00000",
    "(202) 555-0171 · leasing@example.com",
    700,
  );
  c.s.text(dateOf(c), M, y, { size: 9.5, face: "serif" });
  y -= 14;
  [`To: ${lenderName(c)}, its successors and assigns`, `and to: ${buyer} (“Assignee”)`].forEach(
    (line) => {
      c.s.text(line, M, y, { size: 9.2, face: "serif" });
      y -= 12;
    },
  );
  y -= 4;
  y = c.s.para(
    `Re: Lease of premises at ${TARGET_ADDRESS} between ${landlord}, as landlord (“Landlord”), and ${tenant}, as tenant (“Tenant”), under the written lease between them (the “Lease”).`,
    M,
    y,
    W,
    { size: 9.2, face: "serifI", leading: 11.6 },
  );
  y = clauses(
    c,
    y - 6,
    [
      {
        text: "Landlord certifies to the addressees, who may rely on this certificate in connection with the sale of Tenant’s business and the related SBA-guaranteed financing, that:",
      },
      {
        head: "1.",
        text: "The Lease is in full force and effect and has not been modified except as attached. A true copy of the Lease, including all amendments, is attached as Exhibit A.",
      },
      {
        head: "2.",
        text: "Base Rent is currently $6,450.00 per month and has been paid through the month in which this certificate is signed. No rent has been paid more than one month in advance.",
      },
      {
        head: "3.",
        text: "Landlord holds a security deposit of $12,900.00. To Landlord’s knowledge, neither Landlord nor Tenant is in default under the Lease, and no event has occurred that would be a default with notice or time.",
      },
      {
        head: "4.",
        text: "Landlord consents to the assignment of the Lease by Tenant to Assignee effective upon the closing of the sale of Tenant’s business, and agrees that the assignment does not release Tenant unless Landlord separately agrees in writing.",
      },
      {
        head: "5.",
        text: "Landlord will give the SBA lender written notice of any default and a period of 30 days to cure before terminating the Lease.",
      },
    ],
    { size: 9, lead: 11.4 },
  );
  y = notes(c, y - 2);
  signatureBlock(c, M, y - 8, {
    party: `Landlord: ${landlord}`,
    by: "Manager",
    signed: signed(c),
    width: 230,
  });
  record(c);
  synthetic(c);
}

export function operatingAgreement(c: Ctx) {
  const company = c.name;
  c.s.text("Operating Agreement", 306, 740, { size: 15, face: "serifB", align: "center" });
  c.s.text(`of ${company}`, 306, 725, { size: 11, face: "serif", align: "center" });
  c.s.text("A Tazmervale Limited Liability Company", 306, 712, {
    size: 9,
    face: "serifI",
    align: "center",
    color: MUTED,
  });
  let y = c.s.para(
    `This Operating Agreement is made effective as of ${dateOf(c)} by the persons listed on Schedule A as the members (each a “Member”) of ${company} (the “Company”).`,
    M,
    690,
    W,
    { size: 9.2, face: "serif", leading: 11.6 },
  );
  y = clauses(
    c,
    y - 6,
    [
      {
        head: "1. Formation.",
        text: "The Company was formed by filing its certificate with the Secretary of State of the State of Tazmervale. The rights of the Members are governed by this Agreement and the Tazmervale Limited Liability Company Act.",
      },
      {
        head: "2. Purpose.",
        text: "The Company may acquire and operate businesses and engage in any lawful activity for which limited liability companies may be organized.",
      },
      {
        head: "3. Members and Interests.",
        text: "The names of the Members and their Percentage Interests are set forth on Schedule A. Allocations of profit and loss and distributions follow Percentage Interests.",
      },
      {
        head: "4. Capital Contributions.",
        text: "Each Member has contributed the cash or property recorded in the Company’s books. No Member is required to make an additional contribution.",
      },
      {
        head: "5. Management.",
        text: "The Company is member-managed. Actions outside the ordinary course, including any sale of substantially all assets or incurrence of debt above $250,000, require the consent of Members holding a majority of Percentage Interests.",
      },
      {
        head: "6. Transfers.",
        text: "No Member may transfer any interest without the written consent of the other Members, except to a trust for estate-planning purposes.",
      },
      {
        head: "7. Dissolution.",
        text: "The Company dissolves on the written consent of all Members or as required by law.",
      },
    ],
    { size: 9, lead: 11.3 },
  );
  y -= 6;
  c.s.text("SCHEDULE A — MEMBERS AND PERCENTAGE INTERESTS", M, y, { size: 9.2, face: "serifB" });
  c.s.line(M, y - 4, R, y - 4, INK, 0.6);
  y -= 16;
  const members =
    c.v<{ name: string; percent: number; title?: string }[]>("ownership.members") ?? [];
  // Each member row is name then interest, the order the ownership value reads in.
  for (const m of members) {
    c.s.text(m.name, M + 4, y, { size: 9.2, face: "serif" });
    c.s.text(`${m.percent}%${m.title ? ` ${m.title}` : ""}`, 360, y, { size: 9.2, face: "serif" });
    y -= 13;
  }
  c.s.line(M, y + 8, R, y + 8, RULE, 0.4);
  c.s.text("Total", M + 4, y, { size: 9.2, face: "serifB" });
  c.s.text(`${members.reduce((n, m) => n + m.percent, 0)}%`, 360, y, { size: 9.2, face: "serifB" });
  y = notes(c, y - 16);
  let sx = M;
  for (const m of members.slice(0, 2)) {
    signatureBlock(c, sx, y - 4, {
      party: `Member: ${m.name}`,
      by: m.name,
      signed: signed(c),
      width: 210,
    });
    sx = 330;
  }
  if (members.length && factQuote(c.d, "ownership.members") !== members.map(memberRow).join(" "))
    throw Error("Operating agreement members drift from the stated quote");
  record(c);
  synthetic(c);
}

export function sellerNote(c: Ctx) {
  const maker = buyerName(c),
    holder = targetName(c);
  const principal = c.has("note.principal") ? c.v<number>("note.principal") : 0;
  c.s.text("Promissory Note (Seller Note)", 306, 740, {
    size: 15,
    face: "serifB",
    align: "center",
  });
  c.s.text("Subordinated to SBA-guaranteed senior financing", 306, 725, {
    size: 9,
    face: "serifI",
    align: "center",
    color: MUTED,
  });
  c.s.text(money2(principal), M, 700, { size: 11, face: "serifB" });
  c.s.text(`Tazmervale, ZZ · ${dateOf(c)}`, R, 700, { size: 9.5, face: "serif", align: "right" });
  let y = c.s.para(
    `FOR VALUE RECEIVED, ${maker}, a Tazmervale limited liability company (“Maker”), promises to pay to the order of ${holder} (“Holder”) ${c.has("note.principal") ? c.sentence("note.principal") : "the principal sum stated above"}, together with interest on the unpaid balance at the fixed rate of six percent (6.00%) per annum, computed on a 365-day year.`,
    M,
    680,
    W,
    { size: 9.3, face: "serif", leading: 11.8 },
  );
  y = clauses(
    c,
    y - 6,
    [
      {
        head: "1. Maturity.",
        text: `${c.has("note.term_months") ? `${c.sentence("note.term_months")}.` : "The unpaid balance shall be due on the maturity date stated in the purchase agreement."} This Note is issued under the purchase agreement between Maker and Holder dated as of the date above.`,
      },
      {
        head: "2. Payments.",
        text: `${c.has("deal.seller_note_terms") ? `${c.sentence("deal.seller_note_terms")}.` : "Payments shall be made as set out in the purchase agreement."} Payments shall be applied first to accrued interest and then to principal.`,
      },
      {
        head: "3. Standby and Subordination.",
        text: `${c.has("note.full_standby") ? `${c.sentence("note.full_standby")}.` : ""} Holder shall execute SBA Form 155, Standby Creditor’s Agreement, in favor of ${lenderName(c)}, and shall take no action to enforce this Note or against any collateral while the SBA loan is outstanding without the lender’s written consent.`.trim(),
      },
      {
        head: "4. Prepayment.",
        text: "Subject to Section 3, Maker may prepay this Note in whole or in part at any time without premium or penalty.",
      },
      {
        head: "5. Default.",
        text: "If any payment permitted under Section 3 is not made within 15 days after it is due, Holder may, subject to Section 3, declare the unpaid balance immediately due.",
      },
      {
        head: "6. Governing Law.",
        text: "This Note is governed by the laws of the State of Tazmervale. Maker waives presentment, demand and notice of dishonor.",
      },
    ],
    { size: 9, lead: 11.4 },
  );
  y = notes(c, y - 2);
  signatureBlock(c, M, y - 8, {
    party: `Maker: ${maker}`,
    by: "Managing Member",
    signed: signed(c),
    width: 230,
  });
  record(c);
  synthetic(c);
}

export function consulting(c: Ctx) {
  const company = buyerName(c);
  const consultant = c.has("consulting.party") ? c.v<string>("consulting.party") : targetName(c);
  c.s.text("Consulting Agreement", 306, 740, { size: 15, face: "serifB", align: "center" });
  c.s.text("Transition Services Following the Sale of the Business", 306, 725, {
    size: 9.5,
    face: "serifI",
    align: "center",
    color: MUTED,
  });
  let y = c.s.para(
    `This Consulting Agreement is made as of ${dateOf(c)}. ${company} (the “Company”) ${c.has("consulting.party") ? c.sentence("consulting.party") : `engages ${consultant} (“Consultant”)`} to support the transition of the business acquired by the Company, ${c.has("consulting.term_months") ? c.sentence("consulting.term_months") : "for the term stated below"}, on the following terms.`,
    M,
    700,
    W,
    { size: 9.3, face: "serif", leading: 11.8 },
  );
  y = clauses(
    c,
    y - 6,
    [
      {
        head: "1. Services.",
        text: "Consultant will introduce the Company to key customers and suppliers, train the Company’s managers on scheduling, pricing and service procedures, and answer operational questions by telephone and in person.",
      },
      {
        head: "2. Time Commitment.",
        text: "Consultant will be available up to 20 hours per week during the first three months and up to 10 hours per week thereafter.",
      },
      {
        head: "3. Compensation.",
        text: "The Company will pay Consultant $4,000.00 per month in arrears and reimburse pre-approved travel expenses. Compensation is for services only and is not additional purchase price.",
      },
      {
        head: "4. Independent Contractor.",
        text: "Consultant is an independent contractor, is not an employee, officer or manager of the Company, and has no authority to bind the Company.",
      },
      {
        head: "5. Confidentiality.",
        text: "Consultant will keep confidential all non-public information of the Company and its customers during and after the term.",
      },
      {
        head: "6. Termination.",
        text: "Either party may terminate this Agreement on 30 days’ written notice. Sections 4 and 5 survive termination.",
      },
    ],
    { size: 9, lead: 11.4 },
  );
  y = notes(c, y - 2);
  signatureBlock(c, M, y - 8, {
    party: `Company: ${company}`,
    by: "Managing Member",
    signed: signed(c),
    width: 210,
  });
  signatureBlock(c, 330, y - 8, {
    party: `Consultant: ${consultant}`,
    by: "Authorized signatory",
    signed: signed(c),
    width: 210,
  });
  record(c);
  synthetic(c);
}

export function nonCompete(c: Ctx) {
  const buyer = buyerName(c),
    seller = targetName(c);
  c.s.text("Non-Competition Agreement", 306, 740, { size: 15, face: "serifB", align: "center" });
  c.s.text("Delivered at Closing of the Sale of the Business", 306, 725, {
    size: 9.5,
    face: "serifI",
    align: "center",
    color: MUTED,
  });
  let y = c.s.para(
    `This Non-Competition Agreement is entered into as of ${dateOf(c)} by ${seller} and its principal owner (together, the “Restricted Parties”) in favor of ${buyer} (“Buyer”), as a condition of Buyer’s purchase of the business of ${seller} (the “Business”).`,
    M,
    700,
    W,
    { size: 9.3, face: "serif", leading: 11.8 },
  );
  y = clauses(
    c,
    y - 6,
    [
      {
        head: "1. Covenant.",
        text: "For five years after the Closing, the Restricted Parties will not own, manage, operate or be employed by any business that competes with the Business within 50 miles of Tazmervale.",
      },
      {
        head: "2. Non-Solicitation.",
        text: "For the same period, the Restricted Parties will not solicit any customer or employee of the Business to end or reduce its relationship with Buyer.",
      },
      {
        head: "3. Consideration.",
        text: "The covenants are given in consideration of the purchase price paid under the purchase agreement, of which $25,000.00 is allocated to this Agreement.",
      },
      {
        head: "4. Reasonableness.",
        text: "The Restricted Parties agree the duration, area and scope are reasonable to protect the goodwill Buyer is acquiring. A court may narrow any provision it finds too broad.",
      },
      {
        head: "5. Remedies.",
        text: "Buyer may seek injunctive relief for any breach in addition to damages, without posting bond.",
      },
    ],
    { size: 9, lead: 11.4 },
  );
  y = notes(c, y - 2);
  signatureBlock(c, M, y - 8, {
    party: `Restricted Party: ${seller}`,
    by: "Managing Member",
    signed: signed(c),
    width: 210,
  });
  signatureBlock(c, 330, y - 8, {
    party: `Buyer: ${buyer}`,
    by: "Managing Member",
    signed: signed(c),
    width: 210,
  });
  record(c);
  synthetic(c);
}

export function franchiseAgreement(c: Ctx) {
  const brand = "Ostrelyva";
  c.s.text("Franchise Agreement", 306, 700, { size: 20, face: "serifB", align: "center" });
  c.s.text(`${brand} Franchising LLC`, 306, 740, { size: 12, face: "serifB", align: "center" });
  c.s.text("88 Brevard Circle, Tazmervale, ZZ 00000 · (202) 555-0186", 306, 727, {
    size: 8.5,
    face: "serif",
    align: "center",
    color: MUTED,
  });
  c.s.rect(236, 640, 140, 40, { stroke: INK, lw: 1.2 });
  c.s.text(brand.toUpperCase(), 306, 656, { size: 16, face: "serifB", align: "center" });
  let y = 610;
  const facts: [string, string][] = [
    ["Franchisee", targetName(c)],
    ["Franchised Location", TARGET_ADDRESS],
    ["Effective Date", dateOf(c)],
    ["Initial Term", "Ten (10) years, with two renewal terms of five (5) years"],
    ["Initial Franchise Fee", "$45,000.00"],
    ["Royalty Fee", "6% of Gross Sales, paid weekly"],
    ["Brand Fund Contribution", "2% of Gross Sales"],
    ["Protected Territory", "A 3-mile radius around the Franchised Location"],
  ];
  for (const [label, value] of facts) {
    kv(c, label, value, M + 40, y, {
      w: 150,
      size: 9.5,
      face: "serif",
      labelFace: "serifB",
      color: INK,
    });
    y -= 16;
  }
  y = clauses(
    c,
    y - 8,
    [
      {
        head: "Grant.",
        text: `Franchisor grants Franchisee the right to operate one ${brand} studio at the Franchised Location using the ${brand} marks and system, subject to the terms of this Agreement and the operations manual.`,
      },
      {
        head: "Transfer.",
        text: "Franchisee may not transfer this Agreement or the franchised business without Franchisor’s prior written consent, which may be conditioned on the transferee completing initial training.",
      },
    ],
    { size: 9.2, lead: 11.6 },
  );
  y = notes(c, y - 4);
  signatureBlock(c, M, y - 8, {
    party: `Franchisor: ${brand} Franchising LLC`,
    by: "President",
    signed: signed(c),
    width: 210,
  });
  signatureBlock(c, 330, y - 8, {
    party: `Franchisee: ${targetName(c)}`,
    by: "Managing Member",
    signed: signed(c),
    width: 210,
  });
  record(c);
  synthetic(c);
}

export function giftLetter(c: Ctx) {
  const donor = c.has("gift.donor") ? c.v<string>("gift.donor") : "Donor";
  const recipient = c.has("gift.recipient") ? c.v<string>("gift.recipient") : c.name;
  c.s.text("Gift Letter", 306, 740, { size: 16, face: "serifB", align: "center" });
  c.s.text(`Gift of funds toward the business acquisition financed by ${lenderName(c)}`, 306, 725, {
    size: 9,
    face: "serifI",
    align: "center",
    color: MUTED,
  });
  let y = 700;
  const rows: [string, string, string | null][] = [
    ["Donor name", donor, "gift.donor"],
    ["Donor address", personAddress(c, "donor"), null],
    ["Donor telephone", "(202) 555-0132", null],
    ["Relationship to recipient", "Parent", null],
    ["Recipient name", recipient, "gift.recipient"],
  ];
  for (const [label, value, fact] of rows) {
    if (fact && c.has(fact)) {
      const st = c.stated(fact);
      if ("label" in st)
        kv(c, st.label, st.value, M, y, {
          w: 150,
          size: 9.5,
          face: "serif",
          labelFace: "serifB",
          color: INK,
        });
    } else
      kv(c, label, value, M, y, {
        w: 150,
        size: 9.5,
        face: "serif",
        labelFace: "serifB",
        color: INK,
      });
    c.s.line(M + 150, y - 3, R, y - 3, RULE, 0.4);
    y -= 17;
  }
  y = clauses(
    c,
    y - 8,
    [
      {
        text: `I, the donor, have given or will give ${c.has("gift.amount") ? c.sentence("gift.amount") : "the gift stated below"} to the recipient named above, to be used toward the equity injection for the purchase of the business of ${targetName(c)}.`,
      },
      {
        text: `${c.has("gift.no_repayment") ? `${c.sentence("gift.no_repayment")}.` : ""} The gift is not a loan and is not secured by any asset of the recipient or the business.`.trim(),
      },
      {
        text: `The funds were transferred on ${longDate("2026-08-12")} from the donor’s account at ${lenderName(c)} ending in 4410, and are not provided by the seller, the broker or any other party with an interest in the sale.`,
      },
      {
        text: "I understand the lender will rely on this letter, and that a false statement may be a federal offense.",
      },
    ],
    { size: 9.4, lead: 12 },
  );
  y = notes(c, y - 4);
  signatureBlock(c, M, y - 8, {
    party: `Donor: ${donor}`,
    by: donor,
    signed: signed(c),
    width: 210,
  });
  signatureBlock(c, 330, y - 8, {
    party: `Recipient: ${recipient}`,
    by: recipient,
    signed: signed(c),
    width: 210,
  });
  record(c);
  synthetic(c);
}

export function creditAuth(c: Ctx) {
  const lender = lenderName(c);
  c.s.text("Authorization to Obtain Credit Report", 306, 740, {
    size: 14,
    face: "sansB",
    align: "center",
  });
  c.s.text(`${lender} · Small Business Lending`, 306, 725, {
    size: 9,
    align: "center",
    color: MUTED,
  });
  let y = c.s.para(
    `I authorize ${lender} and its agents to obtain a consumer credit report about me and to verify other credit information, including past and present debts, employment and income, in connection with the application for a business loan by ${buyerName(c)}, in which I am an owner, guarantor or principal. I understand ${lender} may obtain additional reports to update, renew, extend or collect on the loan while it is outstanding.`,
    M,
    700,
    W,
    { size: 9.3, leading: 12 },
  );
  y = c.s.para(
    "I understand this authorization is given under the Fair Credit Reporting Act, that a copy of this form is valid as the original, and that I may request the name and address of any consumer reporting agency that furnished a report.",
    M,
    y - 6,
    W,
    { size: 9.3, leading: 12 },
  );
  y -= 10;
  c.s.text("Applicant information", M, y, { size: 10, face: "sansB" });
  c.s.line(M, y - 4, R, y - 4, INK, 0.6);
  y -= 18;
  const rows: [string, string][] = [
    ["Full legal name", c.name],
    ["Date of birth", "XX/XX/1981"],
    ["Social security number", "XXX-XX- (on file)"],
    ["Current address", personAddress(c)],
    ["Years at current address", "7"],
    ["Previous address (if under 2 years)", "Not applicable"],
    ["Role in the business", "Owner and personal guarantor"],
  ];
  for (const [label, value] of rows) {
    kv(c, label, value, M, y, { w: 190, size: 9.3 });
    c.s.line(M + 190, y - 3, R, y - 3, RULE, 0.4);
    y -= 17;
  }
  y = notes(c, y - 6);
  signatureBlock(c, M, y - 6, {
    party: `Applicant: ${c.name}`,
    by: c.name,
    signed: signed(c),
    face: "sans",
    width: 240,
  });
  c.s.text(
    `Date: ${c.d.metadata.dated && c.d.metadata.signature_date ? usDate(c.d.metadata.signature_date) : "________________"}`,
    330,
    y - 25,
    { size: 9 },
  );
  record(c);
  synthetic(c);
}

export { countInWords, money };
