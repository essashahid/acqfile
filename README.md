# AcqFile

Internal SBA 7(a) business-acquisition file preparation workbench. **Phase 4**: validated rule packs, synthetic deals, profile editing, batch intake, parsing, document classification, audited filing review, fact extraction with verification and code-computed confidence, grouped fact review, entity resolution and evaluation counts. Checklist and findings screens remain future phases. Synthetic data only.

The independent starting codebase was copied from [EvidenceOps](https://github.com/essashahid/EvidenceOps/tree/9341148348f8535ed0f15981360728da58fd186c). AcqFile has its own Git history, owner-controlled remote, database names and application identity. No EvidenceOps deployment resources or credentials are used.

Read [the full specification](docs/SPEC.md), [plan](docs/PLAN.md), [decisions and specification gaps](docs/DECISIONS.md), and [phase progress](docs/PROGRESS.md).

Retained infrastructure: Next.js 16 App Router, React, PostgreSQL/Drizzle, private storage drivers, signed sessions, inline/Inngest jobs, the durable step runner with retry and dead-letter recovery, and the generic evaluation harness pieces Phase 6 reuses. The inherited operational-report extraction path, its screens, tables, fixtures and evaluation cases were deleted in Phase 4 (A42).

## Local setup

Node 22+, pnpm 10.30.0 and plain PostgreSQL 15+ are required.

```sh
pnpm install --frozen-lockfile
createdb acqfile
createdb acqfile_test
cp .env.example .env.local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Set local demo passwords in `.env.local` before seeding. Default examples select mock models, inline jobs, local storage and a synthetic public demo. Use `PUBLIC_DEMO_MODE=false` and `DEMO_MUTATIONS_ENABLED=true` for local operator testing. Never reuse another application's database. Tests reset `acqfile_test`.

`pnpm db:seed` creates the workspace and demo users only; the three-deal demo seed arrives with Phase 7. The three acquisition-deal fixtures live under `fixtures/deals` and are loaded through the deal screens or the integration proofs.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

`pnpm typecheck` generates Next.js route types before checking TypeScript, so it works on a clean checkout. Until Phase 6, `pnpm eval` runs the Phase 3 and Phase 4 gates (the mock-mode pipeline, extraction and evaluation proofs) and prints their proof summaries.

See the phase proofs under `docs/` for measured results and [deployment notes](docs/deployment.md) for current limitations. No AcqFile deployment or live-model evaluation is claimed.

## Phase 1 domain core

Read [the amendments](docs/SPEC_AMENDMENTS.md) and [Phase 1 instructions](docs/PHASE_1.md) with the specification. The `/rulepacks` screen is an authenticated, read-only viewer and comparison tool. Domain tables are additive; the existing extraction workflow remains regression scaffolding until its authorized adaptation phase.

```sh
pnpm db:migrate
pnpm rules:check
pnpm rules:export-review
```

The review outputs are [HTML](docs/RULEPACK_REVIEW.html) and [XLSX](docs/RULEPACK_REVIEW.xlsx). Every rule is unverified. See [source notes](docs/RULE_SOURCES.md), [candidates and limitations](docs/RULE_CANDIDATES.md), and [decisions](docs/DECISIONS.md). See [Phase 4 proof](docs/phase-4-proof.md) for the current authorized boundary.

## Deals and document filing

Set a private `PII_HMAC_KEY` of at least 32 characters in `.env.local` before intake. Keep `LLM_PROVIDER=mock` for the synthetic fixture proof; this provider uses committed fixture truth only for classifier fallbacks and is not a model-quality evaluation. No provider key is needed.

Open `/deals/new`, import `fixtures/deals/deal-a/truth/deal.json`, save, then upload `fixtures/deals/deal-a/batch-1.zip`. The deal page shows arrivals, duplicate links, proposed segments and filed documents. Review a bundle beside its source, file unreadable material in the index, and upload `batch-2.zip` to exercise correction and supersession. Unreadable indexing supplies no evidence. Review edits are immutable, audited and reject stale submissions.

```sh
pnpm fixtures:check
pnpm fixtures:generate --check
```

Originals remain in private storage with authenticated, expiring source links. Under amendment A35 admin and operator roles view originals unmasked, each open is audited, and the viewer role sees masked parsed text only; every stored or derived value stays masked. Runtime image input uses native PDF support; the browser renders PDFs with PDF.js. Poppler and Tesseract are only needed to rebuild/prove the canonical fixture scans, never for runtime intake. This phase's batch actions run inline through persisted, retryable steps; deployment and hosted transport sizing are outside this proof.

## Reading documents (Phase 4)

Confirmed documents are read by method: official form fields directly through the mapping in `src/lib/config/official-form-fields.ts`, text through the A37 extractor and verifier prompts on different models, image-only pages through native PDF input with two independent reads. Extraction schemas are generated from the fact catalog and the shipped rule packs (A38); confidence and routing are computed in code (A39); models are asked for last-four identifiers only (A40). Every fact lives in the `facts` table (A41).

Each document with pending values has a review screen (`/deals/<deal>/segments/<segment>/review`) showing the page beside every value, its confidence breakdown and the verifier's reason. Accept, edit and accept, reject, ask for a better copy or reclassify; every action is a new immutable fact version with an audit event and stale writes are rejected. Extracted ownership rows become `ownership_links` with origin `extracted`. The engine runs after filing, review and profile changes; the deal page shows counts only.

With `LLM_PROVIDER=mock` the extractor and verifier answer from committed fixture truth and follow the planted A43 faults; the result measures routing, never model quality. A live pass needs an owner-supplied key and is optional (A44).
