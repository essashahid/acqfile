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



## Phase 2 rulings (2026-09-19)

- **A19. Names.** "Northfield Bank" is a real FDIC-insured bank. Remove the name everywhere: the overlay file, its display name, the `NF_` filename prefix, tests, scenario fixtures, docs, the viewer and the review exports. The overlay becomes `rulepacks/overlays/sample-lender-a.yaml`, display name "Sample Lender A", prefix `SLA_`. Re-run `pnpm rules:export-review` afterwards so no exported sheet carries the old name. Every organization in fixtures, tests, seeds and screenshots must be invented: businesses, banks, CPA and law firms, landlords, valuation firms, and the franchise brand in Deal C. Use coined words, not plausible real names. Defaults: Deal A "Varnholt Climate Services", Deal B "Quenby Grounds Management", Deal C "Ostrel Fitness" under the invented franchise brand "Ostrel". If you have web access, search each organization name once and replace any that matches a real business or bank. Rename the Phase 1 trap pair to the same kind of variation (spacing, punctuation, suffix style) on the new Deal A name. Person names come from the seeded Faker. Addresses use invented street and town names. Phones use 555-01xx. Emails use example.com.
- **A20. Arrival batches.** A deal's documents arrive in batches. Deal A has batch 1 (the initial mess) and batch 2 (exactly three fixes). Deals B and C have one batch. Truth states the expected checklist and findings after each batch, and names the three findings that batch 2 resolves.
- **A21. Truth is independent.** Expected results are authored in the deal plan. They are never produced by calling the evaluation function, the parser or any model. You may reuse schemas, registries, normalizers and the finding-key helper. When the engine and truth disagree, investigate which side is wrong and fix that side. Never copy engine output into truth.
- **A22. Raster stability.** Text PDFs, DOCX, XLSX and ZIPs must be byte-identical on regeneration. If rasterized scans are not byte-stable across machines, the committed raster files are canonical, verified by manifest hash, and the generator re-rasterizes only with `--rebuild-scans`. Record what you observed.
- **A23. Planted item 25.** One guarantor's latest tax year is on extension: a `TAX_EXTENSION` segment for 2025 and no 2025 return. Expected: `received_with_issues` and an `info` finding, per A13.
- **A24. Legacy fixtures.** Move the inherited report corpus (`fixtures/documents`, `fixtures/source`, `fixtures/truth`, `fixtures/types.ts`) under `fixtures/legacy/`, update its scripts and tests, and confirm its file hashes and retained tests are unchanged. Rename its generator command to `pnpm fixtures:legacy`. It stays until Phase 4 replaces the tests that depend on it. From now on `pnpm fixtures:generate` means deal fixtures.
- **A25. Repository visibility is the owner's call.** The owner sometimes makes the repository public for outside review. Report the visibility you observe. Do not change it.
- **A26. Unreadable files.** A file that cannot be opened contributes no segment and no fact. Its checklist row is `missing`, and `expected_review.json` carries an `unreadable` item naming what the plan says the file really is.


### Owner ruling: A19/A24 legacy exception (2026-09-19)

“Preserve legacy bytes; exempt only fixtures/legacy from A19 until Phase 4.” This exception does not apply to new deal fixtures, scenario tests, seeds or screenshots.


## Phase 3 rulings (2026-09-20)

