# Phase 2 proof — PASS

Date: 2026-09-19. Accepted Phase 1: `9ae628a`. Step A committed as `b505aeb` before any incoming deal files were rendered. This report accompanies the separate Phase 2 Step B commit. No Phase 3 work, live model call, paid service or deal-database loading was performed.

GitHub REST reports `essashahid/acqfile` **public**. Visibility was not changed. Remote is exclusively `https://github.com/essashahid/acqfile.git`.

## Files and batches

Counts exclude truth JSON, manifests and batch archives. All nine required format/arrival behaviors are represented: text, AcroForm, DOCX, XLSX, image-only, bundle, protected, exact duplicate and corrected version.

| Deal | Text PDF | AcroForm PDF | Text bundle PDF | Image-only PDF (including bundles) | Protected PDF | DOCX | XLSX | Total | Pages / sheet-pages | Batch ZIPs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A — Varnholt Climate Services | 10 | 5 | 22 | 0 | 1 | 1 | 1 | 40 | 69 | 2 |
| B — Quenby Grounds Management | 16 | 2 | 8 | 0 | 0 | 1 | 1 | 28 | 40 | 1 |
| C — Ostrelyva Fitness / Ostrelyva | 0 | 1 | 0 | 18 | 1 | 1 | 1 | 22 | 43 | 1 |

A has 37 initial files and exactly three batch-2 files: the 2024 personal return, the indirect owner's citizenship evidence and the corrected signed/dated 1919. B and C have one batch each. Every archive reproduces the nested incoming folder bytes exactly. Mixed-case extensions, forwarded packet names, a misleading tax-year filename and `Phone/scan0007.pdf` are present.

## Oracle and independence

Plans, clean models, document declarations, planted items and all expected statuses/findings are authored under `fixtures/plans`. `fixtures/lib/truth.ts` expands that data and never calls an evaluator, document parser or model. The checker reads the saved `engine_input.json`, verifies it against the plan and uses the resolved pack/overlay. Segments, facts and inputs validate against the real domain schemas. Every batch inventory contains exactly its current evidence; superseded, duplicate and unreadable files add no current evidence.

The exact comparison contract is every checklist identity/scope/period/status and every finding identity/scope/period/type/severity/stable key. Engine diagnostic wording and presentation order are deliberately outside this contract. Referenced fact locators are separately checked against the authored evidence. No result is copied from evaluation into truth.

| Deal / batch | Checklist rows | Findings | Result | Result hash |
| --- | ---: | ---: | --- | --- |
| deal-a / 1 | 78 | 20 | PASS | `f552a79592c7066ad1e6fbc1125a65800ff4e173dc9693db62e9d389baff6e27` |
| deal-a / 2 | 78 | 17 | PASS | `cb89f9e76a79e077880787b6e097113235301d8fb10b5f4a1964455883ec5c2c` |
| deal-b / 1 | 76 | 3 | PASS | `d6bb8bd21f9e42ea8165a678447d8d4c21541bc7df6fa52c2ed0acd0ee5929ec` |
| deal-c / 1 | 63 | 4 | PASS | `4539227cc916b2f5f63472e51c7f367053fdb5263c5114b97b8df0896069740a` |

All rule-level plants are found, all three traps produce zero attributed findings, and there are zero false-satisfied rows. A batch 2 resolves exactly `GUA-02 / alex / 2024`, `ENT-01 / buyer`, and `GUA-05 / bea`; it creates no new finding. C's item 25 is `received_with_issues` with an info finding, while its absent 2024 return remains `needs_review` under the existing unknown-dominance rule.

Every mismatch and attribution is recorded in [the oracle log](phase-2-oracle-log.md):

