# PHASE 3: Corrections, then intake, parsing, segments and classification

Phase 2 is accepted at commit `3b99c6e`. Do Phase 3 only. Stop at its proof and report. Do not start Phase 4. Save this request as `docs/PHASE_3.md`.

Standing instruction: for small choices, decide, record and report. Stop only for something that would change scope, break a hard guardrail, or cost money.

## 0. First, append these rulings to `docs/SPEC_AMENDMENTS.md`

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

## 1. Step 0: corrections to accepted work. Commit separately.

1. Implement A28 in the engine and expressions. Re-author the affected expectations in the Phase 1 scenarios and in the Phase 2 plans by reasoning from A28, under A21. At minimum: the absent 2024 personal return in Deals A and C becomes `missing`, and the unsigned Form 1919 in Deals A and C becomes `received_with_issues` with an `incomplete` finding. Add scenario cases for: absent document with signature and page checks (`missing`); unsigned with null signature date (`incomplete`); a conflict with a third source pending (`conflict`); false AND unknown applicability (`not_applicable`); a proposed segment waiting (`needs_review`).
2. Implement A29, A30 and A31. Regenerate fixtures, manifests and canonical scans.
3. Proof for this step: all four oracles pass; the no-false-satisfied, monotonic-removal, pending-never-satisfies and determinism tests pass unchanged in intent; `pnpm fixtures:check` and `pnpm fixtures:generate --check` pass; legacy hashes unchanged. Log every expectation you changed and why.

## 2. Step A: deals and intake

Build on the inherited run and step persistence, storage, hashing and review infrastructure. Keep the legacy pipeline and its tests working until Phase 4.

1. **Deals.** Create, list and open a deal. A profile form covering every `DealProfile` field, parties, roles and ownership, with `unknown` allowed everywhere, plus JSON import of a profile for seeding. Pack and overlay are selected from the profile as built. Audit events for every change.
2. **Intake.** Upload a folder or ZIP into a deal as a numbered batch. ZIP safety: path traversal, nested archives, decompression bombs, size and count limits, type sniffing by magic bytes, mixed-case extensions. Original folder path and filename are kept as metadata.
3. **Hashing and duplicates** within a deal: an exact duplicate creates no version, no parse and no model call, records `duplicate_detected` and links to the existing version.
4. **Parsing to source blocks:** PDF text layer per page; AcroForm fields with names and values; DOCX paragraphs; XLSX sheets with cell references; image-only detection per page (under 100 characters). Password-protected, corrupt or unsupported files become `UNREADABLE` with a high-priority review item.
5. **Identifiers.** Wire the Phase 1 helpers into this new path: code reads SSNs, EINs and account numbers by pattern, stores HMAC and last four, and scrubs the patterns from anything persisted or logged.

## 3. Step B: segments, classification, filing

1. **Signature library** in config: form numbers, OMB numbers, title phrases and AcroForm field-name patterns per type. Classify deterministically first.
2. **Segmentation.** Detect bundles deterministically where possible (type cues changing across pages, page-number restarts). Call the classifier only when cues are inconclusive, the file may be a bundle, or pages are image-only. Use the Section 12 classifier prompt verbatim. In mock mode the provider answers from truth; the deterministic path never reads truth.
3. **Segment metadata:** party and period, form revision, signed, dated, signature date, document date, expected page count, account last four. From AcroForm values and text cues first, the classifier second. Anything uncertain is null, never guessed.
4. **Party and period assignment** against the deal's parties. An identifier match outranks a name match. Ambiguity raises `party_assignment`. A party outside the deal raises the item that feeds CON-16.
5. **Supersession** per A32.
6. **Review and filing screens.** Intake (per file: hash, duplicate or version result, proposed segments). Documents (an inbox of unfiled and needs-review items, then filed documents by folder). A segmentation review where the operator confirms or edits page ranges, type, party, period and the signed and dated indicators, with the page rendered beside it. Manual filing for anything the system could not read. Every action is an immutable version and an audit event, with stale-edit rejection.
7. **Steps** `upload`, `hash_dedupe`, `parse`, `segment_classify`, `assign_party_period`, `finalize_segment` are persisted with idempotency keys, retries and failure injection, as the inherited steps are.

## 4. Proof

Run all three deals, every batch, through the pipeline in mock mode and compare with `documents.json`:

| Measure                                                                                           | Gate                                   |
| ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Segment type accuracy                                                                             | at least 95%                           |
| Segment boundary accuracy on bundles                                                              | at least 90%                           |
| Party and period assignment                                                                       | at least 90%                           |
| Signed and dated indicators                                                                       | at least 90%, and never a wrong `true` |
| Duplicates, supersession, unreadable files, the misnamed lease, the brochure, the unmatched party | every pipeline expectation matches     |
| Exact duplicate triggers no parse and no model call                                               | pass                                   |
| Injected failure at `segment_classify` resumes without repeating completed steps                  | pass                                   |
| Identifier patterns in the database, logs and stored payloads                                     | none                                   |

Report two numbers separately, because mock results say nothing about model quality: the share of segments classified and bounded by the deterministic path alone with its accuracy, and the share that needed the classifier. If A34 ran, report it apart from both.

End to end: create Deal A from the profile JSON; upload the batch 1 ZIP; see files filed; confirm one proposed bundle split; manually file one document; upload batch 2 and see the corrected Form 1919 supersede the first.

Commands that must pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm rules:check`, `pnpm fixtures:check`, `pnpm fixtures:generate --check`, `pnpm build`.

## 5. Not in this phase

Fact extraction from document bodies, verification, confidence, entity merging, evaluation screens, checklist, findings lifecycle, requests, snapshots, exports, the full live evaluation, deployment.

## 6. Report, then stop

Write `docs/phase-3-proof.md`, update `docs/PROGRESS.md`, commit Step 0, Step A and Step B separately with "Phase 3" in the messages, and push. Then report:

1. every expectation changed under A28 and why;
2. official forms used or not, and the field mapping coverage;
3. the proof table, per deal;
4. deterministic share and accuracy against classifier share;
5. the A34 result, or that it was skipped;
6. new decisions;
7. exact command results;
8. anything in the spec or amendments you believe is wrong.

Do not start Phase 4.
