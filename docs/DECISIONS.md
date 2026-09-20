# Decisions and specification review

Recorded 2026-09-19. Scope: Phase 0 only. Future choices below are plans, not implemented features.

## Decisions

1. Use EvidenceOps main `9341148348f8535ed0f15981360728da58fd186c` as an independent source copy with a fresh Git history and origin `https://github.com/essashahid/acqfile.git`; the destination was empty.
2. Preserve the pasted specification byte-for-byte as docs/SPEC.md because no repository specification existed in the empty workspace.
3. Keep the base's architecture and installed versions. Pin direct dependencies to lockfile resolutions; remove the chunking-only tokenizer. No unrelated upgrades or new framework.
4. Default to explicit mock mode. Live extraction uses env-configured `gpt-5.6-luna` and verification uses `gpt-5.6-terra`; reject equal live identifiers. Keep the two inherited system prompts verbatim. Mock is deterministic scaffolding, not an independent model-quality measurement.
5. Keep centralized standard token pricing: Luna $0.20 input/$1.20 output and Terra $2/$12 per million tokens, verified against the official model pages on 2026-09-19. Unknown prices fail. No live calls in this phase; long-context/cache-write pricing and budget estimation need explicit treatment before Phase 6.
6. Remove all RAG-specific runtime, tables, migrations, metrics, prompts, routes, golden questions, UI and artifacts. Keep source blocks because they carry extraction provenance. Keep extraction/review/reliability evaluation cases, replay, baselines and HTML QA generation; Section 18 metric replacement belongs to Phase 6.
7. Edit the copied initial migrations to omit removed tables because AcqFile has no existing installation. These migrations are for a fresh dedicated AcqFile database, never an in-place upgrade of an EvidenceOps database.
8. Retain the base synthetic operational reports only as temporary extraction regression fixtures until Phase 2. Remove inherited published results/screenshots so they cannot be mistaken for measured AcqFile output.
9. Use existing pdf-lib for production PDF generation (pure JavaScript, no headless browser); promote it to runtime dependency when exports are built. Reuse existing JSZip for writing archives. Verify the XLSX and safe ZIP reader choices at their implementation phases.
10. Rename automatic extraction acceptance to `auto_accepted` throughout code and database constraints, including visible labels. This is a terminology guardrail, not a lending outcome.
11. Use dedicated AcqFile development/test database names and safe local/mock defaults; do not provision, deploy to or alter EvidenceOps infrastructure.

## Specification contradictions and gaps

- Section 1 says seven phases, while Section 23 enumerates eight (0 through 7). Follow the explicit table and the user's phase boundary.
- Synthetic-only is a hard guardrail, while Phase 7 asks for a paid-pilot runbook using clients' past files and REAL_DATA_MODE. Keep real data disabled; the runbook must describe a future separately authorized operational transition, not enable it under this specification.
- Section 15 names every packaged source `.pdf`, but intake includes DOCX/XLSX and originals must remain unchanged. Preserve original extensions/bytes; use PDFs for generated reports. Do not disguise non-PDF bytes with a PDF extension.
- CON-16 lists `needs_review` as severity although the severity enum permits blocker/major/minor/info. Treat it as finding type `needs_review`, with severity to be explicitly configured (planned: major).
- GUA-05 sits under per-guarantor items but explicitly requires every direct/indirect owner and guarantor. Its scope must be the union of those parties, not only guarantors.
- TXN-05 requires Form 155, while the taxonomy lacks it; other composite items lack explicit types (donor/transfer evidence, franchise disclosure, appraisal/environmental tracking). Resolve with sourced taxonomy/config entries or tracking/manual evidence, never silently count unrelated documents.
- TXN-07 depends on paid-agent compensation, and several checks depend on cash contributions, account history, guarantor spouses, leases and transaction details absent from the stated profile/field lists. Add explicit validated data fields in the relevant future phase or yield needs_review.
- Classification-only CREDIT_AUTH requires a signature check; RECEIVED alone cannot prove this. Shared segment signature metadata/manual confirmation must supply the check.
- CON-07's combined limited-source rule is described as an 8.1 change but has no pack qualifier in the consistency table. Scope it to sourced pack versions; do not impose an unsourced 8.1 rule on pack 8.
- YAML arithmetic examples use infix strings while the stack asks for JSON-logic style conditions and no eval. Normalize into a small validated expression representation; reject unknown operations. Do not execute arbitrary expressions.
- "Every exported file ends with" the footer conflicts with immutable original copies/binary ZIPs. Put the exact footer in generated document/sheet outputs and package manifest metadata; never modify supplied originals.
- Manual confidence 1.0 must not bypass required locator, actor, validation or review invariants.
- The two live model identifiers in the base are identical. This conflicts with independent verification and is corrected in Phase 0.