1. **Engine wrong:** ownership-derived personal guarantor rows expanded to an intermediate LLC. Restricted this implicit personal scope to individuals; explicitly declared guarantors still apply. The owner/citizenship and affiliate scopes remain unchanged. Updated the earlier scope test that encoded the same bug and added a targeted regression assertion.
2. **Plan wrong:** omitted the holding company's affiliate tax/interim/debt evidence. Added independently authored holding-company data and expectations.
3. **Plan wrong:** the expired LOI also fails TXN-01, not just CON-15. Corrected the expected row and item-23 mapping after reading that rule.
4. **Plan wrong:** B's equipment/inventory items are unconditional in the pack, including stock purchases. Corrected their expected status to satisfied because both files are supplied.

C passed the first comparison. Step B changed human-readable evidence quotes, XLSX sheet locators and physical duplicate-format labels; it did not change expected statuses/findings. A pre-oracle layout check required allowing packets with more than two segments. The first readability harness used a removed PDF.js document-level destroy method; corrected it to destroy the loading task using the installed API. The migrated E2E filename helper initially included a duplicate hyphen in a prefix; corrected the lookup and reran all seven tests successfully. These were harness/layout issues, not truth changes.

## Planted-item table

There are 23 annotations in A, three in B and eight in C. All numbered items 1–25 occur; some intentionally recur across deals. B-LIMITED is the separately required combined limited-source arithmetic case. Pipeline-only items have an explicit pipeline outcome rather than an invented rule finding. Paths below are relative to `fixtures/deals/<deal>/`. An absent item's reference may be the carrier of the misleading evidence or the later fixing file; its description states which.

