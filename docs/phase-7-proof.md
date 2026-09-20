# Phase 7 proof — 20 September 2026

**Presentation layer complete. Repository PUBLIC, unchanged.** [Screenshots](screenshots/phase-7/README.md): all eleven references at 1440px and 390px, plus the ready lender file (24 images). [Walkthrough](WALKTHROUGH.md) and [pilot runbook](PILOT_RUNBOOK.md) are ready. `REAL_DATA_MODE` remains false. No deployment.

| Command                          | Result                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm lint`                      | PASS; static customer-copy lint and ESLint                                       |
| `pnpm typecheck`                 | PASS                                                                             |
| `pnpm format:check`              | PASS                                                                             |
| `pnpm test`                      | PASS; 178 tests                                                                  |
| `pnpm test:integration`          | PASS; 23 tests                                                                   |
| `pnpm test:e2e`                  | PASS; exactly 3 scenarios, rendered copy/labels/phone overflow checked           |
| `pnpm rules:check`               | PASS; all four pack combinations                                                 |
| `pnpm fixtures:check`            | PASS; five independent oracles, readability and synthetic lint                   |
| `pnpm fixtures:generate --check` | PASS; A 40 / B 32 / C 22 files                                                   |
| `pnpm eval`                      | PASS; all 15 unchanged gates, 371/371 statuses, no regression or false satisfied |
| `pnpm build`                     | PASS; production build                                                           |

**Isolation and behavior.** A token cannot read another party's tasks, receipts or originals, another deal, adviser pages or staff tools; reissue invalidates the previous link and revocation returns 404. Only token digests are stored. `/p` responses carry no-referrer/noindex/no-store, and the proof server log contains zero full personal paths. A wrong-person upload cannot alter that person's current evidence. Can't-send replies are audited, visible to the adviser and leave rows incomplete. Answers preserve facts and create correction tasks. An August replacement preserves July. Ordered photos produce an image-only PDF and enter review. Slow and unsuccessful reads return a usable list. “This is the right document” enters staff review. Reminders acquire a date only after acknowledgment. Palette pairs exceed 4.5:1; inputs are labelled and focus is visible.

**Real readiness.** B's independently authored second batch fixes three problems with four documents and a tied funding profile; its oracle has 76 rows and zero findings. The browser downloaded the ready ZIP (45 entries). A/C plans, truth and bytes, engine, pipeline implementation and Phase 6 gate definitions have zero diff. `pnpm eval --set-baseline` regenerated the baseline **once**, only after its run passed; the subsequent ordinary evaluation also passed. No dependency was added; the two requested fonts use next/font.

**Design differences and choices.** Kiel has four tasks, Abe waits and Terrill is done; the fixtures contain no Alex/Bea or CPA party. Zelmivar Advisory and Faker-seeded Annetta are separate presentation seed metadata; the organization search returned no match. The price question shows all three values. TaskFiles shows the real July/August states, not an invented bad statement. B supplies readiness; A does not become ready after its three fixes. Mixed-party original bundles stay with the adviser. Old customer diagnostic routes/components were removed from that area and relocated under `/staff`, preserving working staff screens. Decisions 120–134 record the choices and reasons.

**Issues resolved during proof.** Fixed file-picker overflow, overlapping polls, evidence omitted by the export index, bundle labels/correction targeting, old-document notices on new photos, and non-applicable lender rows in ready copy. No engine/truth disagreement was patched by copying output into truth. A55/A90–97 resolve the earlier name, count, photo and frozen-fixture contradictions; no unresolved specification contradiction remains.

**Live run:** `pnpm eval:live` skipped: no owner key, $0 spent. Live extraction, especially scans, remains the largest open risk. Phase 7 ends here.

The subsequently authorized complete staff redesign is documented in [its separate proof](staff-redesign-proof.md), with the role matrix, route map and screenshot gallery. The accepted customer-phase proof above is retained.
