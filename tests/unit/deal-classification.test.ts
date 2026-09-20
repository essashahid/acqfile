import fs from "node:fs";
import { it, expect } from "vitest";
import { deterministicSegments, assignParty, validateBoundaries } from "@/lib/deals/classification";
import { classifyFile } from "@/lib/deals/classifier";
import { parseArrival } from "@/lib/deals/parse";
import { CLASSIFIER_PROMPT } from "@/lib/deals/classifier-prompt";
import { plans } from "../../fixtures/lib/plans";
import { documents } from "../../fixtures/lib/truth";
const key = "SYNTHETIC-CLASSIFIER-TEST-HMAC-KEY-ONLY";
it("classifier prompt remains verbatim from the specification", () => {
  expect(CLASSIFIER_PROMPT).toBe(
    fs
      .readFileSync("docs/SPEC.md", "utf8")
      .split("**Classifier system prompt.**")[1]!
      .split("```text\n")[1]!
      .split("\n```")[0],
  );
});
it("signatures and mock fallbacks match all document metadata", async () => {
  const errors: string[] = [];
  const report = [];
  for (const p of plans()) {
    let deterministic = 0,
      classifier = 0;
    const truth = JSON.parse(
      fs.readFileSync(`fixtures/deals/${p.id}/truth/documents.json`, "utf8"),
    ) as ReturnType<typeof documents>;
    for (const doc of truth.filter((d) => d.segments.length)) {
      const bytes = fs.readFileSync(`fixtures/deals/${p.id}/${doc.file}`),
        parsed = await parseArrival(bytes, key);
      const signature = deterministicSegments(parsed);
      const result = signature ?? (await classifyFile(doc.hash!, parsed, bytes, "mock")).segments;
      validateBoundaries(result, parsed.pages);
      if (signature) deterministic += result.length;
      else classifier += result.length;
      for (const [i, s] of result.entries()) {
        if (signature) {
          expect(
            parsed.blocks.some((b) => b.page === s.quote_page && b.text.includes(s.quote)),
            `${doc.file}: quote page`,
          ).toBe(true);
          for (const evidence of s.evidence)
            expect(
              parsed.blocks.some(
                (b) => b.page === evidence.page && b.text.includes(evidence.quote),
              ),
              `${doc.file}: ${evidence.field} locator`,
            ).toBe(true);
        }
        const expected = doc.segments[i];
        if (!expected) {
          errors.push(`${p.id}/${doc.file}: extra segment`);
          continue;
        }
        for (const field of [
          "doc_type",
          "page_start",
          "page_end",
          "period",
          "signed",
          "dated",
        ] as const)
          if (s[field] !== expected[field])
            errors.push(`${p.id}/${doc.file}/${i}/${field}: ${s[field]} != ${expected[field]}`);
        const party = assignParty(
          s,
          parsed,
          p.parties.map((p) => ({
            id: p.id,
            legalName: p.legal_name,
            nameVariants: p.name_variants,
            identifierHmac: p.identifier?.hmac ?? null,
          })),
        );
        if (party.party_id !== (expected.party_id === "outside-party" ? null : expected.party_id))
          errors.push(`${p.id}/${doc.file}: wrong party ${party.party_id}`);
      }
      if (result.length !== doc.segments.length) errors.push(`${doc.file}: wrong count`);
    }
    report.push({ deal: p.id, deterministic, classifier });
  }
  expect(errors).toEqual([]);
  expect(report.every((r) => r.deterministic + r.classifier > 0)).toBe(true);
}, 60000);
it("identifier matches outrank names and duplicate names remain ambiguous", async () => {
  const { CandidateSchema } = await import("@/lib/deals/classification");
  const c = CandidateSchema.parse({
    page_start: 1,
    page_end: 1,
    doc_type: "SBA_413",
    alternatives: [],
    party_name: "Kiel McDermott",
    period: null,
    period_raw: null,
    form_revision: null,
    signed: null,
    dated: null,
    signature_date: null,
    document_date: null,
    expected_page_count: null,
    account_last_four: null,
    quote: "Name: Kiel McDermott",
    quote_page: 1,
    evidence: [],
    uncertain: false,
  });
  const parties = [
    {
      id: "a",
      legalName: "Kiel McDermott",
      nameVariants: [],
      identifierHmac: "a".repeat(64),
    },
    {
      id: "b",
      legalName: "Abe Welch",
      nameVariants: [],
      identifierHmac: "b".repeat(64),
    },
  ];
  const parsed = {
    status: "parsed" as const,
    kind: "pdf" as const,
    pages: 1,
    blocks: [],
    identifiers: [
      {
        kind: "ssn" as const,
        hmac: "b".repeat(64),
        last_four: "4567",
        page: 1,
      },
    ],
  };
  expect(assignParty(c, parsed, parties).party_id).toBe("b");
  expect(
    assignParty(
      c,
      { ...parsed, identifiers: [] },
      parties.map((p) => ({ ...p, legalName: "Kiel McDermott" })),
    ),
  ).toEqual({ party_id: null, assignment: "ambiguous" });
});

it("official AcroForm fields do not swallow a second document in a packet", () => {
  expect(
    deterministicSegments({
      status: "parsed",
      kind: "pdf",
      pages: 2,
      identifiers: [],
      blocks: [
        ...["applicantname", "busTIN", "ownName1"].map((name) => ({
          kind: "field" as const,
          name,
          page: 1,
          locator: name,
          text: "",
        })),
        { kind: "page", page: 1, locator: "page-1", text: "SBA Form 1919" },
        {
          kind: "page",
          page: 2,
          locator: "page-2",
          text: "Purchase Agreement",
        },
      ],
    }),
  ).toBeNull();
});
