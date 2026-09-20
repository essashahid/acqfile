// Official SBA AcroForm names. Shared by fixture filling and runtime metadata parsing.
export const OFFICIAL_FORMS = {
  SBA_1919: {
    file: "sba-1919-official-blank.pdf",
    pages: 7,
    signature: "repSig",
    signatureDate: "sigDate",
    name: "applicantname",
    fields: {
      "party.legal_name": "applicantname",
      "party.identifier": "busTIN",
      "party.address": "busAddr",
    },
    // Widget page of every mapped field on the cached blank; verified by the fixture proof.
    fieldPages: {
      applicantname: 1,
      busTIN: 1,
      busAddr: 1,
      ownName1: 1,
      repSig: 4,
      sigDate: 4,
    },
    revision: "02/2025",
    owners: {
      name: "ownName",
      percent: "ownPerc",
      title: "ownTitle",
      identifier: "ownTin",
      count: 5,
    },
  },
  SBA_413: {
    file: "sba-413-official-blank.pdf",
    pages: 6,
    signature: "Signature",
    signatureDate: "Date",
    name: "Name",
    fields: {
      "party.legal_name": "Name",
      "pfs.as_of_date": "This information is current as of month/day/year",
      "pfs.cash": "Cash on Hand & in banks",
      "pfs.total_assets": "TotalAssets",
      "pfs.total_liabilities": "TotalLiabilities",
      "pfs.net_worth": "Net Worth",
    },
    fieldPages: {
      Name: 2,
      "This information is current as of month/day/year": 2,
      "Cash on Hand & in banks": 2,
      TotalAssets: 2,
      TotalLiabilities: 2,
      "Net Worth": 2,
      Signature: 4,
      Date: 4,
    },
    documentDate: "This information is current as of month/day/year",
  },
} as const;
export type OfficialType = keyof typeof OFFICIAL_FORMS;
export function officialForm(type: string) {
  return OFFICIAL_FORMS[type as OfficialType];
}
/** AcroForm field that carries an attribute; ownership rows start at the first owner name field. */
export function officialFieldName(type: string, attribute: string) {
  const spec = officialForm(type);
  if (!spec) return null;
  if (attribute === "ownership.members")
    return "owners" in spec ? spec.owners.name + "1" : null;
  return (spec.fields as Record<string, string>)[attribute] ?? null;
}
export function officialFieldPage(type: string, field: string) {
  const spec = officialForm(type);
  const page = spec
    ? (spec.fieldPages as Record<string, number>)[field]
    : undefined;
  if (!page) throw Error(`Unknown official field page ${type}/${field}`);
  return page;
}
// A36: official forms have no appended sheet; an ordinary document is one page, a workbook two sheets.
export const documentPages = (type: string, format: string) =>
  format === "xlsx" ? 2 : (officialForm(type)?.pages ?? 1);
