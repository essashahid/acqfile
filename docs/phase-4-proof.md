# Phase 4 proof

Date: 2026-09-20. Scope: fixture correction (A36, A43), extraction core, grouped review, entity resolution, evaluation wiring and legacy removal (A42). No checklist or findings screens, findings lifecycle, requests, snapshots, exports, Section 18 harness, live evaluation or deployment. Mock mode throughout; A44 skipped (no owner provider key).

## Step 0: fixtures under A36 and A43

- **No evidence sheet.** Official Form 1919 and Form 413 instances carry facts only in their own fields. Page counts fall from 8 to 7 (1919) and 7 to 6 (413); the corpus is now 96 / 51 / 54 pages for deals A / B / C. AcroForm facts cite `field:<name>:0` on the widget's page with the field value as quote; image-only facts cite `page-N` plus a named region with the value as read and `verbatim: false`; text facts are unchanged. The date is written into the form's own date field; the e-signature mark is page content inside the PDFSignature widget (it cannot hold text). Form 413 is dated by its as-of field, Form 1919 by its signature date; an undated form has no document date, and a dated submission supersedes an undated current one (A32 refinement, decision 83).
- **Canonical scans** were rebuilt with Poppler: 19 files / 48 pages, two re-rasterizations identical on this host, OCR watermark on every page, official raster facts checked against the text source's field values.
- **Twelve planted faults** (A43) are authored in the plans with hand-reasoned A39 routing and written to `deal.json` (`planted_faults`), `documents.json` (`faults`) and `expected_review.json` (`extraction_fault`). Truth statuses did not change: all four oracles pass with the same rows and findings as Phase 3 (A 78/20 and 78/17, B 76/3, C 63/4).
- Phase 3 gates still pass on the regenerated corpus (pipeline proof unchanged: 100% type, boundary, party and signature agreement, no wrong `true`).

## Step A and B proof, per deal and batch (mock mode)

The test operator first confirms proposed segmentation exactly as truth (Phase 3 review); fact review has not happened when the "before review" columns are measured.

| Deal / batch | Facts | Rule-feeding acroform | Rule-feeding text | Rule-feeding vision (report only) | Provenance (text-layer) | Vision auto-accepted | Faults routed as planned | Before review: false satisfied | After review: exact        |
| ------------ | ----- | --------------------- | ----------------- | --------------------------------- | ----------------------- | -------------------- | ------------------------ | ------------------------------ | -------------------------- |
| A / 1        | 123   | 6/6 (100%)            | 105/108 (97.2%)   | 8/8 (100%)                        | 114/115 (99.1%)         | 0                    | 6/6                      | 0                              | yes (78 rows, 20 findings) |
| A / 2        | 3 new | 1/1                   | 1/1               | –                                 | 3/3                     | 0                    | –                        | 0                              | yes (78 rows, 17 findings) |
| B / 1        | 73    | 6/6 (100%)            | 63/65 (96.9%)     | –                                 | 72/73 (98.6%)           | 0                    | 4/4                      | 0                              | yes (76 rows, 3 findings)  |
| C / 1        | 56    | 1/1 (100%)            | 3/3 (100%)        | 51/59 (86.4%)                     | 5/5 (100%)              | 0                    | 2/2                      | 0                              | yes (63 rows, 4 findings)  |

Every text or AcroForm miss is a planted fault (A-F1, A-F4, A-F5, B-F1, B-F4 and the C-F1 gap); the vision misses are the eight image-read identifiers that become operator entry items under A40 (decision 90) plus the planted gap. The one invalid provenance claim per deal A and B is the planted quote-not-in-block fault, blocked as planned.

| Gate                                                                                     | Result                                                                                                                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Rule-feeding accuracy, acroform and text, before review, at least 95%                    | 96.9% to 100% per deal and batch                                                                                                   |
| Provenance validity on text-layer facts, at least 98%                                    | 98.6% to 100%                                                                                                                      |
| Every planted fault routed as its plan expects                                           | 12/12                                                                                                                              |
| Vision rule-feeding facts auto-accepted                                                  | 0                                                                                                                                  |
| Before review: rows satisfied where truth says otherwise                                 | 0 in every deal and batch                                                                                                          |
| After simulated review: engine result equals expected checklist and findings             | exact, every deal and batch                                                                                                        |
| Correction creates a new version and a new evaluation whose result changes as expected   | pass (deal B: record version 2, one conflict appears, restored value removes it; stale write rejected)                             |
| Injected failure at `extract` and at `independent_verify` resumes with no repeated call  | pass (extract attempt 5 after four injected failures, one extract call; verify attempt 2, one verify call; rerun makes zero calls) |
| Identifier patterns in facts, reviews, events, run steps, run events and model call rows | none                                                                                                                               |
| Phase 3 gates on the regenerated fixtures                                                | pass                                                                                                                               |

**Facts by method** (all deals, all batches): acroform 20, text 176, vision 59; 255 facts. Routing before review: 188 auto-accepted, 63 review, 4 blocked.

