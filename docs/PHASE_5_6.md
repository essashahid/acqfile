# PHASES 5 AND 6: Deliverables, plain screens, and the scorecard

Phase 4 is accepted at commit `c9acb44`. Do Phases 5 and 6 together. Stop at the proof and report. Do not start Phase 7. Save this request as `docs/PHASE_5_6.md`.

Your Phase 4 readings are accepted: any catalog producer a rule consumes is extracted; cross-pass agreement uses the verifier's independent value; the browser proof counted by finding type.

## 0. Append these rulings to `docs/SPEC_AMENDMENTS.md`

- **A45. Keep it simple. Standing rule from now on.** This is a project with no customers yet. Add no hardening, abstraction, configuration or documentation that a gate in a phase request does not require. When in doubt, leave it out and note it in one line. Prefer deleting code to adding it. Proof documents are one page. For small choices, decide, record and report. Stop only for something that would change scope, break a hard guardrail, or cost money.
- **A46. Readability.** The source has about 340 lines longer than 160 characters and the engine is written as dense one-line functions. Add Prettier as a dev dependency, print width 100, with `pnpm format` and `pnpm format:check`. Format the whole repository once. Behaviour unchanged, and the tests prove it. Remove every dependency nothing imports.
- **A47. Deliverables, simplified. This replaces the file list in Section 15.** A package is a ZIP with: `00_Package_Report.html`, one printable page with status summary, index, missing items, conflicts and change log; `00_Package_Workbook.xlsx` with tabs Index, Missing items, Conflicts, Source record, Change log; and the folder tree of renamed copies per A3. No PDF generation. The guardrail 9 footer is on the report and on every workbook tab. Identifiers are masked in both.
- **A48. Findings lifecycle, simplified:** `open`, `requested`, `resolved`, `dismissed`, `waived`. The system resolves a finding when its condition disappears and records which segment or fact resolved it; it reopens the finding if the condition returns. Dismiss and waive need a reason and are audit events. There is no `received` state.
- **A49. Requests are template-only.** One draft per responsible party from a deterministic template. No model drafting. A conflict shows both values with their file and page and asks which is correct. It never says which is right.
- **A50. Required facts come from the rules.** A row's required facts are the facts its checks reference. A confirmed segment that satisfies a row's type but lacks a referenced fact raises `extraction_gap`. No hand list and no new configuration.
- **A51. Dropped from v1:** work log, binder PDF, client status page, model-drafted requests, PDF exports, a runs and observability area, and any QA report beyond the one-page scorecard below.
- **A52. Screens are plain on purpose.** A product and design pass follows in Phase 7. Use existing components and plain tables. No styling effort, no charts, no new UI dependencies, no empty-state illustrations. Correct data, clear labels, working actions.
- **A53. Live run is optional.** `pnpm eval:live` runs only if the owner has put a provider key in the environment. Hard cap USD 5. Estimate first and abort above the cap.

## 1. Step 0: tidy. Commit separately.

Apply A46. All existing gates pass with no behaviour change.

## 2. Phase 5: deliverables and plain screens

1. **Tables** `requests` and `snapshots`. Findings gain the A48 lifecycle fields.
2. **Checklist screen.** Rows grouped as Transaction, Buyer entity, each guarantor or owner, Target business, Lender-ordered. Each row shows status, the satisfying document or documents, each check's result, and whether the rule is unverified. A row opens its document at the cited page. Controls on the row for the attestations that already have an API: tracking state, manual confirmation, waiver with reason.
3. **Findings screen.** Filter by type, severity, responsible party and status. Each finding shows every side's value with file, page and quote, side by side. Actions: dismiss or waive with a reason.
4. **Deal page.** Readiness as counts, never a lone percentage: required rows satisfied or waived out of applicable required rows. Blockers first. Oldest outstanding request. Files that failed processing, each with a retry action.
5. **Requests screen.** Drafts per party per A49. Copy to clipboard. "Mark as sent" moves those findings to `requested` and starts aging in days. Nothing is ever sent by the system.
6. **Package screen.** Generate a snapshot: freeze the evaluation, the index and a manifest with file hashes. Immutable, numbered per deal. Download the ZIP per A47. Show the diff against the previous snapshot: rows newly satisfied, new findings, resolved findings, documents added or superseded, reviewer corrections, dismissals and waivers.
7. **Overlay effect.** Folder scheme and filename template come from the resolved overlay, so Deal B's package differs from Deal A's with no code change.

