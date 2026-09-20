# Synthetic fixture corpora

`fixtures/plans` authors the deal profiles, documents, financial models, planted items, planted extraction faults, traps and expected results. `fixtures/deals` holds truth, incoming files and manifests. Truth generation has no evaluator, parser or model dependency.

- `pnpm fixtures:check`: validate plans and every deal/batch oracle against saved truth, then readability and synthetic-data lint.
- `pnpm fixtures:generate`: render deal files and write truth/manifests (`--rebuild-scans` re-rasterizes the canonical image-only files on a Poppler host).
- `pnpm fixtures:generate --check`: regenerate into a temporary directory and compare.

The inherited report corpus under `fixtures/legacy` was deleted in Phase 4 (A42). The fixture HMAC key is deliberately fake, committed in plans/shared.ts, and unrelated to application secrets.
