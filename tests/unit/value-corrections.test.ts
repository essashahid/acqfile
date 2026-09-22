import { afterEach, expect, it, vi } from "vitest";
import { parseNumber, parseDate, parseBoolean } from "@/lib/extract/parse-value";
import { readAcroform } from "@/lib/extract/acroform";
import { decodeModelValue } from "@/lib/extract/values";
import { validateCandidates } from "@/lib/extract/validate";
import { metadata } from "@/lib/deals/classification";
import { FACTS } from "@/lib/domain/registry";
import type { Parsed } from "@/lib/deals/parse";
import { piiKey, assertSampleKey, protectText } from "@/lib/deals/identifiers";
import { SAMPLE_HMAC_KEY } from "@/lib/config/sample";
it.each([
  ["0", 0],
  ["$0.00", 0],
  ["N/A", null],
  ["n/a", null],
  ["", null],
  ["   ", null],
  ["—", null],
  ["$25,000.50", 25000.5],
  ["($25,000)", -25000],
  ["-25,000", -25000],
  ["25,00", null],
  ["12O,000", null],
  ["1.234,56", null],
])("parses %s without guessing", (raw, expected) => {
  expect(parseNumber(raw)).toBe(expected);
  expect(decodeModelValue(FACTS["pfs.cash"]!, raw).value).toBe(expected);
  const parsed: Parsed = {
    status: "parsed",
    kind: "pdf",
    pages: 6,
    identifiers: [],
    blocks: [
      { kind: "field", page: 2, locator: "cash", name: "Cash on Hand & in banks", text: raw },
    ],
  };
  const candidates = readAcroform(parsed, "SBA_413", 1, 6, [FACTS["pfs.cash"]!]);
  expect(candidates?.[0]?.value ?? null).toBe(expected);
  if (candidates?.length) {
    expect(candidates[0]!.raw).toBe(raw.trim());
    if (expected === null)
      expect(validateCandidates(candidates, parsed.blocks, 1, 6)[0]!.score).toBe(0);
  }
});
it.each([
  ["2026-09-20", "2026-09-20"],
  ["09/20/2026", "2026-09-20"],
  ["02/30/2026", null],
  ["2026-02-30", null],
  ["02/29/2024", "2024-02-29"],
  ["20/09/2026", null],
  ["09/20/26", null],
])("checks calendar date %s", (raw, expected) => expect(parseDate(raw)).toBe(expected));
it("keeps unknown booleans and missing ownership percentages unknown", () => {
  expect(parseBoolean("perhaps")).toBeNull();
  expect(parseBoolean("no")).toBe(false);
  const parsed: Parsed = {
    status: "parsed",
    kind: "pdf",
    pages: 7,
    identifiers: [],
    blocks: [{ kind: "field", page: 1, locator: "owner", name: "ownName1", text: "Sample Owner" }],
  };
  const result = readAcroform(parsed, "SBA_1919", 1, 7, [FACTS["ownership.members"]!])!;
  expect(result[0]!.value).toEqual([{ name: "Sample Owner", percent: null }]);
  expect(validateCandidates(result, parsed.blocks, 1, 7)[0]!.score).toBe(0);
});
it("form recognition does not establish a missing signature; a date may use US format", () => {
  const parsed: Parsed = {
    status: "parsed",
    kind: "pdf",
    pages: 7,
    identifiers: [],
    blocks: [{ kind: "field", page: 4, locator: "date", name: "sigDate", text: "09/20/2026" }],
  };
  const result = metadata(parsed, 1, 7, "SBA_1919");
  expect(result.signed).toBeNull();
  expect(result.dated).toBe(true);
  expect(result.signature_date).toBe("2026-09-20");
  parsed.blocks.push({
    kind: "page",
    page: 4,
    locator: "page-4",
    text: "Signature: _____; Date: _____",
  });
  expect(metadata(parsed, 1, 7, "SBA_1919").signed).toBe(false);
});
afterEach(() => vi.unstubAllEnvs());
it("sample seed and subsequent intake share the same key, and reject mismatches and real data", () => {
  vi.stubEnv("REAL_DATA_MODE", "false");
  vi.stubEnv("ACQFILE_SAMPLE_MODE", "true");
  vi.stubEnv("PII_HMAC_KEY", "");
  assertSampleKey();
  expect(protectText("EIN: 00-1234567", 1, piiKey()).identifiers).toEqual(
    protectText("EIN: 00-1234567", 1, SAMPLE_HMAC_KEY).identifiers,
  );
  vi.stubEnv("PII_HMAC_KEY", "a-different-key-that-is-long-enough-for-intake");
  expect(piiKey).toThrow("mismatch");
  vi.stubEnv("PII_HMAC_KEY", "");
  vi.stubEnv("REAL_DATA_MODE", "true");
  expect(piiKey).toThrow("real data");
});