## 3. Phase 6: the scorecard

1. **`pnpm eval`,** mock mode, one command. It ingests all three deals and every batch through the real pipeline, resolves the review queue with truth values, evaluates, and compares with truth. It writes `eval/latest.json` and `eval/scorecard.html`: one page with the gate table below, a row per planted item (caught, missed, wrongly raised) and a row per trap. It states at the top that mock results say nothing about model quality.
2. **Regression.** Compare with `eval/baseline.json`. Fail on a drop of more than 2 points in status accuracy or planted-item recall, on any false satisfied, or on any trap raised. Only a passing run can become the baseline.
3. **`pnpm eval:live`** per A53. Deal C and Deal A batch 1. It writes a separate `eval/live.json` and a second section on the scorecard: fact accuracy by method, classification accuracy on scans, review items per deal, false accepts, cost and wall-clock time per deal. After simulated review, false satisfied must be 0; if it is not, list it as a release blocker.

| Gate, mock mode                                                   | Required     |
| ----------------------------------------------------------------- | ------------ |
| Segment type accuracy                                             | at least 95% |
| Bundle boundary accuracy                                          | at least 90% |
| Party and period assignment                                       | at least 90% |
| Rule-feeding fact accuracy, `acroform` and `text`                 | at least 95% |
| Quote found in its cited block                                    | at least 98% |
| Checklist status accuracy after review                            | at least 95% |
| Planted items caught: missing, stale, incomplete                  | at least 95% |
| Planted items caught: conflicts                                   | at least 90% |
| Finding precision                                                 | at least 80% |
| Traps raised                                                      | 0            |
| **False satisfied, before and after review**                      | **0**        |
| Same input gives the same evaluation hash                         | pass         |
| Overlay changes the checklist and the package with no code change | pass         |

## 4. Proof

- **Lifecycle, on Deal A:** after batch 1 and review, persisted checklist and findings equal truth. Generate snapshot 1. Mark the seller-side request as sent; those findings become `requested`. Ingest batch 2 and record the citizenship manual confirmation. Exactly the three expected findings become `resolved`, each naming what resolved it. Snapshot 2's diff lists those three, the documents added and the Form 1919 superseded.
- **Package contents:** every renamed copy has the same SHA-256 as its original. Index rows equal checklist rows. Source-record rows equal current accepted facts. Footer present. No identifier pattern anywhere in the report or workbook. The banned-term lint passes on authored text and skips quoted evidence.
- **Requests:** every open finding for a party appears once in that party's draft and nowhere else. No draft contains a banned term.
- **Dismiss and waive** need a reason, appear in the change log, and a waived row counts as waived in readiness.
- **Roles:** a viewer cannot change anything and cannot open originals.
- **Browser tests, three only:** the Deal A lifecycle above through the screens; Deal B's package naming; the viewer restrictions.
- **Commands that must pass:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm rules:check`, `pnpm fixtures:check`, `pnpm fixtures:generate --check`, `pnpm eval`, `pnpm build`.

## 5. Not in these phases

Visual design, copywriting polish, navigation redesign, demo seed, walkthrough, public demo changes, deployment, the pilot runbook. Everything in A51.

## 6. Report, then stop

Write `docs/phase-5-6-proof.md`, one page. Update `docs/PROGRESS.md`. Commit Step 0, Phase 5 and Phase 6 separately, and push. Then report, briefly:

1. the gate table with measured numbers;
2. the planted-item and trap table;
3. the Deal A lifecycle result;
4. what is in a package, with one sample tree;
5. the live result, or that it was skipped;
6. what you left out under A45, and dependencies removed;
7. command results;
8. a plain list of every screen that now exists, its route and what it is for. Phase 7 starts from this list;
9. anything in the spec or amendments you believe is wrong.

Do not start Phase 7.
