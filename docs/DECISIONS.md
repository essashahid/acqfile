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