## Verification references

- [Luna model, pricing, image input and structured outputs](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Terra model, pricing, image input and structured outputs](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): retain the Responses API and Zod structured-output wrapper, checked against installed SDK types.
- [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs): native PDF input is the planned vision path; Phase 0 does not implement vision.
- [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next), plus installed `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`: keep async route props, standalone ESLint and production `next build`.
- [Official SBA SOP index](https://legacy.sba.gov/document/sop-50-10-lender-development-company-loan-programs): lists version 8.1 effective 2026-10-01 and version 8 effective 2025-06-01. This confirms the publication listing, not every rule seed. Official document review and section citations belong with Phase 1 rule-pack authoring; all rules remain unverified.

## Phase 0 verification updates

- GitHub inspection found AcqFile public despite the private parameter; changed only `essashahid/acqfile` to private before the initial commit/push. The only Git remote is AcqFile. EvidenceOps is a read-only source copy.
- Added `next typegen` before TypeScript because the inherited report route uses generated RouteContext types; plain tsc fails on a clean checkout without those types.
- Froze unit/integration wall clocks at 2026-09-15. Scheduling remains real so database and HTTP tests still run normally.
- The retained extraction suite now contains 76 cases after removal of 70 retrieval/answer/refusal cases. Its four planted extraction/provenance failures remain reported; the retained aggregate gates pass. These are infrastructure regression results, not Section 18 AcqFile deal metrics or live-model evidence.
- The latest agent-browser package declares Node 24/pnpm 11 while the app remains on Node 22/pnpm 10. Used its standalone native browser binary for the visual check; did not change application tooling or add a dependency.

Additional official dependency references checked on 2026-09-19: [Drizzle PostgreSQL drivers](https://orm.drizzle.team/docs/get-started/postgresql-new), [Inngest v4 durable step.run](https://www.inngest.com/docs/reference/typescript/v4/functions/step-run), [pdf-lib JavaScript PDF generation](https://pdf-lib.js.org/), and [PDF.js distribution guidance](https://mozilla.github.io/pdf.js/getting_started/). Existing package versions remain pinned to the base lockfile resolutions rather than unrelated latest releases.

## Phase 1 decisions (2026-09-19)

12. Record A1–A18 verbatim in SPEC_AMENDMENTS.md; those amendments take precedence. Keep the complete phase request in PHASE_1.md so future sessions can re-read the exact boundary.
13. Sample Lender A requires TXN-10a non-compete and TGT-11 add-back schedule, as selected by the user. Preserve TXN-10b/c and TGT-12a/b/c as `required: false` definitions so later lender configuration can enable them without code changes. Small choices of this size are decided and documented without asking.
14. Split ENT-07 into plan/projections and TGT-04 into AR/AP in addition to A6's explicit splits. One evidence type per row prevents unrelated documents from satisfying a requirement.
15. Implement typed registries for all 52 document types and 79 starting fact attributes. Shared signature/date/revision fields are segment metadata. Classification-only ownership charts may carry evidenced manual ownership facts; they do not gain an extractor in Phase 1.
16. Add only additive migrations for the ten domain tables and nullable documents.deal_id. Document versions derive their deal through documents, avoiding a second mutable deal assignment. Preserve the inherited extraction/review tables and code. Phase 5 requests, package snapshots and work_log are absent.
17. The pure engine receives a fixed evidence inventory alongside the listed inputs. A missing inventory member makes active rows need review. This is necessary for the monotonic removal invariant: without an inventory, deleting one side of a disagreement is indistinguishable from a formerly complete single-source input. A new evaluation snapshot may deliberately supersede evidence; simply omitting an input cannot resolve a conflict. The current implementation conservatively affects all active rows when an inventory member is missing.
18. Apply unknown dominance to each row's dependencies, including false-AND-unknown and true-OR-unknown. Null signatures, missing consumed facts, pending facts and unknown applicability need review. Unknown unrelated profile fields do not contaminate unrelated checks. A waiver requires actor, reason and audit reference and is reported as waived, never satisfied.
19. A received lender tracking state with actor/note may satisfy its tracking row without a borrower document. Ordered/not-started stays tracking. Conditional QOE and real-estate rows take precedence over the contradictory generic "always listed" sentence; no duplicate mandatory tracking requirements are invented.
20. Calendar years are the three years ending before as-of; monthly source statements cover the two latest completed calendar months. Latest-year tax extensions are the explicit A13 info exception. Fiscal-year filers remain out of scope. Interim income/balance sheet facts must share their evidence period/date.
21. Compute direct/indirect ownership paths for guarantor and owner scopes; use declared affiliate links and >=20% ownership links. Unknown ownership, cycles and ambiguous multiple buyer entities remain unresolved; deterministic sorting never chooses a legal interpretation. Account matching uses source party plus last four; ambiguous same-last-four accounts cannot be safely merged by this v1 profile and need operator clarification in later intake.
22. Compare legal-name suffixes, punctuation and spacing deterministically; this includes Varnholt versus Varn Holt. These comparisons do not merge parties. Use USD 1 for arithmetic rounding, USD 0 for purchase-price agreement, 0.01 percentage points for ownership totals, and 1% for tax/revenue differences. Every flag remains a preparation aid.
23. Author each pack independently as data and resolve overlays by add/remove/set id. Unknown operators, types, facts, profile paths, parameters, duplicate ids/keys and missing sources fail. Safe expression trees have explicit operator/args nodes, literal arrays for membership, and typed fact/profile references with selection metadata. No eval, Function or dynamic code. Canonical content hashes include the overlay; snapshots are insert-only and deduplicated by hash.
24. Add yaml 2.9.0 for the explicitly required YAML format. Vendor and pin SheetJS 0.20.3 using its official tarball, following vendor guidance instead of the stale public npm package. XLSX cells are strings and HTML is escaped. Export four resolved configurations to XLSX/HTML now; PDF review export remains Phase 5.
25. Cite official SOP sections with **section-start pages from the official DOCX table of contents**, not invented paragraph page numbers. The downloaded files' cached rendered-page breaks disagree with the TOC and are not reliable printed pagination. Source classes distinguish SOP, SBA form, secondary, internal consistency and synthetic lender convention; none is marked verified. RULE_SOURCES.md inventories the citations, and RULE_CANDIDATES.md records unsupported regulatory interpretations.
26. Keep the requested 10%-baseline limited-source arithmetic, universal 8.1 valuation tracking, and 12/24-month consulting comparisons as review flags. The SOP contains category qualifications and exceptions; these seed simplifications are not an implementation of the entire SOP or advice about a transaction.
27. Require typed masked identifier values (HMAC and last four), evidenced manual facts with actor/validation/event, and immutable audit/snapshot tables. Add pure HMAC/scrubbing helpers, but do not connect new parsing or model payload handling to the inherited pipeline before Phase 4.
28. Hand-author the five scenario files and expected outputs. The test adapter only expands explicit fixture metadata and edits; it does not generate expectations or use the engine as an oracle. No new fixture generator, intake, extraction, live call, deployment or Phase 2 work is included.
29. Ship only the authenticated read-only rule-pack viewer. It selects pack/overlay and compares two resolved configurations, including effective parameter changes and filename templates. No deal evaluation or findings lifecycle is exposed through a new write route.

30. Keep the seed’s 100% ownership-table comparison, but explicitly label it as stronger than Form 1919’s minimum listing coverage described by the secondary source. Do not misattribute that stricter convention to the form.

31. A final GitHub API read reported AcqFile public; restored the specified private visibility before the Phase 1 push and verified through REST. The cause of the external visibility drift is unknown. Only essashahid/acqfile was changed.

## Phase 2 decisions (2026-09-19)

32. Preserve legacy bytes under fixtures/legacy with pre-move SHA-256 inventory; the owner explicitly exempted that directory from A19 until Phase 4 after Cardinal Fleet Services matched a real business.
33. Replace the real-bank overlay with Sample Lender A / sample-lender-a / SLA_; preserve its two required and five optional rows.
34. Replace the proposed Ostrel brand with Ostrelyva (Ostrelyva Fitness): the original matches an actual van-conversion business at https://ostrel.fr/; an exact replacement-name search returned no matching business.
35. Repository visibility is public as observed through GitHub REST; A25 supersedes the earlier private-repository decisions. No visibility mutation is authorized or performed.
36. Use Ostrelyva for the franchise and the Zelmivar coined root for support organizations; record exact-name searches in phase-2-name-checks.md rather than claim global uniqueness.
37. Compare oracle truth on checklist identity/status and finding identity/type/severity/stable key, with source-locator assertions; diagnostic wording and display order are not the expected-results contract.
38. Before rendering, document hashes/byte counts remain null in Step A truth because no file bytes yet exist; Step B replaces every placeholder with measured values.
39. A's second batch contains the missing 2024 return, the indirect owner's citizenship evidence and the signed/dated replacement 1919: each resolves one finding without creating another.
40. Keep all models and expectations authored as data; seeded Faker supplies person names and a committed fake HMAC key supplies masked fixture identifiers. Fixture generation never reads PII_HMAC_KEY.
41. Restrict ownership-derived personal guarantor scopes to individuals; keep explicitly declared guarantors, owner/citizenship scopes and affiliate scopes unchanged. The oracle exposed entity Form 413/personal-return requests. The previous scope test encoded the same bug and is corrected; legacy extraction assertions are unchanged.
42. Keep an April statement beside July/August source statements in A, so the deliberately stale April Form 413 has matching cash evidence rather than an accidental extra missing-cash finding.
43. Use simplified AcroForm facsimiles after successful trials on both official blanks: their printed wording conflicts with the required banned-term lint. Keep the official blanks and trial record under fixtures/forms; do not describe working AcroForms as unreliable.
44. Add pinned dev-only PDFKit 0.20.2 and @types/pdfkit 0.17.6 after verifying its official encryption API. Fixed-date PDF 1.4 password fixtures regenerate deterministically and reject opening without their committed synthetic password; this is fixture production, not application encryption.
45. Treat committed scan PDFs as canonical because cross-machine font/raster identity is unproven. Normal generation checks their plan fingerprint and SHA-256; --rebuild-scans explicitly invokes Poppler. Same-host double-rasterization and independent OCR watermark checks are recorded in the proof.
46. Use existing pdf-lib, docx, JSZip, SheetJS, Faker, PDF.js and Mammoth rather than introduce a rendering stack. Normalize ZIP entry times/order and document metadata, and compare files, archives and truth against manifests in --check.
47. Render readable fact labels and synthetic clear identifier examples on document pages while keeping typed HMAC values in truth. This changes evidence quotes/result hashes from Step A, not authored expected statuses or findings.
48. Rename standalone legacy-era test organization strings outside fixtures/legacy to previously checked coined names while preserving their assertions' meaning; corpus bytes remain unchanged. Refresh the viewer screenshot to show the new overlay and example.com contacts.
49. Include rendered page content in canonical scan fingerprints so a party-name or other plan-text change cannot silently reuse a stale scan. Physical layout changes require a raster-layout version bump.
50. Mark PDF/DOCX/XLSX/ZIP/PNG archives as binary in Git attributes: some valid PDF streams contain no NUL byte, so Git otherwise treats mandatory xref spacing as text and could normalize line endings on another checkout.

## Phase 3 decisions (2026-09-20)

51. Implement A28 with explicit applicability/inventory/waiver/absence precedence, then fail-dominant checks; missing evidence must appear in the missing-item list.
52. Use complete official 1919/413 blanks with mapped fields and one synthetic evidence sheet; preserve government wording and literal locators without squeezing fact quotes into form margins (supersedes decision 43).
53. Keep official forms standalone when grouping arrival packets; this preserves AcroForm identities and makes scans complete documents.
54. Date A's corrected 1919 on September 10, after the initial August 31 copy; intended supersession must satisfy A32 rather than depend on filenames.
55. Apply contact/identifier fixture lint to authored synthetic values, not fixed government agency boilerplate; A30 requires the actual official pages, whose printed agency contacts are not invented fixture parties.
