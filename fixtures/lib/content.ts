import type { Doc, Plan } from "../plans/shared";
import { required } from "./doc";
import { workbookCells } from "./doc/office";
export { cue } from "./doc/quotes";
/** Text a rendered document must contain; also the scan plan hash input. */
export const content = (p: Plan, d: Doc) => required(p, d);
/** Cells a workbook sheet must contain, as the text the intake reads from them. */
export function sheetContent(p: Plan, d: Doc, name: string) {
  return workbookCells(p, d, name as "Income Statement" | "Balance Sheet")
    .flat()
    .filter((v) => v !== "" && v !== undefined)
    .map(String);
}