**Review items an operator faces** (pending values plus open items after intake): deal A 14 (12 pending values, 1 extraction gap, 1 party outside the deal), deal B 4, deal C 60 (51 image-read values, 8 identifier entry items, 1 party outside the deal). The simulated operator accepted 63 values, corrected 4, entered 9 and dismissed none.

**Classifier and deterministic shares** are unchanged from Phase 3 and are not repeated here.

## Planted faults

| Fault | Document / attribute                    | Kind                          | Expected | Actual                  | Confidence                  |
| ----- | --------------------------------------- | ----------------------------- | -------- | ----------------------- | --------------------------- |
| A-F1  | loi / deal.purchase_price               | wrong value, real quote       | blocked  | blocked                 | 0.60 (contradiction)        |
| A-F2  | ar / aging.as_of_date                   | quote not in block            | blocked  | blocked                 | 0.10 (unsupported evidence) |
| A-F3  | interim / financial.revenue             | weak evidence                 | review   | review                  | 0.815                       |
| A-F4  | tax-2024 / tax.gross_receipts           | verifier corrects             | review   | review                  | 0.70                        |
| A-F5  | debt / debt.total                       | missing value                 | review   | review (extraction gap) | –                           |
| A-F6  | pfs (scan) / pfs.cash                   | vision dual-read disagreement | review   | review                  | 0.65                        |
| B-F1  | funding / funding.uses_total            | wrong value, real quote       | blocked  | blocked                 | 0.40 (contradiction)        |
| B-F2  | note / note.term_months                 | quote not in block            | blocked  | blocked                 | 0.10                        |
| B-F3  | bank-aug / bank.ending_balance          | weak evidence                 | review   | review                  | 0.815                       |
| B-F4  | fin-2024 / financial.total_assets       | verifier corrects             | review   | review                  | 0.70                        |
| C-F1  | gift-letter (scan) / gift.amount        | missing value                 | review   | review (extraction gap) | –                           |
| C-F2  | donor-bank (scan) / bank.ending_balance | vision dual-read disagreement | review   | review                  | 0.65                        |

## Deleted under A42

`fixtures/legacy` (18 truth files, 23 documents, sources and types), `fixtures/legacy-hashes.json`, `eval/baselines/mock.json`, the legacy generator, corpus ingest, single-document and evaluation scripts, `src/lib/schema/report.ts`, `src/lib/llm/*`, the inherited pipeline steps (`process-document`, `orchestrate`, `ingest`, `parse`, `validate`, `confidence`, `llm-log`), `src/lib/review`, `src/lib/queries`, `src/lib/eval/{cases,corpus,run,resumability}`, `src/lib/report`, `src/lib/demo.ts`, `src/lib/jobs.ts`, `src/lib/workflow.ts`, the upload, documents, review, runs, evals and reports screens, the run progress route, nine orphaned components, seven legacy unit tests, four legacy integration tests, the legacy browser spec and the 76 evaluation cases. Migration 0012 drops `source_blocks`, `extraction_runs`, `field_values`, `field_evidence`, `review_items`, `review_actions`, `eval_cases`, `eval_runs`, `eval_results`, `qa_reports` and `processing_run_documents`, and the two extraction columns of `record_versions`. Kept for Phase 6: the durable step runner, run events, `eval/metrics.ts` (generic metrics), `eval/regression.ts`, `eval/baseline.ts`. The A27 exemption ended: the repository-name lint now covers every tracked file.

## A44

Skipped: no owner provider key is in the environment. No live call, estimate or spend.

## Final commands

| Command                                          | Result                                                     |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `pnpm lint`                                      | PASS, exit 0                                               |
| `pnpm typecheck`                                 | PASS, exit 0                                               |
| `pnpm test`                                      | PASS, exit 0; 133 tests / 12 files                         |
| `pnpm test:integration`                          | PASS, exit 0; 15 tests / 6 files                           |
| `pnpm test:e2e`                                  | PASS, exit 0; 2 tests against the production build         |
| `pnpm rules:check`                               | PASS, exit 0; 52 types, 79 attributes                      |
| `pnpm fixtures:check`                            | PASS, exit 0; four oracles, readability and synthetic lint |
| `pnpm fixtures:generate --check`                 | PASS, exit 0; A 40 / B 28 / C 22 files                     |
| `pnpm eval`                                      | PASS, exit 0; the three mock-mode proofs                   |
| `pnpm build`                                     | PASS, exit 0                                               |
| `pnpm exec tsx scripts/check-raster-fixtures.ts` | PASS, exit 0; 19 files / 48 pages                          |
| `git diff --check`                               | PASS                                                       |

The browser proof imports Deal A, uploads batch 1, confirms a bundle, files the unreadable formation document, opens the review screen for the scanned Form 413 beside its page, edits one value and accepts it, sees the pending count fall by one, uploads batch 2 and sees the missing and incomplete counts fall by three in total (decision 100).

## Decisions

Decisions 81 to 100 in [DECISIONS.md](DECISIONS.md). Step 0 commit `79d284e`, Step A commit `7d319c9`, Step B is the commit that carries this proof.
