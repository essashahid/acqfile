# Phase 1 proof — domain core

Date: 2026-09-19. Base: accepted Phase 0 commit `b586d9c`. Repository: private `essashahid/acqfile`, origin `https://github.com/essashahid/acqfile.git`. Phase 2 is not started. Real-data mode remains false. No live model calls, spend, deployment or EvidenceOps writes.

## Built

- Load-validated taxonomy and fact catalog; typed profile, parties, ownership, segments, evidence locators and manual facts.
- Additive SQL/Drizzle domain schema: deals, parties, ownership_links, segments, facts, rule_pack_snapshots, evaluations, checklist_status, findings and events; nullable documents.deal_id. Same-deal foreign keys/guards, constrained values, indexes and immutable audit/pack records. No findings lifecycle implementation or Phase 5 tables.
- Two independent SOP YAML packs, Sample Lender A overlay, strict loader, safe AST, canonical hashing and idempotent exact-content snapshot persistence.
- Pure evaluation with all 12 check types, all eight scopes, calendar/statement periods, three-valued logic, explicit waivers/manual confirmations/tracking, pack selection, inclusive 14-day boundary flag, stable finding keys and result hashes.
- Authenticated read-only `/rulepacks` viewer with two-configuration comparison, effective parameter differences, source links and unverified labels. [Browser screenshot](screenshots/phase-2-rulepacks.png).
- `rules:check` and `rules:export-review`; [XLSX](RULEPACK_REVIEW.xlsx) and [HTML](RULEPACK_REVIEW.html) cover all four resolved configurations, with empty SME correction columns and the required footer.

## Decisions

[DECISIONS.md](DECISIONS.md), entries 12–31, records every new choice and reason. Material choices:

- Sample Lender A requires TXN-10a and TGT-11. TXN-10b/c and TGT-12a/b/c remain defined but not required, per the user's direction. Small implementation choices are decided and recorded without asking.
- Split business plan/projections and AR/AP as well as the explicitly named composites. Shared signatures are segment metadata. Classification-only evidence can carry validated manual facts, without adding extraction.
- Fixed evidence inventory prevents deletion from becoming silent conflict resolution; missing inventory members conservatively make active rows need review. This additional input is needed to make the unconditional monotonic-removal requirement meaningful.
- Unknown dominates row dependencies. A received lender tracking state can satisfy a tracking row with actor/note. Optional rows remain not applicable. Conditional QOE/real-estate rows win over the conflicting generic tracking sentence.
- USD 1 arithmetic tolerance, exact purchase-price comparison, 1% revenue difference, calendar years/months, immutable masked identifier values. HMAC/scrubbing helpers are not wired into the legacy extraction pipeline before Phase 4.
- Vendor-pinned SheetJS 0.20.3, yaml 2.9.0; official source citations use honest section-start TOC pages where precise paragraph pagination is unavailable.

## Pack differences

| Behavior                   | SOP 50 10 8                                    | SOP 50 10 8.1                                                                            |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Loan-number date           | 2025-06-01 through 2026-09-30                  | On/after 2026-10-01                                                                      |
| TXN-08 valuation           | Manual lender confirmation plus tracking       | Tracking always applicable                                                               |
| TXN-09 QOE                 | Absent                                         | Initial acquisition/business expansion, business price >= USD 3 million; lender tracking |
| CON-14 consulting duration | 12 months                                      | 24 months                                                                                |
| CON-07 limited sources     | Seller standby note alone                      | Seller standby note + other standby debt + minority-investor equity                      |
| CON-07 comparator          | Half of 10% of project cost, for lender review | Same baseline, for lender review                                                         |

Sample Lender A changes interim freshness from 120 to 60 days, adds two required rows and five inactive optional definitions, and uses `SLA_{party}_{item_id}_{doc_label}_{period}{original_extension}`. No engine code branches on Sample Lender A or a CON id.

## Sources and limitations

[Complete rule-by-rule source inventory](RULE_SOURCES.md), including download SHA-256 fingerprints, section citations and links. All rules remain `verified: false`.

- **Official SOP in both packs:** GUA-01 (financial statement), TGT-10a (franchise), TXN-05 (standby), TXN-08 (valuation), CON-06/07 (standby/equity), CON-14 (consulting). Version 8.1 additionally sources TXN-09 (QOE) to Appendix 15.
- **Official form:** TXN-07, Form 159 signature/date blocks, PDF p.3. This is the supplied historical form, not a current-revision claim.
- **Secondary in both:** ENT-01/02/03; GUA-02/06/08a/08b/08c/09a/09b/09c; TGT-01/02/03/05/07a; TXN-02. ENT-01 cites StatementsReady for revision/listing context; the others cite Pioneer Capital Advisory's documentation checklist. Exact numeric conventions beyond these sources are explicitly identified as seed conventions.
- **Internal consistency:** CON-01/02/03/04/05/08/09/10/11/12/15/16. Remaining base rules and all Sample Lender A definitions are explicitly synthetic lender conventions, not falsely attributed SOP requirements.

