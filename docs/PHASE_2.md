# PHASE 2: Synthetic deals and independent truth

Phase 1 is accepted at commit `9ae628a`. Do Phase 2 only. Stop at its proof and report. Do not start Phase 3. Save this request as `docs/PHASE_2.md`, as you did for Phase 1. dont make repo private now

Standing instruction: for small choices, do not stop to ask. Decide, record the choice and a one-line reason in `docs/DECISIONS.md`, and list it in the phase report. Stop only for something that would change scope, break a hard guardrail, or cost money.

## 0. First, append these rulings to `docs/SPEC_AMENDMENTS.md`

- **A19. Names.** "Northfield Bank" is a real FDIC-insured bank. Remove the name everywhere: the overlay file, its display name, the `NF_` filename prefix, tests, scenario fixtures, docs, the viewer and the review exports. The overlay becomes `rulepacks/overlays/sample-lender-a.yaml`, display name "Sample Lender A", prefix `SLA_`. Re-run `pnpm rules:export-review` afterwards so no exported sheet carries the old name. Every organization in fixtures, tests, seeds and screenshots must be invented: businesses, banks, CPA and law firms, landlords, valuation firms, and the franchise brand in Deal C. Use coined words, not plausible real names. Defaults: Deal A "Varnholt Climate Services", Deal B "Quenby Grounds Management", Deal C "Ostrel Fitness" under the invented franchise brand "Ostrel". If you have web access, search each organization name once and replace any that matches a real business or bank. Rename the Phase 1 trap pair to the same kind of variation (spacing, punctuation, suffix style) on the new Deal A name. Person names come from the seeded Faker. Addresses use invented street and town names. Phones use 555-01xx. Emails use example.com.
- **A20. Arrival batches.** A deal's documents arrive in batches. Deal A has batch 1 (the initial mess) and batch 2 (exactly three fixes). Deals B and C have one batch. Truth states the expected checklist and findings after each batch, and names the three findings that batch 2 resolves.
- **A21. Truth is independent.** Expected results are authored in the deal plan. They are never produced by calling the evaluation function, the parser or any model. You may reuse schemas, registries, normalizers and the finding-key helper. When the engine and truth disagree, investigate which side is wrong and fix that side. Never copy engine output into truth.
- **A22. Raster stability.** Text PDFs, DOCX, XLSX and ZIPs must be byte-identical on regeneration. If rasterized scans are not byte-stable across machines, the committed raster files are canonical, verified by manifest hash, and the generator re-rasterizes only with `--rebuild-scans`. Record what you observed.
- **A23. Planted item 25.** One guarantor's latest tax year is on extension: a `TAX_EXTENSION` segment for 2025 and no 2025 return. Expected: `received_with_issues` and an `info` finding, per A13.
- **A24. Legacy fixtures.** Move the inherited report corpus (`fixtures/documents`, `fixtures/source`, `fixtures/truth`, `fixtures/types.ts`) under `fixtures/legacy/`, update its scripts and tests, and confirm its file hashes and retained tests are unchanged. Rename its generator command to `pnpm fixtures:legacy`. It stays until Phase 4 replaces the tests that depend on it. From now on `pnpm fixtures:generate` means deal fixtures.
- **A25. Repository visibility is the owner's call.** The owner sometimes makes the repository public for outside review. Report the visibility you observe. Do not change it.
- **A26. Unreadable files.** A file that cannot be opened contributes no segment and no fact. Its checklist row is `missing`, and `expected_review.json` carries an `unreadable` item naming what the plan says the file really is.

## 1. Build, in this order

**Step A: plans, truth and the oracle, with no files yet. Commit when it passes.**

