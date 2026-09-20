import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { maskIdentifier } from "@/lib/domain/evidence";
import { protectText, type ReadIdentifier } from "./identifiers";
import { INTAKE_LIMITS, readZip, sniff, type FileKind } from "./zip";
export type Source = {
  page: number;
  locator: string;
  text: string;
  kind: "page" | "paragraph" | "cell" | "field";
  name?: string;
  image_only?: boolean;
};
export type Parsed = {
  status: "parsed" | "unreadable";
  kind: FileKind;
  pages: number;
  blocks: Source[];
  identifiers: ReadIdentifier[];
  reason?: string;
};
export async function parseArrival(bytes: Buffer, key: string): Promise<Parsed> {
  const kind = sniff(bytes),
    blocks: Source[] = [],
    identifiers: ReadIdentifier[] = [],
    forbiddenValues: string[] = [];
  let pages = 0;
  const add = (b: Source) => {
    const safe = protectText(b.text, b.page, key);
    if (
      b.kind === "field" &&
      /passport|driver.?s?licen[cs]e|identification|^id(?:number|no)?$/i.test(
        (b.name ?? "").replace(/[ _-]/g, ""),
      )
    ) {
      if (b.text) forbiddenValues.push(b.text);
      safe.text = b.text ? "[redacted]" : "";
    }
    if (
      b.kind === "field" &&
      /ssn|social.?security|tin|ein|account/i.test(b.name ?? "") &&
      /^\d[\d -]{7,20}$/.test(b.text.trim())
    ) {
      const digits = b.text.replace(/\D/g, "");
      if (digits.length >= 8 && digits.length <= 17)
        identifiers.push({
          ...maskIdentifier(digits, key),
          kind: /account/i.test(b.name ?? "")
            ? "account"
            : /social|ssn/i.test(b.name ?? "")
              ? "ssn"
              : "ein",
          page: b.page,
        });
    }
    blocks.push({ ...b, text: safe.text });
    identifiers.push(...safe.identifiers);
  };
  try {
    if (kind === "pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        verbosity: 0,
        useSystemFonts: true,
      });
      try {
        const doc = await task.promise;
        pages = doc.numPages;
        if (pages > INTAKE_LIMITS.pages) throw Error("Page limit");
        for (let page = 1; page <= pages; page++) {
          const content = await (await doc.getPage(page)).getTextContent();
          let text = "",
            lastY: number | undefined;
          for (const item of content.items) {
            if (!("str" in item)) continue;
            const y = item.transform[5];
            if (lastY !== undefined && Math.abs(y - lastY) > 2) text += "\n";
            text += item.str + (item.hasEOL ? "\n" : " ");
            lastY = y;
          }
          add({
            page,
            locator: `page-${page}`,
            text,
            kind: "page",
            image_only: text.trim().length < 100,
          });
        }
      } finally {
        await task.destroy();
      }
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      for (const field of doc.getForm().getFields()) {
        const text =
          field instanceof PDFTextField
            ? (field.getText() ?? "")
            : field instanceof PDFCheckBox
              ? String(field.isChecked())
              : "";
        for (const [widgetIndex, widget] of field.acroField.getWidgets().entries()) {
          const index = doc.getPages().findIndex((p) => p.ref === widget.P());
          add({
            page: index < 0 ? 1 : index + 1,
            locator: `field:${field.getName()}:${widgetIndex}`,
            name: field.getName(),
            text,
            kind: "field",
          });
        }
      }
    } else if (kind === "docx") {
      readZip(bytes, true);
      const raw = await mammoth.extractRawText({ buffer: bytes });
      pages = 1;
      raw.value
        .split(/\n\s*\n/)
        .filter(Boolean)
        .forEach((text, i) =>
          add({
            page: 1,
            locator: `paragraph-${i + 1}`,
            text,
            kind: "paragraph",
          }),
        );
    } else if (kind === "xlsx") {
      readZip(bytes, true);
      const book = XLSX.read(bytes, { type: "buffer", cellFormula: false });
      pages = book.SheetNames.length;
      if (pages > INTAKE_LIMITS.pages) throw Error("Sheet limit");
      for (const [i, name] of book.SheetNames.entries()) {
        const sheet = book.Sheets[name]!;
        for (const [cell, value] of Object.entries(sheet)) {
          if (cell.startsWith("!")) continue;
          add({
            page: i + 1,
            locator: `${name}!${cell}`,
            name,
            text: String(value.v ?? ""),
            kind: "cell",
          });
        }
      }
    } else throw Error("Unsupported format");
    if (!blocks.length) throw Error("Empty document");
    for (const value of forbiddenValues)
      for (const block of blocks) block.text = block.text.replaceAll(value, "[redacted]");
    return { status: "parsed", kind, pages, blocks, identifiers };
  } catch {
    return {
      status: "unreadable",
      kind,
      pages: 0,
      blocks: [],
      identifiers: [],
      reason: "File could not be opened safely. Manual filing is available.",
    };
  }
}
