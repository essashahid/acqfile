import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
} from "pdf-lib";
import { PASSWORD } from "../../fixtures/lib/render";
import { FIXTURE_PRODUCER } from "../../fixtures/lib/producer";

const FORMER = /acq\s*file/i;
const FIELDS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"] as const;

const walk = (p: string): string[] =>
  fs.statSync(p).isDirectory()
    ? fs
        .readdirSync(p)
        .flatMap((f) => walk(path.join(p, f)))
        .sort()
    : [p];
/** Every generated PDF that is actually encrypted, found from the bytes, not the manifests. */
const encrypted = walk("fixtures").filter(
  (f) => /\.pdf$/i.test(f) && /\/Encrypt\s/.test(fs.readFileSync(f).toString("latin1")),
);

const open = async (file: string, password?: string) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    ...(password ? { password } : {}),
    verbosity: 0,
  }).promise;
};

/**
 * An independent reading of the same files: the PDF standard security handler (RC4, revision 3)
 * implemented here, so every encrypted string and the XMP packet are checked without relying on
 * a PDF library's decryption. Returns the decrypted Info fields and XMP packet.
 */
async function decryptStandard(file: string) {
  const PAD = Buffer.from(
    "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a",
    "hex",
  );
  const rc4 = (key: Buffer, data: Buffer) => {
    const s = [...Array(256).keys()];
    for (let i = 0, j = 0; i < 256; i++) {
      j = (j + s[i]! + key[i % key.length]!) & 255;
      [s[i], s[j]] = [s[j]!, s[i]!];
    }
    const out = Buffer.alloc(data.length);
    for (let k = 0, i = 0, j = 0; k < data.length; k++) {
      i = (i + 1) & 255;
      j = (j + s[i]!) & 255;
      [s[i], s[j]] = [s[j]!, s[i]!];
      out[k] = data[k]! ^ s[(s[i]! + s[j]!) & 255]!;
    }
    return out;
  };
  const md5 = (...b: Buffer[]) => crypto.createHash("md5").update(Buffer.concat(b)).digest();
  const raw = (v: unknown) => Buffer.from((v as PDFString | PDFHexString).asBytes());
  const doc = await PDFDocument.load(fs.readFileSync(file), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const enc = doc.context.lookup(doc.context.trailerInfo.Encrypt) as PDFDict;
  const [V, R] = ["V", "R"].map((k) => Number(enc.get(PDFName.of(k))!.toString()));
  expect([V, R], `${file} encryption`).toEqual([2, 3]);
  const P = Buffer.alloc(4);
  P.writeInt32LE(Number(enc.get(PDFName.of("P"))!.toString()));
  const id = raw((doc.context.trailerInfo.ID as PDFArray).get(0));
  const password = Buffer.concat([Buffer.from(PASSWORD, "latin1"), PAD]).subarray(0, 32);
  let key = md5(password, raw(enc.get(PDFName.of("O"))), P, id);
  for (let i = 0; i < 50; i++) key = md5(key);
  key = key.subarray(0, 16);
  // Algorithm 5: the password is right only if it reproduces /U.
  let u = rc4(key, md5(PAD, id));
  for (let i = 1; i <= 19; i++) u = rc4(Buffer.from(key.map((b) => b ^ i)), u);
  expect(u.equals(raw(enc.get(PDFName.of("U"))).subarray(0, 16)), `${file} /U`).toBe(true);
  const objectKey = (ref: PDFRef) => {
    const b = Buffer.alloc(5);
    b.writeUIntLE(ref.objectNumber, 0, 3);
    b.writeUIntLE(ref.generationNumber, 3, 2);
    return md5(key, b).subarray(0, 16);
  };
  const infoRef = doc.context.trailerInfo.Info as PDFRef;
  const info: Record<string, string> = {};
  for (const [name, value] of (doc.context.lookup(infoRef) as PDFDict).entries()) {
    const ref = value instanceof PDFRef ? value : infoRef;
    const string = doc.context.lookup(value);
    if (!(string instanceof PDFString || string instanceof PDFHexString)) continue;
    const text = rc4(objectKey(ref), raw(string));
    info[name.asString().slice(1)] =
      text[0] === 0xfe && text[1] === 0xff
        ? Buffer.from(text.subarray(2)).swap16().toString("utf16le")
        : text.toString("latin1");
  }
  const metadataRef = doc.catalog.get(PDFName.of("Metadata"));
  const xmp =
    metadataRef instanceof PDFRef
      ? rc4(
          objectKey(metadataRef),
          Buffer.from((doc.context.lookup(metadataRef) as PDFRawStream).contents),
        ).toString("utf8")
      : null;
  return { info, xmp };
}

describe("password-protected fixtures, read from the generated files", () => {
  it("the corpus contains encrypted PDFs, and they need the password", async () => {
    expect(encrypted.length).toBeGreaterThanOrEqual(2);
    for (const file of encrypted)
      await expect(open(file), file).rejects.toMatchObject({ name: "PasswordException" });
  });

  it("decrypted document information names the neutral generator, never the former product", async () => {
    for (const file of encrypted) {
      const doc = await open(file, PASSWORD);
      const { info, metadata } = await doc.getMetadata();
      const fields = info as Record<string, unknown>;
      for (const field of FIELDS) {
        const value = fields[field];
        if (value === undefined) continue;
        expect(String(value), `${file} ${field}`).not.toMatch(FORMER);
      }
      expect(fields.Author, file).toBe(FIXTURE_PRODUCER);
      expect(String(fields.Title), file).toMatch(/^Synthetic /);
      // XMP, when present, is decrypted too.
      if (metadata) expect(String(metadata.getRaw()), file).not.toMatch(FORMER);
      for (let page = 1; page <= doc.numPages; page++) {
        const text = (await (await doc.getPage(page)).getTextContent()).items
          .map((i) => ("str" in i ? i.str : ""))
          .join(" ");
        expect(text, `${file} page ${page}`).not.toMatch(FORMER);
      }
      await doc.cleanup();
    }
  });

  it("an independent decryption of every string and the XMP packet agrees", async () => {
    for (const file of encrypted) {
      const { info, xmp } = await decryptStandard(file);
      expect(Object.keys(info).sort(), file).toEqual(
        ["Author", "CreationDate", "Creator", "Keywords", "ModDate", "Producer", "Title"].sort(),
      );
      for (const [field, value] of Object.entries(info))
        expect(value, `${file} ${field}`).not.toMatch(FORMER);
      expect(info.Author).toBe(FIXTURE_PRODUCER);
      expect(xmp, `${file} XMP`).toMatch(/^<\?xpacket begin=/);
      expect(xmp).toContain(FIXTURE_PRODUCER);
      expect(xmp).not.toMatch(FORMER);
    }
  });
});
