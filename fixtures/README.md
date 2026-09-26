# Synthetic fixture corpora

`fixtures/plans` authors the deal profiles, documents, financial models, planted items, planted extraction faults, traps and expected results. `fixtures/deals` holds truth, incoming files and manifests. Truth generation has no evaluator, parser or model dependency.

Each document is drawn from a real-world template (A98): `fixtures/lib/doc` holds the templates and `fixtures/forms` the official SBA and IRS pages. See [docs/FIXTURE_TEMPLATES.md](../docs/FIXTURE_TEMPLATES.md) for sources and the rules a template must keep.

- `pnpm fixtures:check`: validate plans and every deal/batch oracle against saved truth, then readability and synthetic-data lint.
- `pnpm fixtures:generate`: render deal files and write truth/manifests (`--rebuild-scans` re-rasterizes the canonical image-only files on a Poppler host).
- `pnpm fixtures:generate --check`: regenerate into a temporary directory and compare.
- `pnpm demo:generate --rebuild-scans`: regenerate the eight demo cases, re-rasterizing their photographed and scanned files.
- `pnpm exec tsx scripts/prepare-irs-forms.ts`: download the official IRS forms, trim them to the page used and record value positions in `fixtures/forms/irs/layout.json`.

The inherited report corpus under `fixtures/legacy` was deleted in Phase 4 (A42). The fixture HMAC key is deliberately fake, committed in plans/shared.ts, and unrelated to application secrets.
