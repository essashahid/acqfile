/**
 * Notices, certificates, identity documents and short-form papers. Government-issued forms use a
 * fictional jurisdiction (State of Tazmervale) with synthetic numbers and a visible SPECIMEN mark,
 * so nothing here can pass as a real credential. The IRS notice follows the CP 575 letter layout.
 */
import { display } from "./display";
import { longDate, seeded, usDate } from "./format";
import {
  BUYER_ADDRESS,
  M,
  R,
  TARGET_ADDRESS,
  buyerName,
  industry,
  kv,
  lenderName,
  notes,
  personAddress,
  record,
  synthetic,
  targetName,
  type Ctx,
} from "./kit";
import { person } from "../../plans/shared";
import { INK, MUTED, RULE, SYNTHETIC_RED, WHITE, type RGB } from "./sheet";

const W = R - M;
const dateOf = (c: Ctx) =>
  String(c.d.metadata.document_date ?? c.d.metadata.signature_date ?? "2026-08-31");
const upperAddress = (address: string) => {
  const [street, ...rest] = address.split(", ");
  return [street!.toUpperCase(), rest.join(", ").toUpperCase().replace(", ", "  ")];
};
const seal = (c: Ctx, x: number, y: number, r: number, color: RGB, lines: [string, string]) => {
  c.s.ellipse(x, y, r, r, color, 1.4);
  c.s.ellipse(x, y, r - 6, r - 6, color, 0.6);
  c.s.text(lines[0], x, y + 4, { size: 6.4, face: "sansB", align: "center", color });
  c.s.text(lines[1], x, y - 6, { size: 6.4, face: "sansB", align: "center", color });
};

