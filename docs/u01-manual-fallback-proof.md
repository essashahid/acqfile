# U01 manual fallback and evidence verification

Implemented on current `main` using synthetic data only. No schema, rule pack, role, readiness rule, prepared candidate, extraction prompt or demo outcome changed.

## Before / after

Before, U01 could upload and manually file its unfamiliar agreement, return, scan and workbook, then create an incomplete export. Because generic extraction produced no purchase-price gap, the operator had no screen control for the agreement's stated value and the $780,000 / $805,000 disagreement could not be demonstrated.

After, the existing document value screen can add a missing catalogued value even without a gap. The choices are derived from the filed document type and exclude attributes with a current value. The server independently enforces the current confirmed segment, document-type producer, operator permission and no-current-duplicate rule, then reuses the existing typed validator, source page/quote or transcription check, audit event, manual fact shape and re-evaluation.

U01 now creates its deal through the visible form with purchase price left unknown, then enters $780,000 from the agreement and $805,000 from the worksheet through the document screens. CON-03 raises the two-value question; the adviser chooses $780,000; staff dismiss the reviewed disagreement with a recorded reason. The incomplete export's Source record contains both manual values and its Change log contains two reviewer corrections and the CON-03 dismissal. The file remains not ready because the intentionally partial packet lacks unrelated required documents and its ambiguous image-only cash worksheet remains unresolved.

The mock verifier now requires an exact numeric token, so `$3,700,000` does not support `370000`. For boolean facts it interprets the catalogued clause (including negation and conditions); a full-standby clause supports `true` and contradicts `false`. The authored mock scorecard remains 371/371 statuses, 34/34 plants, no traps and zero false-satisfied results.

## Verification

- `pnpm test`: 24 files, 261 tests passed. An earlier run while the dev server was active timed out in four heavy fixture/invariant tests; the clean rerun passed after the server stopped.
- `pnpm test:integration`: 15 files, 49 tests passed.
- `pnpm test:e2e`: 14 passed, 9 explicitly configured demo-case tests skipped. Focused U01 Playwright: 1 passed, including a final rerun with no profile import. Protected D01/D04/D06 Playwright: 3 passed.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm rules:check`, `pnpm fixtures:check`, `pnpm eval`, and `pnpm build`: passed. Fixture oracle: all five batches plus readability/synthetic-data checks passed. Evaluation: all 15 gates, 371/371 statuses, 34/34 plants, zero traps/false-satisfied.
- `pnpm fixtures:generate --check`: failed only on Deal A's protected `formation.PDF` bytes/hash and dependent archive/truth hashes; no fixture or generator was changed in this pass.

No `OPENAI_API_KEY` is configured (`LLM_PROVIDER=mock`), so the supervised live-provider check was skipped. Manual fallback is verified; live extraction/verification of U01 remains unverified.