[RULE_CANDIDATES.md](RULE_CANDIDATES.md) contains the entire unresolved list: citizenship determination/legal-challenge status/entity-owner handling; the form's minimum ownership-list coverage versus the stricter 100% seed; category-specific equity requirements/exceptions; valuation/ESOP exception handling; fiscal-year tax coverage; purported universal IRS/lease/account-history thresholds; automated license/franchise/signature/citizenship interpretation; and real-lender Sample Lender A policy authenticity. These proposed regulatory determinations are not implemented. The requested preparation checks remain visible and unverified.

The spec's fixed 10% equity baseline and universal valuation/consulting wording simplify category-dependent SOP provisions. Its 100% Form 1919 comparison is stronger than the cited minimum listing coverage. Its always-listed tracking sentence conflicts with its explicit QOE/real-estate applicability. Its unconditional removal invariant needs an evidence inventory or equivalent retained provenance. These limitations are explicit rather than silently treated as established policy. Fiscal-year filers are out of scope under A13.

## Registry and rule counts

| Configuration             | Document types | Fact attributes | Checklist definitions | Consistency | Total rules |
| ------------------------- | -------------: | --------------: | --------------------: | ----------: | ----------: |
| SOP 8                     |             52 |              79 |                    50 |          16 |          66 |
| SOP 8.1                   |             52 |              79 |                    51 |          16 |          67 |
| SOP 8 + Sample Lender A   |             52 |              79 |       57 (5 inactive) |          16 |          73 |
| SOP 8.1 + Sample Lender A |             52 |              79 |       58 (5 inactive) |          16 |          74 |

The taxonomy contains 25 extracted and 27 classification-only types. Required definition counts include conditional rules; they are not counts of applicable requirements on an individual deal.

## Proof evidence

45 hand-authored scenario cases across clean, defects, unknowns, traps and packs. Clean evaluates the complete pack and produces zero findings with every applicable row satisfied. Focused defect cases fail every check type and every CON rule. Expected rows and finding ids are literal authored data, never generated from engine output.

- Exact checklist expectations provide the no-false-satisfied gate.
- 4,319 individual segment/fact deletions across all scenarios never create a satisfied row.
- Pending consumed facts need review; catalog fields unused by a rule do not contaminate that rule.
- Repeated and reversed input arrays, including profile source arrays, preserve result hashes.
- Engine, expression and input modules contain no system-clock reads, randomness, database access or I/O.
- Extra cases cover indirect owners, implicit guarantors, affiliates, paid agents, mismatched financial periods, unrelated documents, duplicate conflicting attestations, latest-year extensions, masked identifiers, manual evidence, boundary dates, overlay add/remove/set failures, source validation and spreadsheet formula safety.
- Database tests verify exact snapshot deduplication/immutability, manual audit requirements, masked-value constraints, page/confidence constraints, same-deal references and blocked reassignment of documents with segments. The inherited extraction/review tests remain green.
- Browser verification: page loads, meaningful content, all 67 base rules present, no framework overlay or browser errors. Playwright changes both pack/overlay controls and inspects the resulting comparison.

## Command results

| Exact command              | Exit | Result                                                                                 |
| -------------------------- | ---: | -------------------------------------------------------------------------------------- |
| `pnpm lint`                |    0 | Clean, no warnings                                                                     |
| `pnpm typecheck`           |    0 | Route types generated; TypeScript clean                                                |
| `pnpm test`                |    0 | 111 tests, 13 files; includes all 43 retained Phase 0 unit tests                       |
| `pnpm test:integration`    |    0 | 20 tests, 5 files; includes all 15 retained Phase 0 integration tests                  |
| `pnpm test:e2e`            |    0 | 7 Chromium tests; includes all 6 retained Phase 0 E2E tests                            |
| `pnpm rules:check`         |    0 | Both packs and both Sample Lender A resolutions validate; 52 types, 79 fact attributes |
| `pnpm rules:export-review` |    0 | XLSX and HTML written for four resolved configurations                                 |
| `pnpm db:migrate`          |    0 | Additive migration applied to local acqfile                                            |
| `pnpm build`               |    0 | Production build passes, including `/rulepacks`                                        |

No deployment or hosted Supabase connection is part of this proof; conditional Supabase RLS migrations are skipped on plain local PostgreSQL. The 0008 policy/revoke script therefore remains unexercised against hosted Supabase. CLI logs from this run are `/tmp/acqfile-phase1-{lint,typecheck,test,integration,e2e,rules-check,export,migrate,build}.log`.

The final GitHub read unexpectedly reported public visibility. Restored the specification’s required private visibility through the GitHub API before committing/pushing, scoped only to `essashahid/acqfile`. No reason for the visibility drift is inferred.

The staged whitespace check reports the final blank line preserved in SPEC_AMENDMENTS.md. It is intentionally retained to keep Section 0 verbatim; the byte-for-byte amendment comparison passes and the original SPEC hash is unchanged.

A19 refresh: the viewer screenshot now uses Sample Lender A and example.com demo contacts. The original Phase 1 capture remains in its accepted Git commit.