// ---------------------------------------------------------------- IRS notice CP 575
export function einLetter(c: Ctx) {
  const entity = c.name;
  const ein = c.has("party.identifier") ? display(c.v("party.identifier")) : "XX-XXX1234";
  const mono = (text: string, x: number, y: number, bold = false) =>
    c.s.text(text, x, y, { size: 8.6, face: bold ? "monoB" : "mono" });
  // The notice's own heading identifies it; it is drawn first so it leads the extracted text.
  c.s.text("WE ASSIGNED YOU AN EMPLOYER IDENTIFICATION NUMBER", 306, 548, {
    size: 8.6,
    face: "mono",
    align: "center",
  });
  c.s.text("IRS", M, 732, { size: 17, face: "serifB" });
  ["DEPARTMENT OF THE TREASURY", "INTERNAL REVENUE SERVICE", "CINCINNATI OH   45999-0023"].forEach(
    (line, i) => mono(line, M + 36, 738 - i * 10),
  );
  const issued = "2021-06-14";
  const right = [
    `Date of this notice:  ${usDate(issued).replaceAll("/", "-")}`,
    "",
    "Employer Identification Number:",
    ein,
    "",
    "Form:  SS-4",
    "",
    "Number of this notice:  CP 575 A",
    "",
    "For assistance you may call us at:",
    "(202) 555-0148",
    "",
    "IF YOU WRITE, ATTACH THE",
    "STUB AT THE END OF THIS NOTICE.",
  ];
  right.forEach((line, i) => line && mono(line, 330, 700 - i * 10));
  [entity.toUpperCase(), ...upperAddress(BUYER_ADDRESS)].forEach((line, i) =>
    mono(line, M + 30, 640 - i * 10),
  );
  let y = 530;
  const para = (text: string) => {
    y =
      c.s.para(text, M + 12, y, W - 24, { size: 8.6, face: "mono", leading: 10.4, indent: 26 }) - 8;
  };
  para(
    `Thank you for applying for an Employer Identification Number (EIN). ${c.has("party.identifier") ? c.sentence("party.identifier") : "We assigned you an EIN"}. This EIN will identify you, your business accounts, tax returns, and documents, even if you have no employees. Please keep this notice in your permanent records.`,
  );
  para(
    "When filing tax documents, payments, and related correspondence, it is very important that you use your EIN and complete name and address exactly as shown above. Any variation may cause a delay in processing, result in incorrect information in your account, or even cause you to be assigned more than one EIN. If the information is not correct as shown above, please make the correction using the attached tear off stub and return it to us.",
  );
  para(
    "A limited liability company (LLC) may file Form 8832, Entity Classification Election, and elect to be classified as an association taxable as a corporation. If the LLC is eligible to be treated as a corporation that meets certain tests and it will be electing S corporation status, it must timely file Form 2553, Election by a Small Business Corporation.",
  );
  mono("IMPORTANT REMINDERS:", M + 12, y, true);
  y -= 13;
  for (const item of [
    "Keep a copy of this notice in your permanent records. This notice is issued only one time and the IRS will not be able to generate a duplicate copy for you.",
    "Use this EIN and your name exactly as they appear at the top of this notice on all your federal tax forms.",
    "Refer to this EIN on your tax-related correspondence and documents.",
  ]) {
    mono("*", M + 30, y);
    y = c.s.para(item, M + 44, y, W - 56, { size: 8.6, face: "mono", leading: 10.4 }) - 4;
  }
  para(
    `Your name control associated with this EIN is ${entity
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 4)
      .toUpperCase()}. You will need to provide this information, along with your EIN, if you file your returns electronically.`,
  );
  mono("Keep this part for your records.        CP 575 A (Rev. 7-2007)", M + 60, y);
  c.s.line(M - 10, y - 10, R + 10, y - 10, INK, 0.6, [3, 3]);
  mono("Return this part with any correspondence so we may identify your account.", M + 12, y - 24);
  notes(c, y - 40);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- Secretary of State certificate
const GOLD: RGB = [0.55, 0.43, 0.12];
export function goodStanding(c: Ctx) {
  const entity = c.name;
  const number = `LLC-2021-${String(4000 + Math.floor(c.rng() * 900)).padStart(4, "0")}`;
  c.s.text("Certificate of Good Standing", 306, 640, { size: 20, face: "serifB", align: "center" });
  c.s.rect(40, 150, 532, 612, { stroke: GOLD, lw: 2.2 });
  c.s.rect(46, 156, 520, 600, { stroke: GOLD, lw: 0.6 });
  c.s.text("STATE OF TAZMERVALE", 306, 712, { size: 15, face: "serifB", align: "center" });
  c.s.text("Office of the Secretary of State · Business Services Division", 306, 696, {
    size: 9,
    face: "serifI",
    align: "center",
  });
  const secretary = person(20260701);
  let y = c.s.para(
    `I, ${secretary}, Secretary of State of the State of Tazmervale, do hereby certify that ${entity.toUpperCase()}, entity number ${number}, a limited liability company, was organized under the laws of the State of Tazmervale on March 3, 2021.`,
    84,
    600,
    444,
    { size: 11, face: "serif", leading: 15 },
  );
  y = c.s.para(
    "I further certify that the company has filed all annual reports required to date, has paid all fees and taxes due to this office, has not filed articles of dissolution, and is in good standing and has legal existence under the laws of this State as of the date of this certificate.",
    84,
    y - 8,
    444,
    { size: 11, face: "serif", leading: 15 },
  );
  y = c.s.para(
    `IN TESTIMONY WHEREOF, I have hereunto set my hand and affixed the Great Seal of the State of Tazmervale at the Capitol, on ${longDate(dateOf(c))}.`,
    84,
    y - 8,
    444,
    { size: 11, face: "serifI", leading: 15 },
  );
  seal(c, 170, y - 50, 38, GOLD, ["GREAT SEAL", "TAZMERVALE"]);
  c.s.line(330, y - 44, 528, y - 44, INK, 0.6);
  c.s.text("/s/ e-signed", 336, y - 40, { size: 11, face: "serifI", color: [0.1, 0.18, 0.45] });
  c.s.text(secretary, 330, y - 56, { size: 9.5, face: "serif" });
  c.s.text("Secretary of State", 330, y - 68, { size: 9, face: "serifI" });
  c.s.text(
    `Certificate number GS-2026-${number.slice(-4)}-0831 · Verify at sos.tazmervale.example`,
    306,
    176,
    { size: 7.8, face: "serif", align: "center", color: MUTED },
  );
  notes(c, 164);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- city business license
export function businessLicense(c: Ctx) {
  const kind = industry(c.name);
  const classification =
    kind === "hvac"
      ? "Heating, ventilation and air-conditioning contractor"
      : kind === "grounds"
        ? "Landscaping and grounds maintenance"
        : kind === "fitness"
          ? "Fitness and recreational sports center"
          : "General business services";
  c.s.text("Business License", 306, 668, { size: 22, face: "sansB", align: "center" });
  c.s.rect(54, 360, 504, 400, { stroke: [0.12, 0.3, 0.45], lw: 2 });
  c.s.rect(54, 720, 504, 40, { fill: [0.12, 0.3, 0.45] });
  c.s.text("CITY OF TAZMERVALE", 306, 742, {
    size: 14,
    face: "sansB",
    align: "center",
    color: WHITE,
  });
  c.s.text("Department of Finance · Business Tax and Registration", 306, 728, {
    size: 8.5,
    align: "center",
    color: [0.85, 0.9, 0.95],
  });
  c.s.text("Fiscal Year July 1, 2026 through June 30, 2027", 306, 700, {
    size: 9.5,
    align: "center",
  });
  let y = 630;
  for (const [label, value] of [
    ["License number", `BL-2026-0${String(18000 + Math.floor(c.rng() * 900))}`],
    ["Business name", c.name],
    ["Business location", TARGET_ADDRESS],
    ["Classification", classification],
    ["Ownership type", "Limited liability company"],
    ["Issued", longDate("2026-07-01")],
    ["Expires", longDate("2027-06-30")],
  ] as const) {
    kv(c, label, value, 96, y, { w: 130, size: 10, labelFace: "sansB", color: INK });
    y -= 22;
  }
  c.s.text(
    "THIS LICENSE MUST BE POSTED IN A CONSPICUOUS PLACE AT THE BUSINESS LOCATION",
    306,
    400,
    { size: 8.4, face: "sansB", align: "center" },
  );
  c.s.text("Not transferable. A change of ownership requires a new application.", 306, 386, {
    size: 8,
    align: "center",
    color: MUTED,
  });
  seal(c, 480, 470, 30, [0.12, 0.3, 0.45], ["CITY OF", "TAZMERVALE"]);
  notes(c, 340);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- articles of organization (state form)
export function articles(c: Ctx) {
  const entity = c.name;
  c.s.text("Articles of Organization", 306, 716, { size: 16, face: "sansB", align: "center" });
  c.s.text("Limited Liability Company", 306, 700, { size: 11, align: "center" });
  c.s.text("STATE OF TAZMERVALE · SECRETARY OF STATE", M, 744, { size: 8.5, face: "sansB" });
  c.s.text("Form LLC-1 (Rev. 01/2020)", R, 744, { size: 8, align: "right", color: MUTED });
  c.s.rect(420, 612, 138, 68, { stroke: SYNTHETIC_RED, lw: 1.4 });
  c.s.text("FILED", 489, 662, { size: 14, face: "sansB", align: "center", color: SYNTHETIC_RED });
  c.s.text("Secretary of State", 489, 648, { size: 7.5, align: "center", color: SYNTHETIC_RED });
  c.s.text("File No. LLC-2021-004417", 489, 636, {
    size: 7.5,
    align: "center",
    color: SYNTHETIC_RED,
  });
  c.s.text("03/03/2021 10:42 AM", 489, 624, { size: 7.5, align: "center", color: SYNTHETIC_RED });
  let y = 660;
  const item = (n: string, label: string, value: string[]) => {
    c.s.text(`${n}. ${label}`, M, y, { size: 9, face: "sansB" });
    y -= 13;
    for (const v of value) {
      c.s.text(v, M + 18, y, { size: 9.5 });
      c.s.line(M + 16, y - 3, 400, y - 3, RULE, 0.4);
      y -= 14;
    }
    y -= 6;
  };
  item("1", "Name of the limited liability company", [entity]);
  item("2", "Principal office address", [BUYER_ADDRESS]);
  item("3", "Registered agent name and street address in this State", [
    "Tazmervale Registered Agents Inc.",
    "400 Merrow Avenue, Tazmervale, ZZ 00000",
  ]);
  item("4", "Management (check one)", ["[X] Member-managed      [ ] Manager-managed"]);
  item("5", "Purpose", [
    "Any lawful business for which a limited liability company may be organized.",
  ]);
  item("6", "Effective date", ["Upon filing"]);
  item("7", "Organizer", [person(20260711), "Organizer, 220 Orlanne Street, Tazmervale, ZZ 00000"]);
  c.s.text(
    "The undersigned organizer affirms that the statements in these articles are true.",
    M,
    y,
    { size: 8.6 },
  );
  c.s.line(M, y - 26, M + 230, y - 26, INK, 0.6);
  c.s.text("/s/ e-signed", M + 4, y - 23, { size: 10, face: "serifI", color: [0.1, 0.18, 0.45] });
  c.s.text("Signature of organizer", M, y - 36, { size: 7.6, color: MUTED });
  c.s.text("Filing fee: $125.00 · Submit to the Business Services Division", M, y - 52, {
    size: 7.6,
    color: MUTED,
  });
  notes(c, y - 70);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- state identification card (front and back)
export function stateId(c: Ctx) {
  const parts = c.name.split(" ");
  const family = parts.at(-1)!.toUpperCase(),
    given = parts.slice(0, -1).join(" ").toUpperCase();
  const expiry = String(c.d.facts["id.expiry"] ?? "2030-12-31");
  const rng = seeded(c.d.party);
  const dob = `19${70 + Math.floor(rng() * 20)}-${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rng() * 27)).padStart(2, "0")}`;
  const TEAL: RGB = [0.05, 0.36, 0.42];
  // Front of card, 2x scale: 486 x 306 points. Shapes first; text order starts with the heading.
  const x0 = 63,
    y0 = 420;
  c.s.rect(x0, y0, 486, 306, { fill: [0.93, 0.96, 0.97], stroke: [0.55, 0.6, 0.64], lw: 1 });
  c.s.rect(x0, y0 + 262, 486, 44, { fill: TEAL });
  c.s.text("Government Photo Identification — copy of front and back", 306, 752, {
    size: 8,
    align: "center",
    color: MUTED,
  });
  c.s.text("IDENTIFICATION CARD", x0 + 472, y0 + 285, {
    size: 12,
    face: "sansB",
    color: WHITE,
    align: "right",
  });
  c.s.text("TAZMERVALE", x0 + 14, y0 + 285, { size: 17, face: "sansB", color: WHITE });
  c.s.rect(x0 + 16, y0 + 70, 132, 170, {
    fill: [0.83, 0.86, 0.88],
    stroke: [0.6, 0.64, 0.68],
    lw: 0.6,
  });
  c.s.ellipse(x0 + 82, y0 + 180, 32, 38, [0.55, 0.59, 0.63], 1);
  c.s.ellipse(x0 + 82, y0 + 96, 58, 36, [0.55, 0.59, 0.63], 1);
  const f = (label: string, value: string, x: number, y: number, size = 11) => {
    c.s.text(label, x0 + x, y0 + y, { size: 7.4, color: TEAL });
    c.s.text(value, x0 + x + c.s.width(label, 7.4) + 5, y0 + y, { size, face: "sansB" });
  };
  f("4d IDN", `T${String(4410000 + Math.floor(rng() * 90000))}`, 166, 238);
  f("1", family, 166, 216, 13);
  f("2", given, 166, 198, 12);
  const [street, ...rest] = personAddress(c).split(", ");
  f("8", street!.toUpperCase(), 166, 178, 9.5);
  c.s.text(rest.join(", ").toUpperCase(), x0 + 178, y0 + 165, { size: 9.5, face: "sansB" });
  f("3 DOB", usDate(dob), 166, 144, 11);
  f("4a ISS", usDate("2022-06-02"), 166, 124, 10);
  if (c.has("id.expiry")) {
    const st = c.stated("id.expiry");
    if ("label" in st) {
      c.s.text(st.label, x0 + 318, y0 + 124, { size: 7.4, color: SYNTHETIC_RED });
      c.s.text(st.value, x0 + 318 + c.s.width(st.label, 7.4) + 5, y0 + 124, {
        size: 10,
        face: "sansB",
        color: SYNTHETIC_RED,
      });
    }
  } else f("4b EXP", usDate(expiry), 318, 124, 10);
  f("15 SEX", rng() > 0.5 ? "M" : "F", 166, 104, 10);
  f("16 HGT", `5'-${String(4 + Math.floor(rng() * 8)).padStart(2, "0")}"`, 236, 104, 10);
  f("18 EYES", ["BRN", "BLU", "GRN", "HAZ"][Math.floor(rng() * 4)]!, 318, 104, 10);
  f("5 DD", `0${String(4417000 + Math.floor(rng() * 9000))}TZ`, 166, 84, 8.5);
  c.s.text("SPECIMEN", x0 + 330, y0 + 30, { size: 26, face: "sansB", color: SYNTHETIC_RED });
  c.s.text("NOT A VALID IDENTIFICATION DOCUMENT", x0 + 330, y0 + 18, {
    size: 6.6,
    face: "sansB",
    color: SYNTHETIC_RED,
  });
  // Back of card: machine-readable zone rendered as a barcode block.
  const yb = 90;
  c.s.rect(x0, yb, 486, 306, { fill: [0.97, 0.97, 0.97], stroke: [0.55, 0.6, 0.64], lw: 1 });
  for (let i = 0; i < 118; i++) {
    const w = 1 + Math.floor(rng() * 3);
    c.s.rect(x0 + 30 + i * 3.6, yb + 150, w * 0.9, 110, { fill: [0.12, 0.12, 0.12] });
  }
  c.s.text("9a END NONE     12 RESTR NONE     CLASS ID ONLY", x0 + 30, yb + 120, {
    size: 9,
    face: "sansB",
  });
  c.s.text(
    "Issued by the Tazmervale Department of Motor Vehicles. Report loss at dmv.tazmervale.example.",
    x0 + 30,
    yb + 100,
    { size: 7.6 },
  );
  c.s.text("SPECIMEN · SYNTHETIC TEST DATA", x0 + 30, yb + 30, {
    size: 12,
    face: "sansB",
    color: SYNTHETIC_RED,
  });
  notes(c, 80);
  record(c, { y: 70 });
  synthetic(c, { watermark: false });
}

// ---------------------------------------------------------------- certified birth record
export function birthCertificate(c: Ctx) {
  const parts = c.name.split(" ");
  const rng = seeded(c.d.party);
  const dob = `19${70 + Math.floor(rng() * 20)}-${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rng() * 27)).padStart(2, "0")}`;
  const BLUE: RGB = [0.16, 0.26, 0.5];
  c.s.text("Certificate of Live Birth", 306, 704, {
    size: 17,
    face: "serifB",
    align: "center",
    color: BLUE,
  });
  c.s.rect(44, 150, 524, 610, { stroke: BLUE, lw: 1.6 });
  c.s.text("STATE OF TAZMERVALE", 306, 740, {
    size: 12,
    face: "serifB",
    align: "center",
    color: BLUE,
  });
  c.s.text("Department of Health · Office of Vital Records", 306, 725, {
    size: 9,
    face: "serif",
    align: "center",
  });
  c.s.text(
    `State file number 142-${String(1981 + Math.floor(rng() * 9))}-0${String(4000 + Math.floor(rng() * 900))}`,
    540,
    686,
    { size: 8, align: "right", color: MUTED },
  );
  const cell = (label: string, value: string, x: number, y: number, w: number) => {
    c.s.rect(x, y - 8, w, 30, { stroke: [0.7, 0.74, 0.8], lw: 0.5 });
    c.s.text(label, x + 4, y + 14, { size: 6.4, color: BLUE });
    c.s.text(value, x + 4, y - 2, { size: 10, face: "sans" });
  };
  cell(
    "1a. CHILD’S NAME — FIRST, MIDDLE",
    parts.slice(0, -1).join(" ").toUpperCase(),
    60,
    640,
    250,
  );
  cell("1b. LAST", parts.at(-1)!.toUpperCase(), 310, 640, 242);
  cell("2. SEX", rng() > 0.5 ? "MALE" : "FEMALE", 60, 604, 110);
  cell("3a. DATE OF BIRTH", longDate(dob).toUpperCase(), 170, 604, 200);
  cell(
    "3b. HOUR",
    `${1 + Math.floor(rng() * 11)}:${String(Math.floor(rng() * 59)).padStart(2, "0")} AM`,
    370,
    604,
    182,
  );
  cell("4a. PLACE OF BIRTH — FACILITY", "TAZMERVALE GENERAL HOSPITAL", 60, 568, 300);
  cell("4b. CITY", "TAZMERVALE", 360, 568, 192);
  cell("5a. MOTHER’S MAIDEN NAME", person(Math.floor(rng() * 1e6)).toUpperCase(), 60, 532, 250);
  cell("5b. BIRTHPLACE", "TAZMERVALE", 310, 532, 242);
  cell("6a. FATHER’S NAME", person(Math.floor(rng() * 1e6) + 1).toUpperCase(), 60, 496, 250);
  cell("6b. BIRTHPLACE", "TAZMERVALE", 310, 496, 242);
  cell(
    "7. DATE FILED",
    longDate(`${dob.slice(0, 4)}-${dob.slice(5, 7)}-28`).toUpperCase(),
    60,
    460,
    250,
  );
  cell("8. ATTENDANT", "M.D.", 310, 460, 242);
  const y = c.s.para(
    "I certify that this is a true and correct copy of the official record filed with the Office of Vital Records, State of Tazmervale.",
    60,
    418,
    492,
    { size: 10, face: "serif", leading: 13 },
  );
  seal(c, 150, y - 56, 40, BLUE, ["OFFICE OF", "VITAL RECORDS"]);
  c.s.line(330, y - 48, 540, y - 48, INK, 0.6);
  c.s.text("/s/ e-signed", 336, y - 44, { size: 11, face: "serifI", color: [0.1, 0.18, 0.45] });
  c.s.text(`${person(20260721)}, State Registrar`, 330, y - 60, { size: 9, face: "serif" });
  c.s.text(`Issued ${longDate(dateOf(c))}`, 330, y - 72, { size: 9, face: "serif" });
  c.s.text(
    "This copy is not valid without the raised seal of the Office of Vital Records. SPECIMEN — synthetic test data.",
    306,
    164,
    { size: 7.4, face: "serifI", align: "center", color: MUTED },
  );
  notes(c, 140);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- résumé
const ROLES: Record<string, [string, string, string, string[]][]> = {
  hvac: [
    [
      "Operations Manager",
      "Brightfield Mechanical Services",
      "2018 – present",
      [
        "Run dispatch and scheduling for 14 technicians across 1,900 service agreements.",
        "Cut average first-visit resolution time from 2.4 to 1.6 visits by restructuring truck stock.",
        "Own the $2.1 million annual service budget and vendor pricing with three distributors.",
      ],
    ],
    [
      "Service Technician, then Lead Technician",
      "Corvane Heating & Cooling",
      "2011 – 2018",
      [
        "Installed and serviced residential and light commercial HVAC systems.",
        "Trained six apprentices; EPA Section 608 Universal certified.",
      ],
    ],
  ],
  grounds: [
    [
      "General Manager",
      "Halcot Landscape Group",
      "2017 – present",
      [
        "Manage 22 crew members and 140 commercial maintenance contracts.",
        "Grew recurring revenue 38% by adding snow and irrigation services.",
        "Introduced route planning software that saved 11% in fuel costs.",
      ],
    ],
    [
      "Crew Supervisor",
      "Greenrow Property Services",
      "2010 – 2017",
      [
        "Led installation and maintenance crews for office parks and HOAs.",
        "Licensed pesticide applicator.",
      ],
    ],
  ],
  fitness: [
    [
      "Studio Manager",
      "Rellis Fitness Club",
      "2016 – present",
      [
        "Manage a 1,400-member club with 18 trainers and front-desk staff.",
        "Raised member retention from 71% to 83% with a structured onboarding program.",
        "Own P&L, payroll and equipment maintenance schedules.",
      ],
    ],
    [
      "Personal Trainer, then Head Trainer",
      "Northway Athletic",
      "2010 – 2016",
      ["Built a personal training book of 60 weekly clients.", "NASM certified personal trainer."],
    ],
  ],
};
export function resume(c: Ctx) {
  const roles = ROLES[industry(targetName(c))] ?? ROLES.hvac!;
  c.s.text("RESUME", M, 742, { size: 8, face: "sansB", color: MUTED });
  c.s.text(c.name, M, 718, { size: 22, face: "serifB" });
  c.s.text(
    `${personAddress(c)} · (202) 555-0139 · ${c.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
    M,
    702,
    { size: 8.8, color: MUTED },
  );
  c.s.line(M, 693, R, 693, INK, 0.8);
  let y = 674;
  const section = (title: string) => {
    c.s.text(title.toUpperCase(), M, y, { size: 9, face: "sansB", color: [0.12, 0.3, 0.45] });
    y -= 15;
  };
  section("Summary");
  y =
    c.s.para(
      `Operator with fifteen years in the trade and seven years running daily operations, acquiring ${targetName(c)} as owner and general manager. Strong in scheduling, pricing, crew development and customer retention.`,
      M,
      y,
      W,
      { size: 9.5, face: "serif", leading: 12.4 },
    ) - 8;
  section("Experience");
  for (const [title, employer, dates, bullets] of roles) {
    c.s.text(title, M, y, { size: 10, face: "serifB" });
    c.s.text(dates, R, y, { size: 9, face: "serif", align: "right" });
    y -= 12.5;
    c.s.text(employer, M, y, { size: 9.5, face: "serifI" });
    y -= 14;
    for (const b of bullets) {
      c.s.text("•", M + 6, y, { size: 9.5, face: "serif" });
      y = c.s.para(b, M + 18, y, W - 18, { size: 9.5, face: "serif", leading: 12 }) - 2;
    }
    y -= 8;
  }
  section("Education");
  c.s.text("B.S., Business Administration — Tazmervale State University", M, y, {
    size: 9.5,
    face: "serif",
  });
  c.s.text("2009", R, y, { size: 9, face: "serif", align: "right" });
  y -= 22;
  section("Certifications");
  c.s.text(
    "SBA Boots to Business program graduate · OSHA 30-Hour General Industry · First Aid/CPR",
    M,
    y,
    { size: 9.5, face: "serif" },
  );
  notes(c, y - 24);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- franchise disclosure document cover (16 CFR 436.3)
export function fddCover(c: Ctx) {
  const brand = "Ostrelyva";
  c.s.text("FRANCHISE DISCLOSURE DOCUMENT", 306, 740, { size: 16, face: "sansB", align: "center" });
  c.s.text(`${brand} Franchising LLC`, 306, 718, { size: 11, face: "sansB", align: "center" });
  c.s.text("A Tazmervale limited liability company", 306, 705, { size: 9, align: "center" });
  c.s.text("88 Brevard Circle, Tazmervale, ZZ 00000 · (202) 555-0186", 306, 693, {
    size: 9,
    align: "center",
  });
  c.s.text("franchise@example.com · www.ostrelyva.example", 306, 681, { size: 9, align: "center" });
  c.s.rect(246, 624, 120, 44, { stroke: INK, lw: 1.2 });
  c.s.text(brand.toUpperCase(), 306, 640, { size: 15, face: "sansB", align: "center" });
  let y = c.s.para(
    `The franchisee will operate a boutique fitness studio offering group classes, personal training and memberships under the ${brand} name and system.`,
    M,
    604,
    W,
    { size: 9.3, leading: 12 },
  );
  y = c.s.para(
    `The total investment necessary to begin operation of a ${brand} franchise is $186,500 to $412,000. This includes $52,500 to $61,500 that must be paid to the franchisor or its affiliate.`,
    M,
    y - 6,
    W,
    { size: 9.3, leading: 12, face: "sansB" },
  );
  for (const text of [
    "This disclosure document summarizes certain provisions of your franchise agreement and other information in plain English. Read this disclosure document and all accompanying agreements carefully. You must receive this disclosure document at least 14 calendar days before you sign a binding agreement with, or make any payment to, the franchisor or an affiliate in connection with the proposed franchise sale. Note, however, that no governmental agency has verified the information contained in this document.",
    "You may wish to receive your disclosure document in another format that is more convenient for you. To discuss the availability of disclosures in different formats, contact the franchise department at the address above.",
    "The terms of your contract will govern your franchise relationship. Don’t rely on the disclosure document alone to understand your contract. Read all of your contract carefully. Show your contract and this disclosure document to an advisor, like a lawyer or an accountant.",
    "Buying a franchise is a complex investment. The information in this disclosure document can help you make up your mind. More information on franchising, such as “A Consumer’s Guide to Buying a Franchise,” which can help you understand how to use this disclosure document, is available from the Federal Trade Commission. You can contact the FTC at 1-877-FTC-HELP or by writing to the FTC at 600 Pennsylvania Avenue, NW, Washington, D.C. 20580. You can also visit the FTC’s home page at www.ftc.gov for additional information.",
    "There may also be laws on franchising in your state. Ask your state agencies about them.",
  ])
    y = c.s.para(text, M, y - 7, W, { size: 8.8, leading: 11.2 });
  c.s.text("Issuance Date: March 31, 2026", M, y - 12, { size: 9.3, face: "sansB" });
  notes(c, y - 30);
  record(c);
  synthetic(c);
}

// ---------------------------------------------------------------- material that is not required
export function brochure(c: Ctx) {
  const kind = industry(c.name);
  const title =
    kind === "fitness" ? "Caring for Your Studio Equipment" : "Keeping Your Equipment Running";
  c.s.text(title, M, 700, { size: 22, face: "sansB", color: [0.12, 0.3, 0.45] });
  c.s.rect(0, 720, 612, 50, { fill: [0.12, 0.3, 0.45] });
  c.s.text(c.name, M, 740, { size: 14, face: "sansB", color: WHITE });
  c.s.text("Customer care guide", R, 740, { size: 9, align: "right", color: [0.85, 0.9, 0.95] });
  let y = 672;
  const tips =
    kind === "fitness"
      ? [
          [
            "Wipe down after every use",
            "Sweat is corrosive. Clean touch points with a non-alcohol cleaner after each session.",
          ],
          [
            "Check belts monthly",
            "Treadmill belts should lift 2–3 inches at the midpoint. Adjust tension before it slips.",
          ],
          [
            "Lubricate on schedule",
            "Silicone the deck every three months or 150 hours, whichever comes first.",
          ],
        ]
      : [
          [
            "Change filters every 90 days",
            "A clogged filter makes the system work harder and raises energy bills by up to 15%.",
          ],
          [
            "Keep outdoor units clear",
            "Leave two feet of open space around condensers and clear leaves after storms.",
          ],
          [
            "Book a seasonal tune-up",
            "Spring and fall visits catch worn parts before they fail on the hottest or coldest day.",
          ],
        ];
  for (const [head, body] of tips) {
    c.s.text(head!, M, y, { size: 12, face: "sansB" });
    y = c.s.para(body!, M, y - 15, W, { size: 10, leading: 13 }) - 14;
  }
  c.s.text("Questions? Call (202) 555-0118 or write to care@example.com", M, y - 6, {
    size: 10,
    face: "sansB",
  });
  notes(c, y - 32);
  record(c);
  synthetic(c);
}
export function referenceLetter(c: Ctx) {
  c.s.text("Letter of Reference", M, 660, { size: 16, face: "serifB" });
  let y = 742;
  c.s.text("Tazmervale Chamber of Commerce", M, y, { size: 12, face: "serifB" });
  c.s.text("12 Civic Square, Tazmervale, ZZ 00000 · (202) 555-0124", M, y - 13, {
    size: 8.4,
    color: MUTED,
  });
  c.s.line(M, y - 20, R, y - 20, INK, 0.8);
  c.s.text(longDate(dateOf(c)), M, 700, { size: 9.5, face: "serif" });
  c.s.text("To whom it may concern:", M, 680, { size: 9.5, face: "serif" });
  y = notes(c, 632);
  y = c.s.para(
    "The person named above has been a member in good standing of the Chamber for six years and has served on its small business committee. We have found them reliable, prompt in meeting commitments and well regarded by other members. We are glad to recommend them for any business relationship.",
    M,
    y - 4,
    W,
    { size: 9.5, face: "serif", leading: 12.4 },
  );
  c.s.text("Sincerely,", M, y - 14, { size: 9.5, face: "serif" });
  c.s.text("/s/ e-signed", M + 4, y - 36, { size: 10, face: "serifI", color: [0.1, 0.18, 0.45] });
  c.s.text("Executive Director", M, y - 50, { size: 9, face: "serif" });
  record(c);
  synthetic(c);
}

/** Any type without a dedicated template still reads as an ordinary business document. */
export function generic(c: Ctx, title: string) {
  c.s.text(title, M, 700, { size: 16, face: "serifB" });
  c.s.text(c.name, M, 742, { size: 12, face: "serifB" });
  c.s.text(TARGET_ADDRESS, M, 729, { size: 8.4, color: MUTED });
  c.s.line(M, 721, R, 721, INK, 0.8);
  const y = c.s.para(
    `Prepared ${longDate(dateOf(c))} for the SBA 7(a) application of ${buyerName(c)} to ${lenderName(c)}.`,
    M,
    680,
    W,
    { size: 9.5, face: "serif", leading: 12.4 },
  );
  notes(c, y - 10);
  record(c);
  synthetic(c);
}
