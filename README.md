# AcqFile

Internal SBA 7(a) business-acquisition file preparation workbench. **Phase 1 domain core**: validated rule packs, deterministic engine and read-only pack viewer. Deal intake and extraction adaptation remain future phases. Synthetic data only.

The independent starting codebase was copied from [EvidenceOps](https://github.com/essashahid/EvidenceOps/tree/9341148348f8535ed0f15981360728da58fd186c). AcqFile has its own Git history, private remote, database names and application identity. No EvidenceOps deployment resources or credentials are used.

Read [the full specification](docs/SPEC.md), [plan](docs/PLAN.md), [decisions and specification gaps](docs/DECISIONS.md), and [phase progress](docs/PROGRESS.md).

Retained infrastructure: Next.js 16 App Router, React, PostgreSQL/Drizzle, private storage drivers, signed sessions, inline/Inngest jobs, extraction with source evidence, separate verification, code-computed confidence, immutable human review, duplicate/version handling, retry/dead-letter recovery, and extraction evaluations with HTML QA reports. Retrieval, embeddings, chunking, document chat and drafting modes have been removed.

## Local setup

Node 22+, pnpm 10.30.0 and plain PostgreSQL 15+ are required.

```sh
pnpm install --frozen-lockfile
createdb acqfile
createdb acqfile_test
cp .env.example .env.local
pnpm db:migrate
pnpm seed:demo
pnpm dev
```

Set local demo passwords in `.env.local` before seeding. Default examples select mock models, inline jobs, local storage and a synthetic public demo. Use `PUBLIC_DEMO_MODE=false` and `DEMO_MUTATIONS_ENABLED=true` for local operator testing. Never reuse another application's database. Tests reset `acqfile_test`.

The retained demo seed is the base's synthetic operational-report corpus, used only to test the infrastructure. It is not the three-deal SBA demo, and its mock results do not measure live model quality. The AcqFile fixture replacement is Phase 2.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

`pnpm typecheck` generates Next.js route types before checking TypeScript, so it works on a clean checkout. `pnpm eval` currently runs the retained extraction regression suite; Section 18 deal metrics arrive in Phase 6.

See [Phase 0 proof](docs/phase-0-proof.md) for measured results and [deployment notes](docs/deployment.md) for current limitations. No AcqFile deployment or live-model evaluation is claimed.

## Phase 1 domain core

Read [the amendments](docs/SPEC_AMENDMENTS.md) and [Phase 1 instructions](docs/PHASE_1.md) with the specification. The `/rulepacks` screen is an authenticated, read-only viewer and comparison tool. Domain tables are additive; the existing extraction workflow remains regression scaffolding until its authorized adaptation phase.

```sh
pnpm db:migrate
pnpm rules:check
pnpm rules:export-review
```

The review outputs are [HTML](docs/RULEPACK_REVIEW.html) and [XLSX](docs/RULEPACK_REVIEW.xlsx). Every rule is unverified. See [source notes](docs/RULE_SOURCES.md), [candidates and limitations](docs/RULE_CANDIDATES.md), and [decisions](docs/DECISIONS.md). Phase 2 has not started.
