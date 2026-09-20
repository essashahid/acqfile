# Phase 3 proof

Date: 2026-09-20. Scope: corrections, deal profiles, intake, source blocks, segmentation/classification, and audited filing review. No Phase 4 implementation, live evaluation, extraction adaptation or deployment. Repository: essashahid/acqfile, observed **PUBLIC**, unchanged.

## A28 corrections and independent expectations

| Expectation | Before | After | Reason |
| --- | --- | --- | --- |
| A batch 1 GUA-02/alex/2024 | needs_review | missing / missing finding | No accepted or proposed return for 2024; do not run completeness on absence. |
| C batch 1 GUA-02/alex/2024 | needs_review | missing / missing finding | Same absent-return rule. |
| A batch 1 ENT-01/buyer | needs_review | received_with_issues / incomplete finding | Explicit unsigned and undated indicators are definite failures. |
| C batch 1 ENT-01/buyer | needs_review | received_with_issues / incomplete finding | Same definite signature failure. |
| Phase 1 missing annual tax period scenario | needs_review | missing | Absence short-circuits page checks. |
| Phase 1 false conjunct with unknown applicability | needs_review and finding | not_applicable, no finding | False AND unknown is false. |
| Expression false AND unknown / true OR unknown | unknown / unknown | false / true | Standard three-valued Boolean logic. |
| Older 2024 extension test | needs_review | missing | Only the latest completed tax year gets A13's extension exception. |
| Missing paid-agent Form 159 with unknown fee | needs_review | missing | Fee uncertainty does not replace the absent accepted document. |

The check-coverage assertion now recognizes absence as a short-circuit and does not demand that checks execute for missing documents. The missing-document scenario directly asserts an empty reasons list. Removal, pending-evidence and determinism invariant tests retain their intent. New cases cover absence with signature/page checks, unsigned with null date, known conflict with a pending third source, proposed evidence and inventory precedence over waiver. Failed and unknown checks both appear in messages; their order follows pack order.


All four independently authored oracles pass: A batch 1 **78 rows / 20 findings**, A batch 2 **78 / 17**, B **76 / 3**, C **63 / 4**. A's second batch still resolves exactly three findings. No-false-satisfied, removal monotonicity, pending-never-satisfies and determinism tests retain their intent.

Mismatch log: old A9 expectations were wrong under A28, and were re-authored from the amendment. A new diagnostic test wrongly required failure messages before unknown messages; fixed that assertion to require both. The complete row-by-row changes and Step 0 checks are in [Step 0 proof](phase-3-step-0.md). No engine output was copied into expected truth.

## Official forms and fixture corrections

All **nine logical Form 1919/413 instances** use the complete cached official blanks, including rasterized instances. No facsimile fallback was needed. The original seven-page 1919 and six-page 413 each have an added synthetic evidence sheet for literal quote locators. Every page carries SYNTHETIC; signed copies have drawn e-sign marks/envelope IDs and dates. Unused government-form fields remain blank.

One mapping, `src/lib/config/official-form-fields.ts`, covers 1919 applicant name/EIN/address, five owner rows (name/percent/title/identifier), signature/date; and 413 name, as-of date, cash, assets, liabilities, net worth, signature/date. The fixture proof reads back every planned mapped value: owner names/percentages and all five planned 413 financial/date attributes. This is coverage of the planned synthetic evidence, not every question on either form. Runtime uses field-name signatures and mapped party/date fields before text/model fallback.

A's lease and one 413 are image-only. Explicit document dates, logical-document page numbering and original-before-duplicate archive ordering make metadata and arrival semantics testable. Corrected A 1919 is dated September 10, after its August 31 original, satisfying A32. These rendering changes do not alter expected checklist statuses. Quoted metadata points to the actual cited page, including official-form evidence sheets.

Raster proof: **19 unique scan PDFs / 50 pages**, all independently OCR-checked for SYNTHETIC. Two rerasterizations of each match the committed bytes on this host. Cross-machine identity remains unproven; canonical-hash policy A22 remains in force. All **47 legacy file hashes remain unchanged**.

## Pipeline proof