| Item | Deal | Arrival / affected batch | File or files | Expected outcome |
| --- | --- | --- | --- | --- |
| 1 — Guarantor 2024 return absent until batch 2 | deal-a | 1; fixes in 2 | `incoming/batch-2/Buyer/Attachments/alex-taxes-b2.pdf` | GUA-02 / alex / 2024 |
| 2 — Form 413 is 140 days old | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/pfs.pdf` | GUA-01 / alex |
| 3 — Unsigned and undated Form 1919 | deal-a | 1; fixes in 2 | `incoming/batch-1/Buyer/Attachments/1919.pdf` | ENT-01 / buyer |
| 4 — Same tax year twice; one misleading filename | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/alex-taxes-b1.PDF`<br>`incoming/batch-1/Buyer/Tax/Fwd - 2024 return.PDF` | duplicate; period is 2023 regardless of filename |
| 5 — One-digit EIN conflict | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-9.PDF`<br>`incoming/batch-1/Seller/Fwd - closing docs/target-taxes.pdf` | CON-01 / target |
| 6 — Three conflicting purchase prices | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-1.PDF`<br>`incoming/batch-1/Buyer/Attachments/forwarded-packet-2.PDF` | CON-03 / deal |
| 7 — Sources are 25000 below uses | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/forwarded-packet-2.PDF` | TXN-03 / deal; CON-04 / deal |
| 8 — Injection includes seller note with only 24 months standby; amount also exceeds seed fraction | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-11.PDF`<br>`incoming/batch-1/Buyer/Attachments/forwarded-packet-2.PDF` | CON-06 / deal; CON-07 / deal |
| 9 — Operating agreement 55/45 against Form 1919 60/40 | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/forwarded-packet-2.PDF`<br>`incoming/batch-1/Buyer/Attachments/1919.pdf` | CON-02 / buyer |
| 10 — Exact duplicate under forwarded filename | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-11.PDF`<br>`incoming/batch-1/Seller/Fwd - closing docs/license-resend.PDF` | duplicate_of license |
| 11 — Corrected Form 413 replaces stale earlier version | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/bea-pfs-old.pdf`<br>`incoming/batch-1/Buyer/Attachments/bea-pfs.PDF` | supersedes bea-pfs-old |
| 13 — Three logical documents in one physical PDF | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/alex-identity.pdf` | bundle: GOV_ID, RESUME, CREDIT_AUTH |
| 14 — Lease hidden behind phone-scan filename | deal-a | 1 | `incoming/batch-1/Phone/scan0007.pdf` | classify as LEASE |
| 15 — Irrelevant brochure | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/brochure.PDF` | not_required |
| 16 — Password-protected formation document | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/formation.PDF` | ENT-02 / buyer; unreadable: FORMATION_DOC; no segment or fact |
| 17 — Statement revenue 6 percent above return | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/fin-2025.XLSX`<br>`incoming/batch-1/Seller/Fwd - closing docs/target-taxes.pdf` | CON-10 / target / 2025 |
| 18 — Interim is 150 days old; aging shares the same period | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-7.pdf`<br>`incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-8.PDF` | TGT-03 / target |
| 19 — Income statement and balance sheet in separate workbook sheets | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/fin-2025.XLSX` | xlsx sheets: Income Statement, Balance Sheet |
| 20 — Lease ends in three years with no options | deal-a | 1 | `incoming/batch-1/Phone/scan0007.pdf` | CON-13 / target |
| 21 — Citizenship evidence absent for indirect 40 percent owner | deal-a | 1; fixes in 2 | `incoming/batch-1/Buyer/Attachments/forwarded-packet-4.PDF`<br>`incoming/batch-2/Buyer/Attachments/bea-citizen.PDF` | GUA-05 / bea |
| 22 — August bank balance 100000 below claimed cash 150000 | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/forwarded-packet-6.PDF`<br>`incoming/batch-1/Buyer/Attachments/forwarded-packet-2.PDF` | CON-08 / cash-alex |
| 23 — LOI expired before as-of | deal-a | 1 | `incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-1.PDF` | TXN-01 / deal; CON-15 / deal |
| 24 — Document names a person outside the deal | deal-a | 1 | `incoming/batch-1/Buyer/Attachments/unmatched.pdf` | CON-16 / deal; unmatched_party |
| B-LIMITED — Seller note plus minority equity 210000 exceeds 185000 seed limit | deal-b | 1 | `incoming/batch-1/Seller/Fwd - closing docs/note.pdf`<br>`incoming/batch-1/Buyer/Attachments/forwarded-packet-2.PDF`<br>`incoming/batch-1/Buyer/Attachments/forwarded-packet-4.pdf` | CON-07 / deal |
| 18 — 150-day interim exceeds overlay 60-day window | deal-b | 1 | `incoming/batch-1/Seller/Fwd - closing docs/interim.pdf`<br>`incoming/batch-1/Seller/Fwd - closing docs/ar.PDF`<br>`incoming/batch-1/Seller/Fwd - closing docs/ap.pdf` | TGT-03 / target |
| 22 — Cash claim exceeds August bank balance; PFS cash follows statement | deal-b | 1 | `incoming/batch-1/Buyer/Attachments/bank-aug.PDF`<br>`incoming/batch-1/Buyer/Attachments/pfs.pdf`<br>`incoming/batch-1/Buyer/Attachments/forwarded-packet-2.PDF` | CON-08 / cash-alex |
| 1 — 2024 personal return missing | deal-c | 1 | `incoming/batch-1/Buyer/Attachments/alex-taxes-b1.pdf` | GUA-02 / alex / 2024 |
| 3 — Unsigned and undated Form 1919 | deal-c | 1 | `incoming/batch-1/Buyer/Attachments/1919.PDF` | ENT-01 / buyer |
| 10 — Exact duplicate under another filename | deal-c | 1 | `incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-11.PDF`<br>`incoming/batch-1/Seller/Fwd - closing docs/license-resend.pdf` | duplicate_of license |
| 12 — Signed Form 413 image-only PDF | deal-c | 1 | `incoming/batch-1/Buyer/Attachments/forwarded-packet-5.PDF` | vision review with visible dated e-sign block |
| 13 — ID, resume and credit authorization bundle | deal-c | 1 | `incoming/batch-1/Buyer/Attachments/alex-identity.PDF` | three segments with page boundaries |
| 15 — Irrelevant brochure | deal-c | 1 | `incoming/batch-1/Seller/Fwd - closing docs/forwarded-packet-14.PDF` | not_required |
| 16 — Password-protected formation document | deal-c | 1 | `incoming/batch-1/Buyer/Attachments/formation.pdf` | ENT-02 / buyer; unreadable: FORMATION_DOC; zero segments and facts |
| 25 — Latest personal tax year on extension | deal-c | 1 | `incoming/batch-1/Buyer/Attachments/extension.pdf` | GUA-02 / alex / 2025 |

