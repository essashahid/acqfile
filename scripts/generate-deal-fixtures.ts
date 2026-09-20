import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { plans } from "../fixtures/lib/plans";
import { groups, writeTruth, json } from "../fixtures/lib/truth";
import { textPdf, protectedPdf, docx, xlsx, rasterPdf, FIXED_DATE } from "../fixtures/lib/render";
import { documentPages } from "../src/lib/config/official-form-fields";
import { content } from "../fixtures/lib/content";
import { hashObject } from "../src/lib/hash";
import type { Doc, Plan } from "../fixtures/plans/shared";
export type Entry = {
  path: string;
  sha256: string;
  bytes: number;
  pages: number;
  format: string;
  batch: number;
  planted_items: number[];
  plan_hash: string;
};
export type Manifest = {
  deal: string;
  as_of: string;
  files: Entry[];
  archives: { path: string; sha256: string; bytes: number }[];
  truth: { path: string; sha256: string; bytes: number }[];
};
export const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const fileList = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? fileList(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    .sort();
async function generate(p: Plan, root: string, rebuild: boolean) {
  const dest = path.join(root, p.id);
  fs.mkdirSync(dest, { recursive: true });
  const committed = path.join("fixtures/deals", p.id);
  const manifestFile = path.join(committed, "manifest.json");
  const prior: Manifest | undefined = fs.existsSync(manifestFile)
    ? JSON.parse(fs.readFileSync(manifestFile, "utf8"))
    : undefined;
  const files: Entry[] = [];
  const buffers = new Map<string, Buffer>();
  const metadata = new Map<string, { hash: string; bytes: number; pages: number }>();
  const grouped = groups(p);
  async function render(file: string, docs: Doc[]): Promise<Buffer> {
    const d = docs[0]!;
    if (buffers.has(file)) return buffers.get(file)!;
    let bytes: Buffer;
    if (d.duplicate_of) {
      const original = p.documents.find((x) => x.id === d.duplicate_of)!;
      const g = grouped.find((g) => g.file === original.path)!;
      bytes = await render(g.file, g.docs);
    } else if (d.format === "scan_pdf" && !rebuild) {
      const previous = prior?.files.find((f) => f.path === file);
      assert.ok(previous, "No canonical scan; initialize with --rebuild-scans");
      assert.equal(
        previous.plan_hash,
        hashObject({
          documents: docs,
          content: docs.map((d) => content(p, d)),
          raster_layout_version: 4,
        }),
        "Scan plan changed: use --rebuild-scans",
      );
      bytes = fs.readFileSync(path.join(committed, file));
      assert.equal(sha(bytes), previous.sha256, "Canonical scan hash mismatch");
    } else
      switch (d.format) {
        case "text_pdf":
        case "bundle_pdf":
          bytes = await textPdf(p, docs);
          break;
        case "acroform_pdf":
          bytes = await textPdf(p, docs, true);
          break;
        case "protected_pdf":
          bytes = await protectedPdf(p, docs);
          break;
        case "scan_pdf":
          bytes = await rasterPdf(p, docs);
          break;
        case "docx":
          bytes = await docx(p, docs);
          break;
        case "xlsx":
          bytes = await xlsx(p, docs);
          break;
      }
    buffers.set(file, bytes);
    return bytes;
  }
  for (const { file, docs } of grouped) {
    const d = docs[0]!;
    const bytes = await render(file, docs);
    const original = d.duplicate_of ? p.documents.find((x) => x.id === d.duplicate_of) : undefined;
    const pages = (original ? grouped.find((g) => g.file === original.path)!.docs : docs).reduce(
      (n, d) => n + documentPages(d.type, d.format),
      0,
    );
    const entry: Entry = {
      path: file,
      sha256: sha(bytes),
      bytes: bytes.length,
      pages,
      format: d.format,
      batch: d.batch,
      planted_items: [...new Set(docs.flatMap((d) => d.tags))].sort((a, b) => a - b),
      plan_hash: hashObject({
        documents: docs,
        content: docs.map((d) => content(p, d)),
        raster_layout_version: 4,
      }),
    };
    files.push(entry);
    const target = path.join(dest, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    metadata.set(file, { hash: entry.sha256, bytes: entry.bytes, pages });
  }
  const archives: Manifest["archives"] = [];
  for (const b of p.batches) {
    const zip = new JSZip();
    for (const f of files
      .filter((f) => f.batch === b.batch)
      .sort(
        (a, b) =>
          Number(!!p.documents.find((d) => d.path === a.path)?.duplicate_of) -
          Number(!!p.documents.find((d) => d.path === b.path)?.duplicate_of),
      )) {
      zip.file(f.path.replace(`incoming/batch-${b.batch}/`, ""), buffers.get(f.path)!, {
        date: FIXED_DATE,
        createFolders: false,
      });
    }
    const bytes = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "UNIX",
    });
    const file = `batch-${b.batch}.zip`;
    fs.writeFileSync(path.join(dest, file), bytes);
    archives.push({ path: file, sha256: sha(bytes), bytes: bytes.length });
  }
  writeTruth(p, root, metadata);
  const truth = fileList(path.join(dest, "truth")).map((file) => {
    const b = fs.readFileSync(file);
    return { path: path.relative(dest, file), sha256: sha(b), bytes: b.length };
  });
  const manifest: Manifest = { deal: p.id, as_of: p.as_of, files, archives, truth };
  fs.writeFileSync(path.join(dest, "manifest.json"), json(manifest));
  return manifest;
}
async function main() {
  const check = process.argv.includes("--check"),
    rebuild = process.argv.includes("--rebuild-scans");
  assert.ok(!(check && rebuild), "--check does not rewrite canonical scans");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "acqfile-deals-"));
  try {
    for (const p of plans()) {
      const manifest = await generate(p, temp, rebuild);
      const committed = path.join("fixtures/deals", p.id);
      if (check) {
        const saved = JSON.parse(fs.readFileSync(path.join(committed, "manifest.json"), "utf8"));
        assert.deepEqual(manifest, saved, `${p.id}: manifest differs`);
        for (const f of [...manifest.files, ...manifest.archives, ...manifest.truth])
          assert.equal(
            sha(fs.readFileSync(path.join(committed, f.path))),
            f.sha256,
            `${p.id}/${f.path}: committed bytes differ`,
          );
        assert.deepEqual(
          fileList(path.join(temp, p.id)).map((f) => path.relative(path.join(temp, p.id), f)),
          fileList(committed).map((f) => path.relative(committed, f)),
          `${p.id}: extra/missing files`,
        );
      } else {
        fs.rmSync(committed, { recursive: true, force: true });
        fs.cpSync(path.join(temp, p.id), committed, { recursive: true });
      }
      console.log(
        `PASS ${check ? "checked" : "generated"} ${p.id}: ${manifest.files.length} files, ${manifest.archives.length} batches`,
      );
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