The integration proof ingests every file of every batch, compares persisted segments with `documents.json`, and checks declared duplicate/supersession/unreadable outcomes. The mock provider alone reads fixture truth. Deterministic parsing/classification never imports truth.

| Deal | Files / batches | Segments | Type | Bundle boundaries | Party + period | Signed + dated | Wrong true |
| --- | --- | --- | --- | --- | --- | --- | --- |
| deal-a | 40 / 2 | 63 | 63/63 (100%) | 46/46 (100%) | 63/63 (100%) | 63/63 (100%) | 0 |
| deal-b | 28 / 1 | 39 | 39/39 (100%) | 19/19 (100%) | 39/39 (100%) | 39/39 (100%) | 0 |
| deal-c | 22 / 1 | 39 | 39/39 (100%) | 34/34 (100%) | 39/39 (100%) | 39/39 (100%) | 0 |

| Deal | Deterministic segments / share | Deterministic type + boundary accuracy | Classifier segments / share |
| --- | --- | --- | --- |
| deal-a | 55 / 87.30% | 55/55 (100%) | 8 / 12.70% |
| deal-b | 36 / 92.31% | 36/36 (100%) | 3 / 7.69% |
| deal-c | 3 / 7.69% | 3/3 (100%) | 36 / 92.31% |
| Total | 94 / 66.67% | 94/94 (100%) | 47 / 33.33% |

These are fixture routing and mock integration results, not model-quality results. A34 was **skipped: no owner provider key configured**. No live calls or spend.

Additional passing assertions:

- All declared pipeline expectations, including exact duplicates, superseded versions, unreadable files, misnamed lease, brochure and outside party.
- Within-deal exact duplicates create no document version, parse or model call; identical bytes are allowed in a different deal.
- Failure at segment_classify retries that step (two attempts), preserves the completed parse (one attempt), and resume makes no additional model call. Upload, hash_dedupe and parse failures also exercise persisted retry paths.
- Equal-date same-identity files open version_conflict; explicit selection is audited. Automatic later-date supersession can be undone, and stale/repeated undo fails safely.
- Legacy evaluation still runs all 76 retained cases after all three deals have been ingested; legacy document queries exclude deal filing records.
- Human filing creates a new immutable record version, rejects stale saves, and checks party/deal ownership. Unreadable manual indexing creates no segment or fact.
- ZIP traversal, nested archives, expansion bombs, symlinks, corrupt headers/CRC, count/size limits and mixed-case/misleading filenames are checked before parsing.
- SSN/EIN/account patterns are scrubbed from persisted blocks and step outputs; identifier equality uses HMAC and last four. Passport/ID text is redacted, including unlabeled AcroForm values repeated in the text layer. Database/output assertions and test logs are checked without copying source text into audit/run logs.

## Regression issues corrected

Initial checks exposed repeated AcroForm widget locator collisions and the inherited PDF/DOCX MIME restriction; fixed locators and admitted XLSX/unsupported-file review. Later full integration caught pre-registration step foreign keys and scrubbing of numeric UUID components; fixed nullable step links/backfill and preserved structural identifiers. The production browser regression also exposed the retained evaluator reading new filing records as report schemas; restricted legacy evaluation/document queries to versions without a deal ID and added a coexistence integration assertion. Quote-page checks caught the need to cite the official evidence sheet rather than page one. These were implementation problems; fixture expected outcomes were not relaxed.

One E2E attempt failed with local ENOSPC while recording a browser trace, after three tests passed. Removed only this project's generated build caches and reran; final results below supersede that attempt.

## Decisions and specification interpretation

Decisions 51–80 in [DECISIONS.md](DECISIONS.md) record the choices and one-line reasons. The consequential choices are complete official forms with a synthetic evidence sheet; stable party IDs and stale revisions; per-deal dedupe; deterministic-first classification with human bundle confirmation; A26 manual indexing without evidence; explicit version conflict selection; real operations inside durable upload/dedupe steps; and zero live calls without an owner key.

A28 explicitly corrects A9 and decision 18; A29/A30 supersede the Phase 2 facsimile decision. The government's fixed agency contacts remain part of official document boilerplate; invented-party contact lint applies to authored fixture values. Unknown is allowed for domain values; IDs, hashes and revision numbers still have to identify records. Manual filing does not override unreadability. No other change to the rule-pack simplifications recorded in Phase 1 is claimed.

