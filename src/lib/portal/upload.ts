import { replaceSelected, isolateSubmission } from "./replacement";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { getDb, schema } from "@/lib/db/client";
import { intake } from "@/lib/deals/intake";
import { processDealRun } from "@/lib/deals/process";
import { sniff } from "@/lib/deals/zip";
import { labelFor } from "./copy";
import { portalData, ownTask, recordResponse, type PortalAccess } from "./service";
export async function photosPdf(photos: { name: string; bytes: Buffer }[]) {
  const pdf = await PDFDocument.create();
  for (const photo of photos) {
    const jpg = photo.bytes[0] === 255 && photo.bytes[1] === 216,
      png = photo.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpg && !png) throw Error("Please choose a JPG, a PNG or a PDF.");
    const image = jpg ? await pdf.embedJpg(photo.bytes) : await pdf.embedPng(photo.bytes);
    const page = pdf.addPage([612, 792]),
      scale = Math.min(572 / image.width, 752 / image.height);
    page.drawImage(image, {
      x: 20,
      y: 792 - 20 - image.height * scale,
      width: image.width * scale,
      height: image.height * scale,
    });
  }
  return Buffer.from(await pdf.save());
}
export async function startUpload(
  access: PortalAccess,
  taskKey: string,
  files: { name: string; bytes: Buffer }[],
  replace?: string,
  note = "",
) {
  const all = await portalData(access.deal.id),
    task = ownTask(all.mapped, access.party.id, taskKey);
  if (replace && !task.versions.includes(replace)) throw Error("Document not found");
  if (!files.length || files.length > 20 || files.some((f) => f.bytes.length > 10 * 1024 * 1024))
    throw Error("Please choose up to 20 files, each under 10 MB.");
  const images = files.filter((f) => /\.(jpe?g|png)$/i.test(f.name));
  if (files.some((f) => !images.includes(f) && !["pdf", "docx", "xlsx"].includes(sniff(f.bytes))))
    throw Error("Please choose a JPG, a PNG or a PDF.");
  if (images.length && images.length !== files.length)
    throw Error("Please send photos together, then add any other documents separately.");
  const uploads = images.length
    ? [{ path: "Phone photos.pdf", bytes: await photosPdf(images) }]
    : files.map((f) => ({ path: f.name.replaceAll("\\", "/").split("/").at(-1)!, bytes: f.bytes }));
  const result = await intake(access.ctx, access.deal.id, uploads);
  const response = await recordResponse(
    access.ctx,
    access.deal.id,
    access.party.id,
    taskKey,
    "upload",
    {
      versions: result.rows.map((r) => r.documentVersionId),
      runId: result.runId,
      duplicate: result.rows.some((r) => r.duplicate),
      photos: !!images.length,
      replace: replace ?? null,
      note,
    },
    access.link.id,
  );
  return {
    response,
    work: async () => {
      try {
        await processDealRun(access.ctx, access.deal.id, result.runId);
        const newVersions = result.rows.filter((r) => !r.duplicate).map((r) => r.documentVersionId);
        await isolateSubmission(access, task, newVersions);
        if (replace)
          await replaceSelected(
            access,
            replace,
            result.rows.map((r) => r.documentVersionId),
          );
      } catch {
        await recordResponse(
          access.ctx,
          access.deal.id,
          access.party.id,
          taskKey,
          "processing_delayed",
          { uploadId: response.id },
          access.link.id,
        );
      }
    },
  };
}
export async function uploadResult(access: PortalAccess, receipt: string) {
  const [response] = await getDb()
    .select()
    .from(schema.portalResponses)
    .where(
      and(
        eq(schema.portalResponses.id, receipt),
        eq(schema.portalResponses.dealId, access.deal.id),
        eq(schema.portalResponses.partyId, access.party.id),
        eq(schema.portalResponses.kind, "upload"),
      ),
    );
  if (!response) throw Error("Document not found");
  const all = await portalData(access.deal.id),
    task = ownTask(all.mapped, access.party.id, response.taskKey);
  const versions = all.data.versions.filter((v) =>
    (response.payload.versions as string[]).includes(v.id),
  );
  const segments = await getDb()
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.dealId, access.deal.id));
  const own = segments.filter((s) => versions.some((v) => v.id === s.documentVersionId));
  const filename = versions.map((v) => v.sourceFilename).join(", "),
    pages = versions.reduce((n, v) => n + (v.pageCount ?? 0), 0);
  const elapsed = Date.now() - response.createdAt.getTime();
  let notice = "",
    certain = true;
  const typed = own.filter((s) => s.classificationMethod === "signature");
  if (typed.length && !typed.some((s) => task.accepted.includes(s.docType)))
    notice = `This is a different document. Please send your ${labelFor(task.type).toLowerCase()}.`;
  else if (
    typed.some(
      (s) => task.accepted.includes(s.docType) && s.period && !task.periods.includes(s.period),
    )
  ) {
    const s = typed.find((s) => s.period && !task.periods.includes(s.period))!;
    notice = `This is your ${s.period} document. We still need ${task.periods.filter(Boolean).join(" and ")}.`;
  } else if (typed.some((s) => s.partyId && s.partyId !== access.party.id))
    notice = "This document names someone else. Is this the document you meant to send?";
  else if (
    typed.some((s) => s.signed === false || s.dated === false) &&
    task.rows.some((r) => r.checks.some((c) => c.type === "signed_and_dated"))
  )
    notice = "This copy needs a signature and a date.";
  else if (response.payload.duplicate)
    notice = "We already have this document. You can send another copy or ask us to take a look.";
  else if (versions.some((v) => v.parseStatus === "failed"))
    notice = "We couldn't open this document. Please send an unlocked, readable copy.";
  else if (
    task.state === "To do" &&
    typed.length > 0 &&
    task.rows.some(
      (r) =>
        r.segments.some((s) => versions.some((v) => v.id === s.versionId)) &&
        r.checks.some((c) => c.result === "fail" && /fresh|age/.test(c.type)),
    )
  )
    notice = "Please send a more recent copy of this document.";
  const slow = elapsed >= 20000,
    scan = response.payload.photos || own.some((s) => s.classificationMethod !== "signature");
  const failed = versions.some((v) => v.processingStatus === "failed");
  const complete = versions.every((v) =>
    ["completed", "completed_with_review"].includes(v.processingStatus),
  );
  if (response.payload.photos) notice = "";
  if (scan && !notice) certain = false;
  return {
    receipt: response.id,
    taskKey: task.key,
    title: task.title,
    filename,
    pages,
    notice,
    certain,
    state: notice ? "noticed" : scan || slow || failed || complete ? "review" : "checking",
  };
}