1. **Layout.** `fixtures/plans/<deal>.ts` (or YAML), `fixtures/deals/<deal>/incoming/batch-N/`, `fixtures/deals/<deal>/truth/`, `fixtures/deals/<deal>/manifest.json`.
2. **Deal plans,** validated by Zod against the taxonomy, the fact catalog, `DealProfileSchema`, `PartySchema` and `OwnershipSchema` and the deal's resolved pack. A plan declares: the profile, parties and ownership including indirect owners; every document with its type, party, period, format, arrival batch, arrival path and filename, signed and dated flags, and the facts it shows; every planted item with the file or files that carry it and its expected outcome; every trap; and the expected status of every checklist row after each batch. Plans are the single source for both the files and the truth.
3. **A small financial model** per deal so clean figures tie across documents: revenue and income by year across returns and statements, balance sheet totals, Form 413 totals against bank balances, purchase price, total project cost, sources and uses, the injection and its sources. A planted item is a deliberate, recorded departure from the model. Test that the clean model ties before departures are applied.
4. **Fit the engine as built.** As-of date 2026-09-15, so expected tax years are 2023, 2024 and 2025, and source-account statements are July and August 2026 (decision 20). Give every source account a distinct last four (decision 21). Respect the tolerances in decision 22 when sizing planted differences and the rounding trap. Identifier values need an HMAC: use a fixed, obviously fake fixture key of at least 32 characters committed with the fixtures, never the application's `PII_HMAC_KEY`.
5. **Truth,** emitted from the plans. Use the real schemas so later phases compare like with like: segments validate against `SegmentSchema`, facts against `FactSchema`. Per deal: `deal.json`; `documents.json` (per file: hash, format, batch, segments, facts with page and quote locators, and pipeline expectations such as `duplicate_of`, `supersedes`, `unreadable`, `bundle`); per batch `engine_input.json` that validates against `EngineInputSchema`, with `evidence_inventory` listing exactly the current segments and facts for that batch and superseded versions in neither list; per batch `expected_checklist.json` and `expected_findings.json`; and `expected_review.json`.
6. **Oracle test.** For each deal and batch, run the Phase 1 engine over `engine_input.json` with that deal's pack and overlay. The result must equal the expected checklist and findings. Every rule-level planted item is found. No trap raises a finding. No row is `satisfied` where truth says otherwise. Keep a log of every mismatch you hit and which side was wrong.
7. **`pnpm fixtures:check`****:** every type and fact exists; every expected rule id and scope exists in that deal's resolved pack; every planted item has an expected finding or pipeline outcome; every trap has none; every batch input validates.

**Step B: the files.**

8. **Renderers** for every document type the plans use. Formats: text PDF, AcroForm PDF, DOCX, multi-sheet XLSX, image-only PDF, bundled PDF, password-protected PDF, exact duplicate bytes under another filename, corrected version. Each page carries the `SYNTHETIC` watermark and the classification cues a real document would: form number, OMB number, title phrases. Every truth quote must literally occur on the page it cites.
9. **Official forms.** Follow Section 17: try the official blank SBA Form 1919 and Form 413 through AcroForm, two-hour timebox, look-alikes otherwise. Record the outcome.
10. **Signatures.** A signed document shows a drawn mark or an e-sign block with an envelope id, plus a date. An unsigned document shows the empty line. Truth records which.
11. **Messy arrival.** Each batch is written as a folder tree and as a deterministic ZIP: nested folders, forwarded-email style names, phone-scan names, wrong or missing years in filenames, mixed-case extensions.
12. **Password-protected PDF.** Verify a library that can encrypt before adding it. If none is suitable, commit one small pre-made encrypted synthetic PDF as a static fixture and document how it was produced.
13. **`pnpm fixtures:generate`** writes files, truth and manifests (path, SHA-256, bytes, pages, format, planted-item tags). `pnpm fixtures:generate --check` regenerates into a temp directory and compares against the committed manifests.

Scale, per Section 17 and the amendments. Deal A: about 40 files, at least 18 planted items, pack 8, no overlay, expected loan number date 2026-09-29, two batches. Deal B: about 28 files, 3 planted items, pack 8.1, Sample Lender A overlay, price 3,600,000, expected loan number date outside the 14-day boundary window. Deal C: about 22 files, 8 planted items, pack 8.1, franchise, gift funds, mostly scans and bundles. All 25 planted items and all three traps are used.

## 2. Proof

- **Oracle,** as in step 6, for every deal and batch.
- **Determinism.** Two generations give identical manifests, subject to A22. Legacy corpus hashes unchanged after the move.
- **Readability,** with no pipeline: each text PDF's text layer contains its classification cues, its key values and every truth quote on the cited page; AcroForm fields read back through pdf-lib; image-only PDFs yield under 100 characters per page; the protected PDF fails to open in the expected way; XLSX files open with the expected sheets; DOCX files parse.
- **Synthetic-data lint** over all generated text: no SSN outside area 900 to 999, no EIN without the `00-` prefix, no phone outside 555-01xx, no email outside example.com, watermark on every page, none of the banned terms from guardrail 1, and no occurrence of "Northfield" or "Harborview" anywhere in the repository outside `docs/SPEC.md`, the saved phase requests and the amendments.
- **Commands that must pass:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm rules:check`, `pnpm rules:export-review`, `pnpm fixtures:check`, `pnpm fixtures:generate --check`, `pnpm build`.

## 3. Not in this phase

Intake, the parsing pipeline, classification, extraction, entity resolution, deal screens, loading deals into the database, live model calls.

## 4. Report, then stop

Write `docs/phase-2-proof.md`, update `docs/PROGRESS.md`, commit step A and step B separately with "Phase 2" in the messages, and push. Then report:

1. files per deal by format;
2. a planted-item table: item, deal, batch, file or files, expected outcome;
3. the oracle result per deal and batch, and every mismatch resolved with which side was wrong;
4. official forms or look-alikes, and why;
5. what you observed on raster stability;
6. dependencies added and where each was verified;
7. the result of the name checks under A19;
8. exact command results;
9. anything in the spec or amendments you believe is wrong.

Do not start Phase 3.
