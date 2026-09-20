# Phase 0 proof — 2026-09-19

**PASS.** Phase 0 only. No Phase 1 implementation or live model calls.

Environment: Node 22.18.0, pnpm 10.30.0, local PostgreSQL; explicit mock provider for evaluations. Fresh dedicated `acqfile` and `acqfile_test` databases. EvidenceOps resources were not used.

| Command/check                    | Exit | Observed result                                                                                                                                    |
| -------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 0    | Installed the inherited lockfile, then verified exact direct pins and the lockfile after removing the chunking tokenizer                           |
| `pnpm lint`                      | 0    | No errors or warnings                                                                                                                              |
| `pnpm typecheck`                 | 0    | Next.js route type generation and TypeScript pass                                                                                                  |
| `pnpm test`                      | 0    | 43 tests pass in 10 files                                                                                                                          |
| `pnpm db:migrate`                | 0    | Fresh ordinary PostgreSQL schema applies; optional Supabase-only migrations correctly skip                                                         |
| `pnpm test:integration`          | 0    | 15 tests pass in 4 files; retained review, authorization, duplicate/version, recovery and evaluation replay checks                                 |
| `pnpm fixtures:generate`         | 0    | Retained extraction generator verifies 20 files, 16 logical reports, 18 unique editions, 57 PDF pages; no question set                             |
| `pnpm test:e2e`                  | 0    | 6 Chromium flows pass: login, upload/duplicate/version, provenance, runs, review correction and evaluation                                         |
| `LLM_PROVIDER=mock pnpm eval`    | 0    | EVAL PASSED; 72/76 individual legacy cases; all six retained aggregate targets and six regression checks pass; HTML QA generated                   |
| `pnpm build`                     | 0    | Optimized Next.js 16.3.4 production build succeeds; no /ask or /rag routes                                                                         |
| Native agent-browser check       | 0    | Login page renders AcqFile, meaningful controls, no error overlay or page errors; screenshot visually inspected                                    |
| Fresh database removal audit     | 0    | 0 vector extensions; 0 of chunks, embedding_cache, rag_queries, rag_answers, answer_citations                                                      |
| Source removal audit             | 0    | No retrieval modules, SQL tables, golden fixtures or tokenizer dependency in maintained runtime; unit test asserts removed routes/provider methods |
| Authority preservation           | 0    | SPEC.md matches the attachment byte-for-byte; extractor and verifier system prompts match base verbatim                                            |

The standalone mock evaluation retains four deliberate failures: extraction for AUD-2026-011-v1, AUD-2026-014-v1, INV-2026-005-v1; provenance for OPS-2026-013-v1. The aggregate gates tolerate these planted readings. Duplicates pass 2/2, corrected versions 2/2, duplicate model records 0, below-threshold automatic acceptances 0, and injected-failure resumability passes. Actual live API spend is $0. These results are not the future SBA checklist or false-satisfied gates.

Corrections made while reaching green: removed stale RAG imports and UI metrics, repaired standalone evaluation/generator references, updated the legacy 146-case replay assertion to 76, removed the final pgvector reset dependency, and added clean-checkout Next.js route type generation. No failing test was skipped or disabled to achieve this proof; tests exclusively for removed features were deleted.

The browser runner emitted harmless NO_COLOR/FORCE_COLOR environment warnings. The app dependency install initially reported ignored optional package build scripts; all required builds and tests succeeded without enabling them.

The repository is private and configured with only `https://github.com/essashahid/acqfile.git`. Progress for phases 1–7 remains **Not started**. No deployment is claimed.
