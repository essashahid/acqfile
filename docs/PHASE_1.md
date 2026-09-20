# PHASE 1: Domain core (schema, rule packs, deterministic engine)

Phase 0 is accepted at commit `b586d9c`. Do Phase 1 only. Stop at its proof and report. Do not start Phase 2.

## 0. First, record these rulings

Save this section verbatim as `docs/SPEC_AMENDMENTS.md`. Where an amendment conflicts with `docs/SPEC.md`, the amendment wins. Add the file to the pointers in `AGENTS.md` and `CLAUDE.md`. Your Phase 0 resolutions in `docs/DECISIONS.md` are accepted unless changed below.

- **A1. Phases.** There are eight phases, 0 to 7. The table in Section 23 is authoritative.
- **A2. Real data.** Accepted as you proposed. `REAL_DATA_MODE` stays false for the whole build. The Phase 7 runbook documents a later, separately authorized step. It enables nothing.
- **A3. Package filenames.** The default template is `{item_id}_{doc_label}_{party}_{period}{original_extension}`. Original bytes and extensions are preserved. Nothing is converted to PDF. The footer goes on generated reports, generated sheets and the package manifest only, never on supplied originals.
- **A4. CON-16** is finding type `needs_review` with severity `major`.
- **A5. Scopes.** A rule item uses one of: `deal`, `buyer_entity`, `target_business`, `per_guarantor`, `per_owner_or_guarantor` (every direct and indirect owner plus every guarantor), `per_affiliate`, `per_equity_source`, `per_paid_agent`. A row may also carry a period requirement such as `last_three_tax_years` or `last_three_fiscal_year_ends`. GUA-05 is `per_owner_or_guarantor`.
- **A6. No composite rows.** One checklist row accepts one kind of evidence. Split every composite into lettered rows: GUA-08a gift letter, GUA-08b donor account statement, GUA-08c transfer evidence; GUA-09a affiliate returns, GUA-09b affiliate interim financials, GUA-09c affiliate debt schedule; TGT-07a lease, TGT-07b assignment, landlord consent or new lease terms; TGT-08a equipment list, TGT-08b inventory summary; TGT-10a franchise agreement, TGT-10b franchise disclosure document; and the overlay-only rows TXN-10 and TGT-12 the same way. Where one row needs two statements of the same document type (an income statement and a balance sheet), the row is satisfied only when the named facts from both are present for the period. An unrelated document must never satisfy a row.
- **A7. Taxonomy additions,** all classification-only: `SBA_155`, `TRANSFER_EVIDENCE`, `FRANCHISE_DISCLOSURE`, `LEASE_CONSENT`, `INVENTORY_SUMMARY`, `KEY_CONTRACT`, `EMPLOYEE_ROSTER`, `TAX_EXTENSION`, `APPRAISAL`, `ENVIRONMENTAL`. A donor's statement is a `BANK_STATEMENT` segment assigned to a party with role `donor`.
- **A8. Deal profile additions.** `premises` (`leased`, `owned`, `none`, `unknown`). `paid_agents[]` (name, role, paid by, amount if known). `equity_sources[]` (party; kind: `cash`, `gift`, `seller_standby_note`, `other_standby_debt`, `minority_investor_equity`, `other`; amount; source account last four where relevant). Per guarantor, `jointly_held_assets` (`yes`, `no`, `unknown`). Any profile field may be `unknown`.
- **A9. Three-valued logic.** Every condition and every check evaluates to `pass`, `fail` or `unknown`. An `unknown` anywhere makes that row `needs_review`. An `applies_when` that is `unknown` yields `needs_review`, never `not_applicable`. A fact that is pending review is `unknown`.
- **A10. Signatures.** Signed and dated indicators are segment metadata for every document type, including classification-only types. `signed_and_dated` reads that metadata. A null or uncertain indicator is `unknown`.
- **A11. Limited-source arithmetic.** Pack `sop-50-10-8-1` carries CON-07 as written. Pack `sop-50-10-8` carries CON-07 for the seller standby note alone. Both read "for lender review".
- **A12. Expressions.** No infix strings. Conditions and arithmetic are a small validated tree in YAML. Allowed operators: `and`, `or`, `not`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `+`, `-`, `*`, `/`, `in`, `exists`, `sum`, `min`, `max`, `abs`, `days_between`, `add_days`, `add_years`. Operands are literals, `{fact: ...}`, `{profile: ...}`, `{param: ...}` or `{as_of: true}`. Tolerances are parameters beside the expression. An unknown operator fails pack validation. Nothing is ever passed to `eval` or `Function`.
- **A13. Tax years.** The expected years are the three most recent calendar years that ended before the as-of date. For the latest of those years only, a `TAX_EXTENSION` segment for that year makes the row `received_with_issues` with an `info` finding "latest year on extension". Fiscal-year filers are out of scope for v1. Record that as a limitation.
- **A14. Manual entries.** Confidence 1.0 bypasses nothing. A manual fact still needs a locator, an actor, passing validators and an audit event.
- **A15. Identifiers.** Code, not a model, reads full SSNs, EINs and account numbers by pattern from the text layer and from AcroForm values, computes the keyed HMAC and last four, and discards the clear value. Models are asked for the last four only. Identifier patterns are scrubbed from stored model payloads. Tables created in this phase store the HMAC and last four only.
- **A16. `source_ref` is structured:** `class` (`sop`, `sba_form`, `cfr`, `secondary`, `lender_convention`, `internal_consistency`), `citation`, optional `url`. The last two classes need no URL. Everything stays `verified: false`.
- **A17. The rule-pack review sheet moves from Phase 5 to this phase,** as XLSX and HTML. The PDF version joins in Phase 5.
- **A18. Tables `requests`, `snapshots` and `work_log`** are created in Phase 5 with their features, not now.