Originals are private, accessed through authenticated, workspace-checked, role-gated and audited 15-minute signed links (A35). Runtime uses pdf-lib native-PDF slicing and browser PDF.js, with no server rasterizer or OCR executable. All six steps persist idempotency keys and retries. Batch actions currently execute inline; deployment transport limits and job scheduling are not part of this phase's local proof. No new package was added; existing pinned pdf-lib 1.17.1 moved to runtime dependencies, verified against its official API, and Node bounded zlib decoding was verified against the Node 22 documentation. Prettier was an ephemeral formatter only.

## Final commands

| Command | Result |
| --- | --- |
| `pnpm lint` | PASS, exit 0 |
| `pnpm typecheck` | PASS, exit 0; Next route types + TypeScript |
| `pnpm test` | PASS, exit 0; 143 tests / 17 files |
| `pnpm test:integration` | PASS, exit 0; 28 tests / 8 files, including legacy/deal coexistence and A35 originals |
| `pnpm test:e2e` | PASS, exit 0; 8 tests, 1.6 min, against the production build, including the A35 notice |
| `pnpm rules:check` | PASS, exit 0; four pack/overlay resolutions, 52 types, 79 attributes |
| `pnpm fixtures:check` | PASS, exit 0; four oracles, readability/synthetic lint, 47 unchanged legacy hashes |
| `pnpm fixtures:generate --check` | PASS, exit 0; A 40 files/two batches, B 28/one, C 22/one |
| `pnpm build` | PASS, exit 0; Next.js 16.3.4 production build |
| `pnpm exec tsx scripts/check-raster-fixtures.ts` | PASS, exit 0; 19 canonical files / 50 pages, two matching rerasterizations |
| `git diff --check` | PASS, exit 0 |

The new browser scenario imports A's profile JSON, uploads batch 1, displays filed documents, renders a source page, confirms one bundle, manually indexes the unreadable formation document, uploads batch 2, and observes 1919 supersession. Retained seven browser tests pass unchanged in intent. A local inspection of the captured screen confirmed the file/batch/status and filing controls. Phase 3 logs contain no SSN/EIN or seeded account/passport test patterns. SPEC.md remains unchanged (SHA-256 aa407cdd0e5b06273c296d67d17a98af80f958c379993aeb679f157efbd9fdd9).

## Original documents under A35

The owner ruled on 2026-09-20 that Guardrail 7 governs derived and stored data and that originals may be viewed unmasked by admin and operator (this codebase's `reviewer`) roles. Implementation:

- **Roles (A35.1).** `originalAccessAllowed` admits admin and reviewer; a signed-in viewer is refused by the source route (HTTP 403) and the review page mints no signed link for them, showing masked source blocks instead. The public demo visitor is admitted only while `PUBLIC_DEMO_MODE` is on. Unit tests cover every role; the integration test proves the viewer refusal writes no event.
- **Audit (A35.2).** The source route writes one `original_opened` event per signed link: actor, deal, document version, content hash, link identity and time. Three requests on the same link produce exactly one event; a new link produces a new event. The event payload never contains document text. The browser now loads each PDF once per link and renders pages from that document, so page flips do not refetch.
- **Transport (A35.3).** Unchanged: 15-minute HMAC-signed links, `Cache-Control: private, no-store`, `nosniff`, no server-side thumbnails or rasterization.
- **Modes (A35.4).** `env()` refuses `REAL_DATA_MODE=true` with `PUBLIC_DEMO_MODE=true` by name before any other validation; `REAL_DATA_MODE=true` alone remains unaccepted until the Phase 7 pilot runbook. Unit tests cover both.
- **Notice (A35.5).** "Original document. Identifiers are not masked here." renders beside every unmasked original and is asserted by the browser test. The former client-side partial masking overlay is removed because it could never cover image-only pages and would have contradicted the notice.
- **Screenshots (A35.6).** Only synthetic, watermarked fixture files appear in docs and tests.

## Delivery status

Step 0 commit: `c4eb406`. Step A commit: `0a98e89`. Step B (segments, classification, filing, A35) is the commit that carries this proof. Phase 4 has not started.
