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
  },
} as const;
export type OfficialType = keyof typeof OFFICIAL_FORMS;
export function officialForm(type: string) {
  return OFFICIAL_FORMS[type as OfficialType];
}
// A final synthetic evidence sheet preserves literal quotes without altering official wording.
export const documentPages = (type: string, format: string) =>
  format === "xlsx" ? 2 : (officialForm(type)?.pages ?? 0) + 1;