## 1. Build

1. **Two registries,** as typed config validated at load. The document taxonomy (Section 9 plus A7). A **fact catalog**: every fact attribute with its value type, unit, subject kind, period kind and the document types that can produce it, starting from the table in Section 12. Rules, fixtures and extraction schemas will all reference these two registries, so nothing can name a type or a fact that does not exist.
2. **`DealProfile`** Zod schema (Section 10 plus A8), and the parties and ownership model.
3. **Migrations** for `deals`, `parties`, `ownership_links`, `segments`, `facts`, `rule_pack_snapshots`, `evaluations`, `checklist_status`, `findings`, `events`, and a nullable `deal_id` on documents. Do not refactor the inherited extraction and review pipeline in this phase. It keeps its current tables until Phase 4, and its tests stay green.
4. **Rule packs:** `rulepacks/sba7a-cho/sop-50-10-8.yaml`, `rulepacks/sba7a-cho/sop-50-10-8-1.yaml` and `rulepacks/overlays/northfield-bank.yaml`. Author every seed row and consistency rule from Section 13 in both packs, amended as above. Read the official SOP 50 10 8 and 8.1 and cite section and page wherever you can. Otherwise use the appendix sources. Anything you cannot source goes in `docs/RULE_CANDIDATES.md`, not in a pack.
5. **Loader:** Zod validation, overlay merge (add, remove, set by id), canonical JSON, content hash, snapshot persistence.
6. **Engine:** one pure function. Input: profile, parties, ownership, confirmed segments with their metadata, accepted facts, pending facts, tracking states, manual confirmations, waivers, the resolved pack and the as-of date. Output: checklist rows, findings with a stable `finding_key`, and a result hash. No database, clock, randomness or I/O inside it. Implement every check type in Section 13, scope expansion, pack selection by expected loan number date, and the 14-day boundary finding.
7. **`pnpm rules:check`:** schema valid; ids unique; every accepted type exists in the taxonomy; every fact exists in the catalog; every profile path exists in `DealProfile`; allowed operators only; every rule has a `source_ref` and a `verified` flag; overlay targets exist; both packs and the overlay resolve; banned-term lint over titles and messages. Non-zero exit on any failure.
8. **`pnpm rules:export-review`:** one row per rule in the resolved pack, with a plain-English description, scope, parameters, source, verified flag, which pack it belongs to, and an empty "SME correction" column. XLSX and HTML. Verify the XLSX library against its vendor documentation before adding it.
9. **Rule-pack viewer:** read-only. Choose a pack and an overlay. Show unverified markers, sources and parameters. Include a side-by-side comparison of two resolved packs that lists added, removed and changed rules.

## 2. Proof

Hand-written JSON scenarios under `tests/fixtures/engine/`, each with its expected checklist and findings:

- `clean`: a small complete deal. Every applicable row satisfied. Zero findings.
- `defects`: every check type and every consistency rule fails at least once.
- `unknowns`: pending facts, `unknown` profile fields, null signature indicators. Every affected row is `needs_review`.
- `traps`: "Harborview HVAC, LLC" against "Harbor View HVAC L.L.C."; totals that differ by rounding within tolerance; a superseded document that would have been stale. Zero findings from these.
- `packs`: the same deal under 8 and under 8.1 (the valuation row, the quality of earnings row, the consulting limit and the CON-07 variant differ), and under the Northfield overlay (interim window of 60 days, two added rows, a different filename template) with no code change.

Invariant tests:

- **No false satisfied.** Across all scenarios, no row is `satisfied` where the expectation is anything else.
- **Monotonic evidence.** Removing any segment or fact never moves a row toward `satisfied`.
- **Pending never satisfies.** A pending fact never satisfies a row.
- **Determinism.** The same input gives the same result hash. Shuffled input order gives the same hash. No test reads the system clock.

Commands that must pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm rules:check`, `pnpm build`. The retained Phase 0 suites stay green.

## 3. Not in this phase

Fixture generators, intake, parsing, classification, extraction changes, entity resolution, deal screens other than the pack viewer, findings lifecycle persistence, requests, snapshots, package exports, live model calls, deployment.

## 4. Report, then stop

Write `docs/phase-1-proof.md`, update `docs/PROGRESS.md`, commit with "Phase 1" in the message, and push. Then report:

1. what was built;
2. new entries in `docs/DECISIONS.md`;
3. the differences between pack 8 and pack 8.1 as implemented, as a table;
4. which rules are sourced to the official SOP with section and page, which rest on secondary sources, and everything in `docs/RULE_CANDIDATES.md`;
5. registry counts: document types, fact attributes, rules per pack;
6. exact command results;
7. anything in the spec or in these amendments you believe is wrong.

Do not start Phase 2.
