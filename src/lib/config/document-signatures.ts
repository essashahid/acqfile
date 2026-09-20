import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/registry";
export type Signature = {
  forms: string[];
  omb: string[];
  titles: string[];
  acroform: string[];
};
export const DOCUMENT_SIGNATURES = Object.fromEntries(
  DOCUMENT_TYPES.map((type) => [
    type,
    {
      forms: [],
      omb: [],
      titles: [type.toLowerCase().replaceAll("_", " ")],
      acroform: [],
    },
  ]),
) as unknown as Record<DocumentType, Signature>;
const set = (type: DocumentType, data: Partial<Signature>) =>
  Object.assign(DOCUMENT_SIGNATURES[type], data);
set("SBA_1919", {
  forms: ["SBA Form 1919"],
  omb: ["3245-0348"],
  titles: ["Borrower Information Form"],
  acroform: ["applicantname", "busTIN", "ownName1"],
});
set("SBA_413", {
  forms: ["SBA Form 413"],
  omb: ["3245-0188"],
  titles: ["Personal Financial Statement"],
  acroform: ["Cash on Hand & in banks", "TotalAssets", "TotalLiabilities"],
});
set("TAX_PERSONAL", {
  forms: ["Form 1040"],
  omb: ["1545-0074"],
  titles: ["U.S. Individual Income Tax Return"],
});
set("TAX_BUSINESS", {
  forms: ["Form 1120-S", "Form 1120", "Form 1065"],
  omb: ["1545-0123"],
  titles: ["U.S. Income Tax Return for an S Corporation"],
});
set("TAX_EXTENSION", {
  forms: ["Form 4868"],
  titles: ["Application for Extension of Time"],
});
set("IRS_4506C", {
  forms: ["Form 4506-C"],
  omb: ["1545-1872"],
  titles: ["IVES Request for Transcript of Tax Return"],
});
set("FIN_YEAR_END", {
  titles: ["Year-end Income Statement and Balance Sheet"],
});
set("FIN_INTERIM", { titles: ["Interim Income Statement and Balance Sheet"] });
set("BANK_STATEMENT", { titles: ["Monthly Account Statement"] });
set("GOV_ID", { titles: ["Government Photo Identification"] });
set("LOI", { titles: ["Letter of Intent"] });
set("SOURCES_USES", { titles: ["Sources and Uses of Funds"] });
set("LEASE", { titles: ["Commercial Premises Lease"] });
set("CREDIT_AUTH", { titles: ["Authorization to Obtain Credit Report"] });
set("FORMATION_DOC", { titles: ["Articles of Organization"] });
set("ADDBACK_SCHEDULE", { titles: ["Schedule of Add-backs"] });
set("GIFT_LETTER", { titles: ["Gift Letter"] });
