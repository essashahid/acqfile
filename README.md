# AcqFile

A sample-data portal for collecting documents and preparing a business-acquisition loan file. People get a personal link and a short list; advisers see questions, people and the lender file; staff keep the existing review tools. The lender makes every lending decision. `REAL_DATA_MODE=false` is mandatory.

New here? Follow [docs/SETUP.md](docs/SETUP.md) for the full local setup. The short version, with Node 22, pnpm 10 and PostgreSQL already installed:

```sh
pnpm install --frozen-lockfile
createdb acqfile && createdb acqfile_test
cp .env.example .env.local   # set AUTH_SECRET and PII_HMAC_KEY
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

The seed prints each personal link **once**; copy it locally. Rerunning reissues links and revokes the old ones. Sign in at `/login` as `adviser@example.com` / `acqfile-adviser`. Local staff accounts remain `admin@example.com` / `acqfile-admin` and `reviewer@example.com` / `acqfile-reviewer`, with tools at `/staff/deals`. These sample credentials are for local use only; hosted auth requires separately provisioned users.

Three authored deals run through the real engine and pipeline. Kiel has things to do, Abe is waiting and Terrill is done. Deal A's second batch is withheld for the upload demonstration. `pnpm demo:b-ready` processes and reviews Deal B's authored corrections, producing a genuinely ready lender file without changing any gate.

Follow the [seven-minute walkthrough](docs/WALKTHROUGH.md), [pilot runbook](docs/PILOT_RUNBOOK.md), [Phase 7 proof](docs/phase-7-proof.md) and [screenshots](docs/screenshots/phase-7/README.md). The [specification](docs/SPEC.md), [amendments](docs/SPEC_AMENDMENTS.md) and [current phase request](docs/PHASE_7.md) are build authority. Email buttons open your mail client; the application sends nothing. Live model behavior remains unproven when no owner key is supplied.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm rules:check`, `pnpm fixtures:check`, `pnpm fixtures:generate --check`, `pnpm eval`, `pnpm build`. Database proofs reset `acqfile_test`; run them sequentially and separately from a demonstration database.
