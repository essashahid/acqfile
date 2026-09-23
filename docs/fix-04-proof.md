# Fix 04 — realistic synthetic demonstration cases

Implemented against the current checkout, preserving the earlier values, portal and readiness repairs. No deployment, real borrower data, automatic email, new credentials for live providers, or lending-rule changes.

## What changed

- Eight static case definitions, one staff selector, short situation/mode labels, and normal deal navigation. A database lookup supplies each marked case's current deal ID; no scenario table or completion controls.
- Explicit sample-environment, workspace and staff checks on selector and seed/reset operations. A per-case advisory lock serializes setup. Seed reruns preserve finished work; interrupted setup is reported. Reset archives exactly one marked generation, revokes its links, preserves original evidence/snapshots, and seeds a fresh generation. Unmarked targets and other workspaces are refused.
- Shared synthetic baseline with 81 unique authored document variants, correction ZIPs, official forms, text PDFs, raster PDFs/ordered PNGs, DOCX and XLSX. Evaluation date is 2026-09-15. Expected outcomes are authored separately in `fixtures/demo/EXPECTED.md`; runtime only reads prepared candidates at the explicit mock boundary.
- D05's initial reopened consulting reading and D06's historical price answer use normal domain actions. D07 uses the existing local processing-failure adapter. No new case uses `reviewTruth`, direct acceptance writes, `demo:b-ready`, or seeded completed exports.
- A separate U01 packet is absent from the mock lookup. Its test-only expected facts are not runtime imports.

## Focused repairs exposed by the walkthrough

1. Re-downloading a historical ZIP changed its auto-created directory timestamps. Normalize every archive entry to the existing fixed export timestamp. A regression advances the clock by a day and compares bytes; D08 also re-downloads the earlier version after new evidence blocks current readiness.
2. A reopened consulting duration produced a `needs_review` finding with no adviser clarification. The portal now presents the existing consulting clarification for this unresolved finding as well as a numeric conflict. It does not accept the reading, rewrite source evidence or alter the pack's 12-month parameter. Unit and D05 browser checks cover it.

D02's authored agreement now includes its own 1-of-2 / 2-of-2 numbering inside the six-page packet. The operator corrects the parser's proposed boundaries. The unrelated business remains outside the deal; its assignment finding is explicitly dismissed with a reason through the existing screen, without a fake party assignment or waiver.

## Verification on 2026-09-23

All application checks used a disposable PostgreSQL 17 cluster on localhost port 55441, separate browser/regression databases, local auth/storage, inline processing and prepared mock extraction. The normal workspace database and `.env.local` were not changed. No live calls were made.

| Check                                         | Result                                                                                                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full unit suite                               | 240 passed                                                                                                                                                                                                                                         |
| Full integration suite                        | 48 passed; final demo seed/isolation suite repeated after D02 fixture change: 5 passed                                                                                                                                                             |
| New browser suite, freshly reset marked cases | 9 passed: eight seeded cases and the deliberately limited U01 fallback                                                                                                                                                                             |
| Existing browser regressions                  | 13 passed, including roles, recipient isolation, prior value corrections and preparation/export behavior                                                                                                                                           |
| ESLint, customer-copy check, TypeScript       | Passed                                                                                                                                                                                                                                             |
| Production build                              | `next build --webpack` passed; default Turbopack build not rerun in this pass                                                                                                                                                                      |
| Rules checks                                  | All four unchanged configurations pass; 52 document types, 79 attributes                                                                                                                                                                           |
| Existing fixture checks                       | Five independent oracles and readability/synthetic-data checks pass (94 files)                                                                                                                                                                     |
| Mock evaluation                               | All 15 unchanged gates; 371/371 statuses, 34/34 plants, zero false-satisfied; $0 live spend                                                                                                                                                        |
| New fixture regeneration                      | 124 generated files compared by SHA-256 before/after regeneration: identical                                                                                                                                                                       |
| Existing fixture regeneration                 | Known inherited failure: `generate-deal-fixtures.ts --check` reports protected Deal A PDF byte-length drift (3,645 generated / 3,634 committed). Existing corpus and accepted baseline left unchanged. See Fix 01 proof for baseline reproduction. |
| Visual check                                  | Staff selector inspected at 1440×1000; eight cases plus placeholder; no browser page errors. [Screenshot](screenshots/fix-04/demo-selector.png)                                                                                                    |

The machine did not expose `pnpm` or `agent-browser` on PATH. Equivalent commands used installed Node entry points (`node --import tsx`, Vitest/Playwright/Next CLIs); browser checks used Playwright with installed Chrome against the production server. Existing regression screenshots were restored after tests; the new selector screenshot is retained. Browser test account provisioning is confined to the test database.

## Practical limits

- These are prepared demonstrations, not live extraction accuracy measurements. Real parsing runs, but labelled known candidates supply many readings. D07 proves local application recovery, not hosted-worker/network resilience.
- U01 intake, manual type/party/2024-period filing corrections and an explicitly incomplete export work through screens. Generic fallback does not offer manual price entry for this agreement, so full value correction and the price-conflict outcome remain unverified. No database fact insertion or hidden answer lookup was used to bridge that gap. **Live reading and human source review: NOT VERIFIED.**
- D03 reuses prior focused tests for invalid 90/90 ownership, valid 60/40 ownership, signed/unsigned values, read-only denial and coherent funding-row edits. Its new browser journey verifies reopening, replacement and retained old/new history.
- D02/D05/D07 were walked through with browser automation and kept as regressions. Human operator time, unnecessary requests, missed-issue rates and export usability judgments remain unmeasured. Reports/workbooks were parsed outside AcqFile; this does not substitute for lender/customer review.

The [operator guide](DEMO_CASES.md) contains reset scope, all eight scripts, the results table and the U01 instructions. Suggested meeting order: D01 → D04 → D06. Stop at this authorized follow-up boundary; customer readiness and policy correctness are not established by these checks.
