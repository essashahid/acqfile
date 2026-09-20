# Local setup

How to get AcqFile running on your own machine. Every step below was run from a clean database on 2026-09-20. Allow about fifteen minutes.

Everything here uses invented people and companies. `REAL_DATA_MODE=false` is mandatory and the app refuses to start if you combine it with the public demo.

## 1. Install the tools

| Tool       | Version     | Notes                                                             |
| ---------- | ----------- | ----------------------------------------------------------------- |
| Node       | 22 or newer | `node -v`                                                         |
| pnpm       | 10.30.0     | `corepack enable` then `corepack prepare pnpm@10.30.0 --activate` |
| PostgreSQL | 15 or newer | Must be running locally and accept connections on port 5432       |

Poppler and Tesseract are only needed if you rebuild the scanned fixture files. Skip them unless you are regenerating fixtures.

## 2. Clone and install

```sh
git clone https://github.com/essashahid/acqfile.git
cd acqfile
pnpm install --frozen-lockfile
```

The spreadsheet library is a committed tarball under `vendor/`, so the install needs no extra registry access.

## 3. Create the two databases

```sh
createdb acqfile
createdb acqfile_test
```

The first is your working database. The second is wiped by the integration and browser tests, so never point it at anything you care about.

## 4. Write your environment file

Copy the example and fill in three values:

```sh
cp .env.example .env.local
```

Then edit `.env.local`:

```sh
AUTH_SECRET=<paste the output of: openssl rand -hex 32>
PII_HMAC_KEY=<paste the output of: openssl rand -hex 24>
PUBLIC_DEMO_MODE=false
DEMO_MUTATIONS_ENABLED=true
DEMO_ADMIN_PASSWORD=acqfile-admin
DEMO_REVIEWER_PASSWORD=acqfile-reviewer
DEMO_VIEWER_PASSWORD=acqfile-viewer
```

Leave `LLM_PROVIDER=mock`. The deterministic provider answers from the committed fixtures, so you need no API key and nothing costs money. `.env.local` is gitignored; never commit it.

Why each value matters:

- `AUTH_SECRET` signs your session cookie and the short-lived links to original documents.
- `PII_HMAC_KEY` is the key that turns identifiers into stored hashes. Intake refuses to run without at least 32 characters. Use a throwaway value locally; it is unrelated to the fixture key.
- `PUBLIC_DEMO_MODE=false` and `DEMO_MUTATIONS_ENABLED=true` let a signed-in operator actually change things, which is what you want while developing.

## 5. Migrate and seed

```sh
pnpm db:migrate
pnpm demo:seed
```

The migration applies the SQL files under `supabase/migrations` in order. The four that need Supabase's own auth schema are skipped automatically on a plain PostgreSQL install; that is expected and harmless.

The seed runs all three authored deals through the real intake, classification and extraction pipeline, so it takes a couple of minutes. It finishes by printing one personal portal link per person. **Copy that output somewhere.** Each link is shown once, and running the seed again issues new links and revokes the old ones.

## 6. Start it

```sh
pnpm dev
```

Open http://localhost:3000. You land on the sign-in page.

## Who you can sign in as

These sample accounts exist only on a local seeded database.

| Role     | Email                | Password         | What they see                                       |
| -------- | -------------------- | ---------------- | --------------------------------------------------- |
| Adviser  | adviser@example.com  | acqfile-adviser  | Questions, people and the lender file for each deal |
| Admin    | admin@example.com    | acqfile-admin    | Staff tools at `/staff/deals`, full access          |
| Operator | reviewer@example.com | acqfile-reviewer | Staff tools, can review and file                    |
| Viewer   | viewer@example.com   | acqfile-viewer   | Read-only, cannot open original documents           |

The people who supply documents do not sign in. They use the `/p/<token>` links the seed printed. Open one in a private window so it does not collide with your staff session, and use a narrow phone-width viewport to see it the way they would.

## What to look at first

Follow the [seven-minute walkthrough](WALKTHROUGH.md). It names the exact files to upload and the exact screens to open, in order. Two things from it worth knowing early:

- Deal A deliberately holds back its second batch of files so you can perform the upload yourself.
- `pnpm demo:b-ready` processes Deal B's corrections and produces a genuinely downloadable lender file.

## Checks before you push

Run these in order. The database proofs reset `acqfile_test`, so do not run them at the same time as each other or against your working database.

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm rules:check
pnpm fixtures:check
pnpm fixtures:generate --check
pnpm eval
pnpm build
```

`pnpm test:e2e` drives a real browser. The first run on a new machine needs the browser binary:

```sh
pnpm exec playwright install chromium
```

`pnpm eval` writes a scorecard to `eval/scorecard.html`. Its numbers come from the deterministic provider, so they measure the pipeline and the rules, never model quality.

## When something goes wrong

**`Configure PII_HMAC_KEY with at least 32 characters before deal intake.`** The key is missing or too short in `.env.local`. Scripts read `.env.local` first, then `.env`.

**`Deal not found` or empty screens after signing in.** The seed did not finish. Re-run `pnpm demo:seed` and watch for an error.

**A portal link returns 404.** Links are revoked whenever the seed re-runs. Use the ones the most recent seed printed.

**`No space left on device` during a build.** Next.js caches in `.next` grow large. `rm -rf .next` and build again.

**`pnpm db:migrate` cannot connect.** Check PostgreSQL is running and that `DATABASE_URL` in `.env.local` matches your local setup. The default assumes `postgres://localhost:5432/acqfile` with no password.

## Where the rules live

The [specification](SPEC.md) and its [amendments](SPEC_AMENDMENTS.md) are the build authority, and the amendments win where they disagree. [DECISIONS.md](DECISIONS.md) records every judgement call and why. Read the amendments before changing behaviour; a surprising amount of what looks arbitrary is a deliberate ruling.