The three traps are seller-name spacing/LLC punctuation in TXN-02, a 50-cent PFS arithmetic difference within the USD 1 tolerance, and a superseded stale PFS for the other guarantor. The deliberately wrong seller EIN has a separate CON-01 finding and is not attributed to name normalization.

## File proof and determinism

- Two separate `pnpm fixtures:generate --check` runs regenerated into temporary directories and matched every manifest, source file, truth artifact and ZIP. They also verified the committed bytes against each recorded SHA-256 and rejected extra/missing files. Text PDF, AcroForm, protected PDF, DOCX, XLSX and ZIP outputs are byte-identical.
- All **47 legacy file hashes** match the pre-move inventory. Git records the moved corpus files as 100% identical. The inherited extraction/review/duplicate/recovery test behavior remains intact; only paths, fixture-organization labels outside the exempt directory and synthetic demo contacts changed. The separate Phase 1 personal-scope assertion correction is described above.
- Text PDFs expose their type cues, displayed key values and every fact quote on the cited page. There are **24 generated AcroForm fields** (A 17, B 6, C 1); every field reads back through pdf-lib with the exact plan value.
- Each XLSX opens with `Income Statement` and `Balance Sheet`. Financial asset/liability facts cite the second sheet; revenue/income facts cite the first. DOCX files parse with Mammoth and contain their authored content and watermark.
- Each protected PDF fails in pdf-lib as encrypted and in PDF.js with `PasswordException` without the password. Proof-only opening with the committed synthetic password confirms its watermark and planned formation-document content. Runtime truth contains no segment or fact for it, ENT-02 is missing, and expected_review names FORMATION_DOC as the unreadable planned type.
- Image-only pages contain fewer than 100 text characters and a page image. **17 distinct canonical scan files / 36 pages** were rasterized twice each; both rebuilds and the committed images matched on this host. OCR found SYNTHETIC on all 36 pages. C also carries an exact duplicate of a scanned packet. Cross-machine raster identity was not established. Canonical SHA-256 and content/plan fingerprints govern normal generation; only `--rebuild-scans` invokes rasterization. Observed renderer: Poppler `pdftoppm 24.04.0`; OCR is a local proof tool, not a parsing pipeline.
- Synthetic-data lint checks generated text, identifier/contact ranges, watermark presence and prohibited wording. The working-tree name lint excludes only the original specification, saved phase requests, amendments and the owner-exempt legacy directory. The new viewer capture uses example.com contacts and Sample Lender A; the older capture was removed from the current tree and remains in accepted history.

## Official forms and dependencies

Both cached official blanks support filling: 1919 has 126 fields across seven pages; 413 has 147 across six. A fill/save/reopen trial succeeded for `applicantname` and `Name`. Their printed wording conflicts with the hard banned-term requirement, so generated files use labeled simplified facsimiles with their own AcroForm fields, official form identifiers/OMB cues and dated synthetic e-sign blocks. The fallback was decided within minutes, inside the two-hour limit. Details and official download links: [forms trial](../fixtures/forms/README.md).

Added only **dev dependencies** `pdfkit 0.20.2` and `@types/pdfkit 0.17.6`. Verified PDFKit's password options and supported encryption versions in its [official getting-started guide](https://pdfkit.org/docs/getting_started.html), checked registry versions before installation, then proved encryption and deterministic generation locally. PDF 1.4 password protection is deliberately confined to synthetic test files, not application security. No runtime stack or paid service was added.

