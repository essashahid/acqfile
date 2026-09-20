import { officialForm } from "@/lib/config/official-form-fields";
import type { Parsed } from "@/lib/deals/parse";
import type { DocumentType, FactDefinition } from "@/lib/domain/registry";
import type { Candidate } from "./candidate";
/** A39 acroform: read mapped fields from the parsed widget blocks. No model call. */
export function readAcroform(parsed: Parsed, docType: DocumentType, pageStart: number, pageEnd: number, fields: FactDefinition[]): Candidate[] | null {
  const spec = officialForm(docType);
  if (!spec) return null;
  const blocks = parsed.blocks.filter((b) => b.kind === "field" && b.page >= pageStart && b.page <= pageEnd);
  // A rasterized official form has no widgets: it is read by vision, not by mapping.
  if (!blocks.some((b) => b.text)) return null;
  const field = (name: string) => blocks.find((b) => b.name === name);
  const out: Candidate[] = [];
  for (const def of fields) {
    if (def.attribute === "ownership.members" && "owners" in spec) {
      const owners = [];
      const cited: string[] = [];
      let page: number | null = null;
      for (let i = 1; i <= spec.owners.count; i++) {
        const name = field(spec.owners.name + i), percent = field(spec.owners.percent + i), title = field(spec.owners.title + i);
        if (!name?.text) continue;
        owners.push({ name: name.text, percent: Number(percent?.text ?? ""), ...(title?.text ? { title: title.text } : {}) });
        cited.push(name.locator, ...(percent ? [percent.locator] : []));
        page ??= name.page;
      }
      // The quote is verbatim from the first cited widget; the table value carries every row.
      if (owners.length) out.push({ attribute: def.attribute, method: "acroform", value: owners, raw: JSON.stringify(owners), source_block_ids: cited, quote: owners[0]!.name, region: null, ambiguity: null, page, mapped: true });
      continue;
    }
    const name = (spec.fields as Record<string, string>)[def.attribute];
    if (!name) continue;
    const block = field(name);
    if (!block?.text) continue;
    const text = block.text.trim();
    let value: unknown = text;
    if (def.value_type === "money" || def.value_type === "number") value = Number(text.replace(/[^0-9.-]/g, ""));
    if (def.value_type === "boolean") value = /^(yes|true|x)$/i.test(text);
    if (def.value_type === "identifier") {
      const lastFour = /(\d{4})\]?$/.exec(text)?.[1];
      const read = parsed.identifiers.find((i) => i.page === block.page && i.last_four === lastFour && i.kind !== "account");
      value = read ? { hmac: read.hmac, last_four: read.last_four } : lastFour ? { last_four: lastFour } : null;
      if (!value) continue;
    }
    out.push({ attribute: def.attribute, method: "acroform", value, raw: text, source_block_ids: [block.locator], quote: text, region: null, ambiguity: null, page: block.page, mapped: true });
  }
  return out;
}
