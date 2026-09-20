# Sample-data pilot

Keep `REAL_DATA_MODE=false`. Use a local PostgreSQL database with `AUTH_DRIVER=local`, `STORAGE_DRIVER=local`, `JOB_DRIVER=inline` and `LLM_PROVIDER=mock`. For this sample corpus, export `PII_HMAC_KEY=OBVIOUSLY-FAKE-ACQFILE-FIXTURE-KEY-NOT-FOR-PRODUCTION-2026` in the seed and server shell so identifier matching uses the same sample key. See `.env.example`. The repository stays at its owner's chosen visibility; this phase does not deploy or change visibility.

1. Run `pnpm db:migrate`, `pnpm demo:seed`, then `pnpm dev`. Copy the printed personal links to a private local note; they cannot be recovered from storage. Seed reruns reissue them. Sign in as `adviser@example.com` / `acqfile-adviser`.
2. Open Kiel's link on a phone. It shows actual outstanding documents and one send-by date. A person can send several files, ordered JPG/PNG photos, a note, or explain why something cannot be sent. Unsupported image types receive a calm instruction. No answer changes an extracted fact.
3. The adviser sees explanations and questions on the deal page, can agree to a date or waive a document with a reason, and can revoke/reissue a personal link. “Send a reminder” opens email; only “I sent it” records a reminder date. There is no outbound email service.
4. Use the separate staff login and `/staff/deals` to inspect originals, confirm boundaries and review extracted values. Bundles containing another person's pages are deliberately unavailable through a recipient link. An uncertain replacement remains with staff.
5. Run `pnpm demo:b-ready` for the independently authored B correction batch and truth-grounded human-review simulation. Refresh the adviser page: only then is the lender file ready to download. This describes file preparation, not a lending decision.

A slow or unsuccessful read leaves a usable list after at most 20 seconds. Staff can retry from the existing working screen. If a link is shared accidentally, revoke and reissue it. `/p` responses set no-referrer/noindex; application request logging excludes full personal paths. Any external reverse proxy must likewise suppress `/p` paths before using it for a pilot.

Run the [Phase 7 proof](phase-7-proof.md) before sharing a build. No owner provider key was present for the recorded proof: live extraction, especially scans, is the largest open risk. `pnpm eval:live` performs the existing USD 5 preflight and cap when a key is supplied. No real borrower data or lender acceptance is claimed.
