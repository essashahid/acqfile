# Phases 5 and 6 proof — 2026-09-20

Repository: **PUBLIC**, unchanged. Step 0 `1750547`; Phase 5 `274cf3b`; Phase 6 this commit. **Mock results say nothing about model quality.** [Scorecard](../eval/scorecard.html) contains every planted-item/trap row; [raw results](../eval/latest.json) contain files, batch comparisons and regression details; [baseline](../eval/baseline.json) is passing.

| Gate                                            | Measured                        | Required  |
| ----------------------------------------------- | ------------------------------- | --------- |
| Segment type / party and period                 | 141/141 each (100%)             | 95% / 90% |
| Bundle boundaries                               | 99/99 (100%)                    | 90%       |
| Rule-feeding acroform / text facts              | 14/14 (100%) / 172/177 (97.18%) | 95% each  |
| Quote in cited block                            | 194/196 (98.98%)                | 98%       |
| Checklist after review                          | 295/295 (100%)                  | 95%       |
| Missing/stale/incomplete / conflict plants      | 12/12 / 11/11 (100%)            | 95% / 90% |
| Finding precision                               | 44/44 (100%)                    | 80%       |
| Traps raised / false satisfied before / after   | 0 / 0 / 0                       | 0 each    |
| Same-input hash / overlay checklist and package | pass / pass                     | pass      |

**Plants/traps:** 34/34 deal-specific cases caught, covering all 25 numbered items plus B-LIMITED; none missed or wrongly raised. Name normalization, rounding and superseded-stale traps are clear in both A batches. All four reviewed batches exactly match authored checklist/findings. Baseline regressions reject >2-point drops, any false satisfied or trap; failing runs cannot become baseline. Report and scorecard each print on one A3 page.

**Lifecycle/package:** A1 snapshot and seller request → A2 plus citizenship confirmation resolves exactly ENT-01, GUA-02/alex/2024, GUA-05/bea with evidence references. Snapshot 2 adds three documents and supersedes Form 1919. Dismiss/waive require reasons and appear in audit/change log; waived rows count in readiness; returning conditions reopen findings. ZIP copies retain original SHA-256; A2 has 78 index rows, 125 current accepted source facts, 58 copies; all five workbook tabs carry the footer, identifiers are masked, authored banned-term lint skips evidence quotes. Viewer writes/original access denied. Example: `00_Package_Report.html`, `00_Package_Workbook.xlsx`, `01 Transaction/SLA_Quenby-Grounds-Management-LLC_TXN-02_PURCHASE_AGREEMENT_no-period.PDF`.

**Commands:** `pnpm lint`, `typecheck`, `format:check`, `test` (136), `test:integration` (16), `test:e2e` (3), `rules:check`, `fixtures:check`, `fixtures:generate --check`, `eval`, `build`: **all pass (exit 0)**. `eval:live`: skipped, owner key absent, $0; preflight and per-call reservation enforce the $5 budget. No model-quality claim.

**Decisions/cuts:** compact HTML plus detailed workbook; requests grouped by role/subject; event-ID snapshot diffs; existing signed/audited original-access policy; baseline replacement explicit. Prettier added; nine unused dependencies removed (six Radix packages, TanStack Table, Recharts, MSW); JSZip moved to runtime unchanged. No design, demo seed, deployment, PDF exports, model requests or extra dashboard. Harness path/party-name expectations and a test assertion typo were corrected; fixture truth and rules were unchanged. No new specification contradiction; A47/A51 supersede the older deliverable list.

**Screen inventory** (`:d` = deal ID): `/login` sign-in; `/` redirects to `/deals`; `/deals` list; `/deals/new` create profile; `/deals/:d` profile, intake, review/failed files and readiness; `/deals/:d/files/:version` filing, source/page view; `/deals/:d/segments/:segment/review` facts/gaps; `/deals/:d/checklist` grouped rows/attestations; `/deals/:d/findings` evidence/actions/filters; `/deals/:d/requests` copy/mark sent/aging; `/deals/:d/package` snapshots/diffs/ZIP; `/rulepacks` rule viewer; `/how-it-works` explanation. **Phase 7 not started.**
