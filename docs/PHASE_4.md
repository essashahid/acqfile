# PHASE 4: Reading the documents (extraction, verification, confidence, review)

Phase 3 is accepted at commit `557aecf`. Do Phase 4 only. Stop at its proof and report. Do not start Phase 5. Save this request as `docs/PHASE_4.md`.

Standing instruction: for small choices, decide, record and report. Stop only for something that would change scope, break a hard guardrail, or cost money.

Your three A35 points are accepted as implemented: public demo visitors may open synthetic originals, their opens are audited under the fixed visitor identity, and the real-data banner waits for Phase 7.

## 0. First, append these rulings to `docs/SPEC_AMENDMENTS.md`

- **A36. No evidence sheet.** The synthetic evidence sheet appended to each official form does not exist on a real form, and on rasterized copies it would let a vision model read clean printed text instead of the form. Remove it. For AcroForm facts, the locator is the widget's page plus the field name, and the quote is the field value as read. Draw the signature mark and the date inside the form's own signature and date areas. For image-only pages, the locator is the page plus a named region, and the quote is the value as the model read it, flagged as not verbatim. Truth statuses do not change.
- **A37. Domain prompts.** The inherited extractor and verifier prompts were written for a different kind of document. Replace them with the two prompts in Section 2, verbatim apart from structured-output wrappers.
- **A38. Extraction schemas come from the fact catalog.** For each extracted type, generate the schema from the catalog entries that (a) that type can produce and (b) an active rule in any shipped pack or overlay consumes. Do not hand-duplicate field lists. A fact no rule consumes is not extracted.
- **A39. Method order and confidence,** computed in code, never taken from a model's self-report:
  - `acroform`: read the mapped field. 1.0 when the mapping is known and validators pass; otherwise review. No model call.
  - `text`: `0.30 exact evidence + 0.20 deterministic validation + 0.25 verifier support + 0.15 cross-pass agreement + 0.10 evidence specificity`. Auto-accept at 0.86 or above, review from 0.65, blocked below. Unsupported evidence or a contradiction blocks regardless of score.
  - `vision`: `0.35 dual-read agreement + 0.25 deterministic validation + 0.30 verifier support + 0.10 evidence specificity`. A rule-feeding fact read by vision is never auto-accepted.
  - `manual`: per A14.
  - Components: exact evidence is 1.0 when the normalized quote occurs in the cited block, else 0.0. Validation is 1.0 all pass, 0.5 warnings only, 0.0 material failure. Verifier support is 1.0, 0.5 or 0.0 for supported, partially supported, unsupported. Cross-pass agreement is 1.0 same value after normalization, 0.75 formatting-only difference, 0.0 materially different. Specificity is the verifier's number. Dual-read agreement is 1.0 when two independent reads agree after normalization, else 0.0.
  - Classification confidence, left at zero in Phase 3, is also code-computed: 1.0 for a deterministic cue match; for a classifier proposal, from cue agreement, quote verification and the classifier's `uncertain` flag. Every image-only classification and every multi-segment boundary still needs operator confirmation.
- **A40. Identifiers in extraction.** Per A15: code reads full SSNs, EINs and account numbers from the text layer and AcroForm values and stores HMAC plus last four. Models are asked for the last four only. On image-only pages only the last four exist, so matching falls back to last four plus name, and a mismatch goes to review.
- **A41. The `facts` table is the single store** for extracted values. The inherited field-value tables are retired in this phase.
- **A42. Legacy removal.** Delete `fixtures/legacy`, the report schemas, the legacy extraction path, its queries, screens, tests and its 76 evaluation cases. The A27 exemption ends here. Keep the evaluation harness code that Phase 6 will reuse. Until Phase 6, `pnpm eval` runs the Phase 3 and Phase 4 gates.
- **A43. Planted extraction faults.** The mock provider must misbehave on purpose so routing can be tested. Author about twelve faults in the deal plans, under A21: wrong value with a real quote, right value with a quote that is not in the block, broad weak evidence, a value the verifier corrects, a missing value, a vision dual-read disagreement. Each names its file, attribute, fault and expected routing (`review` or `blocked`).
- **A44. Optional live smoke test,** only if the owner has put a provider key in the environment. One pass of extraction and verification over Deal C plus ten text documents from Deal A. Hard cap USD 3. Estimate first and abort above the cap. Report fact accuracy by method, routing, false accepts, cost and time. Not a gate. Without a key, skip it and say so.

## 1. Step 0: fixture correction. Commit separately.

Apply A36 and A43. Regenerate fixtures, manifests and canonical scans. All four oracles, `pnpm fixtures:check` and `pnpm fixtures:generate --check` pass. Phase 3 gates still pass on the regenerated files.

## 2. The prompts (A37)

**Extractor system prompt.** Field definitions for the document type are supplied in the user message.

```text
You are AcqFile Extractor. You extract specific facts from one document in a
small-business acquisition loan file.

Rules:
1. Use only the source blocks or pages supplied. No outside knowledge.
2. Extract only the fields in the supplied schema. Never infer a value from
   what would normally be true. If a value is absent, return null.
3. Every non-null value must cite one or more source_block_ids and include a
   short verbatim evidence_quote copied from the cited block. For an image-only
   page, cite the page number and name the region (for example, "page 2,
   signature block").
4. Do not resolve contradictions. If the document gives two values for one
   field, return the one the document itself marks as final, revised or
   corrected. Otherwise return null and explain in ambiguity.
5. Preserve negation and conditions. "No payments for 24 months" is not "full
   standby for the life of the loan".
6. Money is a number plus a currency code. A date is YYYY-MM-DD only when the
   document fixes the exact date; otherwise null, with the text as written in
   ambiguity. A percentage is a number from 0 to 100.
7. For SSNs, EINs and account numbers return only the last four digits.
8. Return only JSON matching the schema. No commentary.
```

