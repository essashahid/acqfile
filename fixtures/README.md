# Synthetic fixture corpora

`fixtures/plans` authors the deal profiles, documents, financial models, planted items, traps and expected results. `fixtures/deals` holds truth and, after Phase 2 Step B, incoming files and manifests. Truth generation has no evaluator, parser or model dependency.

- `pnpm fixtures:check`: validate plans, retained hashes and every deal/batch oracle against saved truth.
- `pnpm fixtures:generate`: render deal files and write truth/manifests.
- `pnpm fixtures:generate --check`: regenerate into a temporary directory and compare.
- `pnpm fixtures:legacy`: regenerate the inherited operational report corpus in `fixtures/legacy`. The original 47 file hashes are retained in `legacy-hashes.json`. The owner exempted only this directory from A19 until Phase 4 replaces its dependent tests.

The fixture HMAC key is deliberately fake, committed in plans/shared.ts, and unrelated to application secrets. Phase 2 never loads deals into a database or calls a model.