- **A28. Status precedence. This corrects A9.** A9 said an unknown anywhere makes a row `needs_review`. That was wrong: an absent tax return now reads "needs review" when it should read "missing", and an unsigned Form 1919 reads "needs review" when it should read "incomplete". The missing-item list is a core deliverable and must contain the obvious missing items. New rule: **a definite failure outranks an unknown, an unknown outranks a pass, and only all-pass is `satisfied`.** Evaluate a row in this order:
  1. `applies_when` false gives `not_applicable`; unknown gives `needs_review`.
  2. A missing evidence-inventory member gives `needs_review`, as built.
  3. A waiver gives `waived`. Tracking rows stay as built.
  4. **No evidence.** If no current confirmed segment of an accepted type exists for the row's scope and period, the row is `missing` with one `missing` finding, and no other check is evaluated. Two exceptions: the A13 extension case; and if a proposed, unconfirmed segment of an accepted type exists for that scope and period, the row is `needs_review`, because we may already hold the document.
  5. **Evidence exists.** Run every check. Any fail gives `received_with_issues`. No fail but any unknown gives `needs_review`. All pass gives `satisfied`. Keep one finding per row and the existing `finding_key`. Its type follows the precedence missing, stale, incomplete, needs_review. Its message lists every failed check and every unknown check, so nothing is hidden.
  6. Inside a check over several segments or sources the same precedence applies. `signed: false` or `dated: false` is a definite fail. Only null is unknown.
  7. **Consistency rules.** Two accepted values that disagree beyond tolerance are a `conflict` even when another source is unknown or pending. No disagreement but a required source unknown gives `needs_review`.
  8. **Expressions use standard three-valued logic:** false AND unknown is false; true OR unknown is true. A row whose applicability does not depend on the unknown value is not sent to review.

  Both invariants still hold: nothing but all-pass is satisfied, and removing evidence can only move a row to `missing` or `needs_review`.
- **A29. Guardrail 1 covers words we author,** not documents. It applies to UI strings, rule titles and messages, templates, request drafts and report boilerplate. It does not apply to supplied documents, to fixtures that imitate them, or to verbatim quotes from them shown as evidence. Real SBA forms contain those words and the product must read them. The lint skips fixture documents and quoted-evidence fields. Exports mark quotes as quotes.
- **A30. Official forms.** Your trial showed the official blank Form 1919 and Form 413 fill, save and reopen. Use them, with the `SYNTHETIC` watermark on every page, for every Form 1919 and Form 413 in all three deals, including the pages that are rasterized. Map the official AcroForm field names to the fact catalog in one config file. That mapping is what a real pilot needs. Timebox three hours. Fall back to facsimiles only for a technical reason, and record it.
- **A31. Deal A needs scans.** The flagship deal has no image-only file. Make `Phone/scan0007.pdf` (the lease) and one guarantor's Form 413 image-only in Deal A. Truth statuses do not change. Fact methods and locators do.
- **A32. Supersession.** The taxonomy registry marks which types are `single_instance` per party and period (Form 413, Form 1919, LOI, sources and uses, and similar). When a newly confirmed segment has the same type, party, period and account last four as a current one of a `single_instance` type and carries a strictly later document or signature date, the older segment becomes not current, with an audit event, and the operator can undo it. Anything else with the same identity raises a `version_conflict` review item. Never choose silently.
- **A33. Image-only pages at runtime.** Do not rasterize on the server. For model input, cut the needed pages into a sub-PDF with pdf-lib and use the provider's native PDF input. For display, render pages in the browser with PDF.js. Fixture rasterization stays a fixture-only tool.
- **A34. Optional live smoke test.** Only if the owner has put a provider key in the environment: classify and segment Deal C's files once with the live provider, hard cap USD 1, estimate before running. Report accuracy against truth and the cost. It is not a gate. Without a key, skip it and say so.

### Owner ruling: original documents (2026-09-20)

Ruling: allow. Guardrail 7 governs derived and stored data.

- **A35. Guardrail 7 governs derived and stored data:** database values, tables, side-panel fields, quoted evidence, logs, run events, model payloads and generated exports. All of that stays masked. Original documents, in any format, may be viewed unmasked by authenticated users who need them for review, under these conditions:
  1. Roles admin and operator only. The viewer role cannot open originals in v1.
  2. Opening or downloading an original writes an audit event: user, document version, time. One event per document open, not per page.
  3. Originals are served through short-lived signed URLs with `Cache-Control: private, no-store`. No server-side thumbnails or cached page images, consistent with A33.
  4. The app refuses to start if `REAL_DATA_MODE=true` and `PUBLIC_DEMO_MODE=true` together. Public visitors may preview originals only because every file is synthetic and watermarked.
  5. The review screen shows a short notice beside an unmasked original: "Original document. Identifiers are not masked here."
  6. Screenshots in docs and tests use synthetic files only.

  Tests cover conditions 1, 2 and 4.
