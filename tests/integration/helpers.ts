import { PDFDocument, StandardFonts } from "pdf-lib";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { seedWorkspace } from "@/lib/seed";

export const noSleep = async () => {};

export async function makePdf(lines: string[], pages = 1): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-01-01T00:00:00Z"));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([612, 792]);
    page.drawText(lines.join("\n"), { x: 50, y: 720, size: 11, font, lineHeight: 14 });
  }
  return Buffer.from(await pdf.save());
}

export async function seeded() {
  return seedWorkspace();
}

export async function stepsFor(runId: string) {
  return getDb().select().from(schema.runSteps).where(eq(schema.runSteps.processingRunId, runId));
}

export async function llmCallsFor(runId: string) {
  return getDb().select().from(schema.llmCalls).where(eq(schema.llmCalls.processingRunId, runId));
}

export async function runRow(runId: string) {
  const [r] = await getDb()
    .select()
    .from(schema.processingRuns)
    .where(eq(schema.processingRuns.id, runId))
    .limit(1);
  return r!;
}
