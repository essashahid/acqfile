# Fix 03: preparation readiness and usable lender files

Implemented September 23, 2026 from `769a903` (the Pass 2 correction). Pass 1 parsing/correction rules and Pass 2 upload/question policies are preserved. No new scenarios, hosting infrastructure, deployment or real borrower data. `REAL_DATA_MODE=false`; synthetic fixtures and mock extraction only.

## Business boundary awaiting Asif

The visible label is **Illustrative checklist, awaiting lender review**. Both shipped packs explicitly defer TXN-05 (standby agreement), TXN-08 (valuation), TXN-09 where present (quality of earnings), RE-02 (appraisal), RE-03 (environmental), LND-01 (credit reports), LND-02 (IRS transcripts), LND-03 (lien searches) and LND-04 (insurance) to later lender work. Every other shipped rule, including all sample-overlay additions and consistency rules, belongs to preparation. Applicability still follows the existing rules.

Asif must validate that exact division, actual provider responsibilities and any lender-specific prerequisites. Lender ownership alone never defers a requirement: changing its configured stage to preparation makes it block readiness. No lender has confirmed acceptance of this boundary or these exports.

## Changes and evidence

- One shared preparation result serves staff, adviser, snapshots and download authorization. It checks required preparation rows, material findings, unknown stage/provider, unfinished relevant filing/value reviews and processing, plus a fingerprint of the evaluated evidence and rule pack. Migration `0015_evaluation_input.sql` adds the fingerprint; existing evaluations need reevaluation.
- Later work retains its actual outstanding status. Waivers and not-applicable decisions retain separate status/reason fields. Authorized staff can still create an explicitly incomplete version. Read-only Reviewers cannot download original-containing ZIPs.
- Current adviser downloads require preparation readiness. Previously prepared versions remain selectable as dated historical records after a change makes the current deal unready. Integration tests compare the earlier ZIP bytes before and after a supported correction and a new upload; the frozen source record retains the old fact reference.
- Existing ZIP/HTML/XLSX formats remain. The workbook adds Segment locations and Status summary. Conflicts have a readable question/description and source values, pages, quotations and package paths. Missing items show the actual provider role separately from the subject. Original bundles remain byte-identical, with original and output page ranges explicitly shown.
- The synthetic export proof uses a six-page bundle with segments on pages 1–2, 3–4 and 5–6; a buyer document assigned to a broker; and an actual source-supported $3.7m versus $3.6m purchase-price conflict. Assertions inspect named workbook columns, actual rows and packaged original bytes. A same-value correction tests that provenance/revision changes invalidate freshness even when the old value-only hash would match.
- The browser proof starts with one operator confirmation outstanding, completes it through the requirements screen, checks preparation and later-work status, then downloads as the adviser and opens the ZIP/workbook.

## Local verification

macOS, Node 25.6.1, pnpm 10.30.0, disposable PostgreSQL 17 on port 55440 and Chromium. The normal database was not reset. Existing fixture expectations, evaluation gates and Pass 1/2 assertions remain unchanged. The existing workbook test adds the two new tab names. The empty-file browser assertion now expects “Preparation work outstanding” instead of “Work outstanding”, explicitly naming the new business boundary while retaining its not-ready check and all other assertions.

| Check                      | Actual result                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                       | 230 passed, 20 files                                                                                                                                                       |
| Integration                | 43 passed, 14 files                                                                                                                                                        |
| Browser                    | 11 existing journeys passed in the full run; two failed on new test setup / renamed status text. After those test fixes, both focused journeys passed (13 total verified). |
| Typecheck / lint / format  | Passed.                                                                                                                                                                    |
| Rule validation            | Passed: all four base/overlay combinations, 52 document types, 79 facts                                                                                                    |
| Fixture checks             | Passed: all five batch oracles and synthetic readability                                                                                                                   |
| Evaluation                 | All 15 unchanged gates passed; 371/371 statuses; 34/34 plants; zero false-satisfied results. Baseline unchanged.                                                           |
| Default production build   | Turbopack failed with an environment `EPERM` while binding a worker port                                                                                                   |
| Webpack production build   | `pnpm build --webpack` passed, including compilation, TypeScript, static generation and build traces.                                                                      |
| Fixture regeneration check | Failed on the unchanged protected Deal A formation PDF, cascading to ZIP/truth hashes; the same inherited failure is documented in the Pass 1 proof                        |

The fixture generator and expected hashes were not changed to conceal the regeneration failure. A nondeveloper can inspect the report/workbook for clarity; that does not establish lender acceptance.