**Verifier system prompt.** One field, or up to twelve fields from the same segment, with the cited evidence and the surrounding source. The verifier never sees the extractor's confidence and runs on a different model.

```text
You are AcqFile Verifier. You independently check a candidate value against its
cited evidence and the surrounding source.

Do not trust the candidate because another model produced it. Use only the
source material supplied.

Classify the candidate as:
SUPPORTED: directly supported by the source.
PARTIALLY_SUPPORTED: the source supports the core meaning, but the candidate
adds, omits, normalizes or resolves something that is not explicit.
UNSUPPORTED: not supported, or contradicted.

Rules:
1. Check numbers, units, currency, dates and tax years digit by digit.
2. Check that the evidence is about the same person, entity and period as the
   candidate.
3. Preserve negation and conditions.
4. If the source explicitly marks another value as revised, corrected or final,
   return that value as corrected_value.
5. evidence_specificity: 1.0 direct and explicit; 0.75 clear from context;
   0.4 broad or weak; 0.0 none.
6. Return only JSON: status, corrected_value, contradiction_detected,
   evidence_specificity, reason (one sentence).
```

## 3. Step A: extraction core

1. Steps `extract`, `deterministic_validate`, `independent_verify`, `calculate_confidence`, `route_review`, `finalize_segment` on each confirmed segment, persisted with idempotency keys, retries and failure injection like the Phase 3 steps. A completed step is never repeated and never re-billed.
2. **AcroForm** through the official field mapping. **Text** from source blocks: PDF pages, DOCX paragraphs, XLSX sheets with cell-reference locators. **Vision** through A33's sub-PDF input, two independent reads plus the verifier.
3. **Deterministic validation** before confidence: types and enums, valid dates, money shape, percentages, cited block exists and lies inside the segment's pages, quote occurs in the block after whitespace normalization, repeated list items, self-checks such as Form 413 totals.
4. **Normalization** reuses the Phase 1 normalizers, so conflict detection sees the same values the engine tests used.
5. **Facts** are written with method, locator, confidence, components, validator result and routing status. Payloads are scrubbed per A40 before they are stored.

## 4. Step B: review, entities, evaluation, cleanup

1. **Grouped review.** One screen per segment: the page beside every pending value, with the confidence breakdown and the verifier's reason. Actions: Accept, Edit and accept, Reject, Needs a better copy, Reclassify. Each action creates an immutable version with reviewer, old value, new value, comment and time. Stale writes are rejected. Reprocessing supersedes old pending items. The A35 notice and role rules apply.
2. **Entity resolution.** Match extracted names and identifiers to deal parties. An identifier match outranks a name match. Ambiguity raises `party_assignment`. Never merge on a fuzzy name alone. Extracted ownership rows become `ownership_links` with origin `extracted`.
3. **Evaluation wiring.** After a segment is finalized, after any review action, and after a profile change, build the engine input from the database and run the engine. Persist the evaluation, checklist rows and findings, with the evidence inventory taken from current rows. Debounce. Show only counts on the deal page. The checklist and findings screens are Phase 5.
4. **Legacy removal** per A42, then confirm nothing references it.

## 5. Proof, in mock mode, all three deals and every batch

| Measure                                                                                                                                           | Gate                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Rule-feeding fact accuracy, `acroform` and `text`, before review                                                                                  | at least 95%                |
| Rule-feeding fact accuracy, `vision`, before review                                                                                               | report only                 |
| Provenance validity on text-layer facts                                                                                                           | at least 98%                |
| Every planted extraction fault routed as its plan expects                                                                                         | 100%                        |
| Vision rule-feeding facts auto-accepted                                                                                                           | 0                           |
| **Before review:** rows `satisfied` where truth says otherwise                                                                                    | 0                           |
| **After simulated review** (a test operator resolves every open item with truth values): engine result equals the expected checklist and findings | exact, every deal and batch |
| A correction creates a new version and triggers a new evaluation whose result changes as expected                                                 | pass                        |
| Injected failure at `extract` and at `independent_verify` resumes with no repeated call                                                           | pass                        |
| Identifier patterns in the database, logs and stored payloads                                                                                     | none                        |
| Phase 3 gates on the regenerated fixtures                                                                                                         | still pass                  |

Report the split of facts by method, and how many review items an operator faces per deal. If A44 ran, report it apart from everything else.

End to end: upload Deal A batch 1; open the review screen for the scanned Form 413; edit one value and accept; see the evaluation counts change; upload batch 2 and see three findings disappear from the counts.

Commands that must pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm rules:check`, `pnpm fixtures:check`, `pnpm fixtures:generate --check`, `pnpm eval`, `pnpm build`.

## 6. Not in this phase

Checklist and findings screens, findings lifecycle, requests, snapshots, package exports, the Section 18 evaluation harness and QA report, the full live evaluation, deployment.

## 7. Report, then stop

Write `docs/phase-4-proof.md`, update `docs/PROGRESS.md`, commit Step 0, Step A and Step B separately with "Phase 4" in the messages, and push. Then report:

1. what changed in the fixtures under A36 and A43;
2. the proof table, per deal and batch;
3. facts by method, and review items per deal;
4. every planted fault and how it was routed;
5. what was deleted under A42;
6. the A44 result, or that it was skipped;
7. new decisions;
8. exact command results;
9. anything in the spec or amendments you believe is wrong.

Do not start Phase 5.