Reused pinned pdf-lib 1.17.1 ([AcroForm API](https://pdf-lib.js.org/docs/api/classes/pdfform)), docx 9.7.1, JSZip 3.10.2, SheetJS 0.20.3, Faker 10.6.0, PDF.js 6.3.289 and Mammoth 1.12.2. Poppler and Tesseract were already installed local proof tools; normal generation/check needs neither when using committed canonical scans. Fixed PDF metadata, DOCX core timestamps, ZIP timestamps and sorted entries remove clock-dependent bytes.

## Names and recorded choices

[Name checks](phase-2-name-checks.md) record each query and outcome. The proposed Ostrel brand matched an operating business and became **Ostrelyva**; other selected deal/support organization searches returned no matching business (not a guarantee of worldwide uniqueness). Sample Lender A is an explicit sample label. The legacy Cardinal Fleet Services collision led to the owner's narrow exception: preserve only fixtures/legacy unchanged until Phase 4. No other directory inherits that exception.

[Decisions 32–49](DECISIONS.md) record the choices and one-line reasons: legacy exemption, overlay rename, coined names, public visibility unchanged, semantic oracle comparison, Step A null byte metadata until rendering, exactly three A fixes, fixed Faker/HMAC inputs, individual-only implicit personal scopes, April cash support for the stale PFS, official-form fallback, encryption dependency, canonical scans, reuse of existing render libraries, readable quotes, test/screenshot name refresh and scan content fingerprints.

## Exact command results

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm lint` | 0 | No errors or warnings |
| `pnpm typecheck` | 0 | Next route types and TypeScript pass |
| `pnpm test` | 0 | 125 tests / 14 files pass |
| `pnpm test:integration` | 0 | 20 tests / 5 files pass |
| `pnpm test:e2e` | 0 | 7 Chromium tests pass (32.0 seconds) |
| `pnpm rules:check` | 0 | 52 types, 79 attributes, four resolved configurations pass |
| `pnpm rules:export-review` | 0 | XLSX/HTML regenerated for all four configurations, using the renamed overlay |
| `pnpm fixtures:check` | 0 | All four oracles, schema/references, 47 retained hashes, file readability and synthetic lint pass |
| `pnpm fixtures:generate --check` | 0 | Two independent temporary generations match all three manifests and their files/truth/archives |
| `pnpm build` | 0 | Next.js production build passes |
| `pnpm exec tsx scripts/check-raster-fixtures.ts` | 0 | Same-host double raster proof and OCR watermark checks pass |

Agent-browser additionally verified login, meaningful home content, navigation and the selected overlay: no framework error overlay or browser errors, correct Sample Lender A label, SLA_ template and unverified notices. [Refreshed screenshot](screenshots/phase-2-rulepacks.png). The E2E server stopped after its successful run while the initial manual browser check was waiting for the wrong post-login URL; used a separate local server to complete the overlay check, then stopped it. No deployment or external message was sent.

## Specification concerns and limits

1. A19 and A24 conflict for legacy real-business name collisions. Resolved by the owner's explicit legacy-only exception, recorded in the amendments.
2. The default franchise brand is already in commercial use. Replaced under A19 after checking the proposed alternative.
3. Filling the official blanks works, but retaining their printed wording violates guardrail 1. The hard guardrail takes precedence; the fallback reason is wording, not unreliable filling.
4. An indirect ownership entity cannot meaningfully supply the personal documents requested by the former implicit guarantor scope. The narrow engine correction is documented and tested; it is not a determination of legal guaranty requirements.
5. A26's missing status and general unknown dominance need care for future unreadable signature/fact-dependent types: this phase deliberately uses formation documents, whose presence-only row is missing with no evidence. No unsupported generic unreadable-file override was added to the engine.
6. Step A cannot contain real file hashes while also containing no rendered files. It had explicit null byte metadata; every final Step B document has measured hash/size and a manifest.
7. Raster stability was observed only on this machine. A22's canonical-file mechanism avoids claiming cross-machine byte stability. These checks establish deterministic fixture/oracle behavior, not model extraction quality or an actual lending outcome.

Phase 2 ends here. Phase 3 remains unauthorized and unstarted.
