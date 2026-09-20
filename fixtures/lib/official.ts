import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { officialForm } from "../../src/lib/config/official-form-fields";
import type { Doc, Plan } from "../plans/shared";
import { content } from "./content";
import { display } from "./truth";
export async function officialPdf(p: Plan, d: Doc) {
  const spec = officialForm(d.type);
  if (!spec) throw Error("Not an official type");
  const pdf = await PDFDocument.load(
    fs.readFileSync(path.join("fixtures/forms", spec.file)),
    { updateMetadata: false },
  );
  const form = pdf.getForm();
  const party = p.parties.find((p) => p.id === d.party);
  form.getTextField(spec.name).setText(String(party?.legal_name ?? ""));
  for (const [attribute, name] of Object.entries(spec.fields))
    if (d.facts[attribute] !== undefined)
      form.getTextField(name).setText(display(d.facts[attribute]));
  if ("owners" in spec) {
    const owners = d.facts["ownership.members"] as {
      name: string;
      percent: number;
      title?: string;
    }[];
    owners.forEach((o, i) => {
      form.getTextField(spec.owners.name + (i + 1)).setText(o.name);
      form
        .getTextField(spec.owners.percent + (i + 1))
        .setText(String(o.percent));
      if (o.title)
        form.getTextField(spec.owners.title + (i + 1)).setText(o.title);
    });
  }
  form
    .getTextField(spec.signatureDate)
    .setText(d.metadata.dated ? String(d.metadata.signature_date ?? "") : "");
  const signature = form.getField(spec.signature);
  for (const widget of signature.acroField.getWidgets()) {
    const page = pdf.getPages().find((pg) => pg.ref === widget.P());
    if (page && d.metadata.signed) {
      const r = widget.getRectangle();
      page.drawText("e-signed / SYNTHETIC-" + d.id, {
        x: r.x + 2,
        y: r.y + 5,
        size: 8,
      });
    }
  }
  form.updateFieldAppearances();
  pdf.setCreationDate(new Date("2026-09-15T12:00:00Z"));
  pdf.setModificationDate(new Date("2026-09-15T12:00:00Z"));
  pdf.setCreator("AcqFile synthetic fixtures");
  pdf.setProducer("AcqFile synthetic fixtures");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    page.drawRectangle({
      x: 12,
      y: page.getHeight() - 23,
      width: 180,
      height: 20,
      color: rgb(1, 1, 1),
    });
    page.drawText("SYNTHETIC", {
      x: 16,
      y: page.getHeight() - 19,
      size: 15,
      font,
      color: rgb(0.65, 0, 0),
    });
  }
  const page = pdf.addPage([612, 792]);
  let y = 758;
  for (const line of content(p, d)) {
    const size = Math.min(
      10,
      540 / Math.max(1, font.widthOfTextAtSize(line, 1)),
    );
    page.drawText(line, { x: 36, y, size, font });
    y -= 22;
  }
  page.drawText(
    `Synthetic evidence sheet attached to official SBA form | Page ${pdf.getPageCount()} of ${pdf.getPageCount()}`,
    { x: 36, y: 24, size: 9, font },
  );
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
export async function verifyOfficial(bytes: Buffer, d: Doc) {
  const spec = officialForm(d.type)!;
  const form = (await PDFDocument.load(bytes)).getForm();
  let count = 0;
  for (const [a, name] of Object.entries(spec.fields)) {
    if (d.facts[a] === undefined) continue;
    if (form.getTextField(name).getText() !== display(d.facts[a]))
      throw Error(`Official field mismatch ${d.id}/${a}`);
    count++;
  }
  if ("owners" in spec) {
    for (const [i, o] of (
      d.facts["ownership.members"] as { name: string; percent: number }[]
    ).entries()) {
      if (
        form.getTextField(spec.owners.name + (i + 1)).getText() !== o.name ||
        form.getTextField(spec.owners.percent + (i + 1)).getText() !==
          String(o.percent)
      )
        throw Error("Official owners mismatch");
      count += 2;
    }
  }
  return count;
}
