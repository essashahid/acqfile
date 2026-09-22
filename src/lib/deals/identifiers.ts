import { SAMPLE_HMAC_KEY } from "@/lib/config/sample";
import { maskIdentifier, scrubIdentifiers } from "@/lib/domain/evidence";
export function piiKey() {
  const configured = process.env.PII_HMAC_KEY;
  const sample = process.env.ACQFILE_SAMPLE_MODE === "true";
  if (
    (sample || configured === SAMPLE_HMAC_KEY) &&
    ["true", "1"].includes(process.env.REAL_DATA_MODE ?? "")
  )
    throw Error("The sample identifier key cannot be used with real data.");
  if (sample && configured && configured !== SAMPLE_HMAC_KEY)
    throw Error(
      "Sample identifier key mismatch. Remove PII_HMAC_KEY in the sample-only environment; do not replace real credentials.",
    );
  const key = sample ? SAMPLE_HMAC_KEY : configured;
  if (!key || key.length < 32)
    throw Error("Configure PII_HMAC_KEY with at least 32 characters before deal intake.");
  return key;
}
export type ReadIdentifier = {
  kind: "ssn" | "ein" | "account";
  hmac: string;
  last_four: string;
  page: number;
};
export function protectText(text: string, page: number, key: string) {
  const identifiers: ReadIdentifier[] = [];
  for (const m of text.matchAll(
    /\b\d{3}-\d{2}-\d{4}\b|\b\d{2}-\d{7}\b|\b(?:account(?: number)?|ssn|ein|tin)\s*[:#]?\s*([\d -]{8,22})\b/gi,
  )) {
    const clear = m[1]?.trim() ?? m[0];
    const digits = clear.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 17) continue;
    identifiers.push({
      ...maskIdentifier(clear, key),
      kind: /^\d{3}-|ssn/i.test(m[0]) ? "ssn" : /^\d{2}-|ein|tin/i.test(m[0]) ? "ein" : "account",
      page,
    });
    text = text.replace(
      m[0],
      m[1]
        ? m[0].replace(m[1], `[masked ••••${digits.slice(-4)}]`)
        : `[masked ••••${digits.slice(-4)}]`,
    );
  }
  return {
    text: scrubIdentifiers(text).replace(
      /\b(?:passport|driver.?s? licen[cs]e|identification|ID)\s*(?:number|no\.?|#)\s*[:#]?\s*[A-Z0-9-]{5,}/gi,
      "ID number [redacted]",
    ),
    identifiers,
  };
}
export function scrubPayload<T>(value: T): T {
  if (
    typeof value === "string" &&
    (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ||
      /^[a-f0-9]{64}$/i.test(value))
  )
    return value;
  if (typeof value === "string")
    return scrubIdentifiers(value).replace(
      /\b(?:passport|driver.?s? licen[cs]e|identification|ID)\s*(?:number|no\.?|#)\s*[:#]?\s*[A-Z0-9-]{5,}/gi,
      "ID number [redacted]",
    ) as T;
  if (Array.isArray(value)) return value.map(scrubPayload) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubPayload(v)])) as T;
  return value;
}

export function assertSampleKey() {
  if (piiKey() !== SAMPLE_HMAC_KEY)
    throw Error(
      "Sample identifier key mismatch. Set ACQFILE_SAMPLE_MODE=true in the shared sample seed/server environment and leave PII_HMAC_KEY unset.",
    );
}
