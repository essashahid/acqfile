import { inflateRawSync } from "node:zlib";
export const INTAKE_LIMITS = {
  files: 200,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
  archiveBytes: 40 * 1024 * 1024,
  pages: 100,
  ratio: 500,
};
export function safePath(value: string) {
  if (
    !value ||
    value.length > 500 ||
    /[\x00-\x1f\\]/.test(value) ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((p) => p === ".." || p === "." || !p)
  )
    throw Error("Unsafe arrival path");
  return value;
}
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Validate central and local headers before any inflation. No ZIP64, encryption or symlinks.
export function readZip(bytes: Buffer, office = false) {
  if (bytes.length > INTAKE_LIMITS.archiveBytes)
    throw Error("Archive too large");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("Invalid ZIP");
  const count = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16),
    size = bytes.readUInt32LE(end + 12);
  if (
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    count > (office ? 2000 : INTAKE_LIMITS.files) ||
    offset + size > end ||
    count === 65535
  )
    throw Error("Unsupported or oversized ZIP");
  const result: { path: string; bytes: Buffer }[] = [];
  const names = new Set<string>();
  let cursor = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw Error("Invalid ZIP directory");
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      crc = bytes.readUInt32LE(cursor + 16),
      compressed = bytes.readUInt32LE(cursor + 20),
      expanded = bytes.readUInt32LE(cursor + 24),
      n = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32),
      local = bytes.readUInt32LE(cursor + 42),
      mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    const name = bytes.subarray(cursor + 46, cursor + 46 + n).toString("utf8");
    cursor += 46 + n + extra + comment;
    const dir = name.endsWith("/");
    safePath(dir ? name.slice(0, -1) : name);
    if (
      names.has(name) ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      (mode & 0xf000) === 0xa000 ||
      expanded > INTAKE_LIMITS.fileBytes ||
      expanded / Math.max(1, compressed) > INTAKE_LIMITS.ratio
    )
      throw Error("Unsafe ZIP entry");
    names.add(name);
    total += expanded;
    if (total > INTAKE_LIMITS.totalBytes) throw Error("ZIP expansion limit");
    if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50)
      throw Error("Invalid ZIP local header");
    const ln = bytes.readUInt16LE(local + 26),
      le = bytes.readUInt16LE(local + 28);
    if (
      bytes.subarray(local + 30, local + 30 + ln).toString("utf8") !== name ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt16LE(local + 6) !== flags
    )
      throw Error("ZIP header mismatch");
    const start = local + 30 + ln + le;
    if (start + compressed > offset) throw Error("Invalid ZIP entry bounds");
    if (dir) continue;
    const packed = bytes.subarray(start, start + compressed);
    const data =
      method === 0
        ? Buffer.from(packed)
        : inflateRawSync(packed, { maxOutputLength: Math.max(1, expanded) });
    if (data.length !== expanded || crc32(data) !== crc)
      throw Error("ZIP integrity mismatch");
    if (!office && sniff(data) === "zip")
      throw Error("Nested archives are not accepted");
    result.push({ path: name, bytes: data });
  }
  if (cursor !== offset + size) throw Error("ZIP directory length mismatch");
  return result;
}
export type FileKind = "pdf" | "docx" | "xlsx" | "zip" | "unsupported";
export function sniff(bytes: Buffer): FileKind {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "pdf";
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) {
    const names = bytes.toString("latin1");
    if (
      names.includes("[Content_Types].xml") &&
      names.includes("word/document.xml")
    )
      return "docx";
    if (
      names.includes("[Content_Types].xml") &&
      names.includes("xl/workbook.xml")
    )
      return "xlsx";
    return "zip";
  }
  return "unsupported";
}
export function arrivalFiles(files: { path: string; bytes: Buffer }[]) {
  const result = files.flatMap((f) =>
    sniff(f.bytes) === "zip"
      ? readZip(f.bytes)
      : [{ ...f, path: safePath(f.path) }],
  );
  if (
    !result.length ||
    result.length > INTAKE_LIMITS.files ||
    result.some((f) => f.bytes.length > INTAKE_LIMITS.fileBytes) ||
    result.reduce((n, f) => n + f.bytes.length, 0) > INTAKE_LIMITS.totalBytes ||
    new Set(result.map((f) => f.path)).size !== result.length
  )
    throw Error("Arrival size, count or duplicate-path limit");
  return result;
}
