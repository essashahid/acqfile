# Phase 7 follow-up: complete staff experience

21 September 2026. [Owner request](STAFF_REDESIGN.md). Complete. All required commands passed.

The shared workspace and deal rail now lead to different priorities: Admin oversight, Operator execution, Reviewer evidence and decisions. Stored roles remain `admin`, `reviewer`, `viewer` respectively. The [capability matrix and complete screen map](design/STAFF_DIRECTION.md) document the verified permissions. The [screenshot gallery](screenshots/role-redesign/index.html) covers all three roles, their details and edge states at 1366×768 and 1440×900. Adviser before/after PNGs are byte-identical; its three existing browser journeys remain in the suite.

## Delivered and verified

| Surface                      | Admin                              | Operator                           | Reviewer                                |
| ---------------------------- | ---------------------------------- | ---------------------------------- | --------------------------------------- |
| Workspace and overview       | Oversight, configuration access    | Intake/review priorities           | Coverage, evidence and history          |
| Documents, filing and values | Intake, review, diagnostics        | Intake, filing, value decisions    | Masked text, quotes and page navigation |
| Requirements and findings    | Scoped decisions and reasons       | Scoped decisions and reasons       | Status, evidence and saved reasons      |
| Follow-ups                   | Copy and record as sent            | Copy and record as sent            | Inspect and copy                        |
| Lender file                  | Create, inspect versions, download | Create, inspect versions, download | Inspect saved contents; ZIP denied      |
| Profile, rules, help         | Edit profile; inspect rules        | Edit profile; inspect rules        | Inspect only                            |

Browser proof covers every listed route for every role; current/history/excluded views, pending/decided values, failed files, persisted filters, no results, long names, empty libraries/output, recoverable errors, partial uploads and duplicates. It verifies a correctly scoped waiver and its reason after reload, stored lender tracking `received`, fact rejection with retained reason, readable recipient drafts, recording a message as sent, two saved versions, older-version inspection and server-side Reviewer ZIP denial. Loading was observed and captured; finished-page captures explicitly wait for route and PDF rendering. Adviser and final draft captures use the existing local synthetic demo; mutation journeys use a fresh test seed. Input labels and horizontal overflow are checked, and normal role journeys have no uncaught page errors. The deliberately missing-file journey exercises the error boundary.

## Corrections and decisions

Decisions 153–161 record role aliases, shared navigation with different priorities, current evidence on unmet requirements, useful read-only inspection, informational findings excluded from requests, existing incomplete-version rules, URL-selected immutable history, Adviser isolation, and truthful wording for relationship comparisons. The lender tracking inconsistency was already corrected in the starting commit: an uninitialized select, not a data repair. This pass verifies it and keys manual confirmation lookup by its check as well as requirement scope. No persisted value was overwritten to improve appearance.

Visual review corrected native tables being turned into CSS grids, oversized navigation, crowded comparison columns, raw type labels on evidence links and premature loading captures. Drafts name fields and document pages, keep distinct sources, and exclude diagnostic payloads and informational-only demands. Superseded value records remain available. Removed the unused legacy `Documents`, `DeliverableNav` and `DealTabs` components; no dependency or migration was added.

## Command results

| Command                          | Result                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                      | PASS, including customer-copy lint                                                                     |
| `pnpm typecheck`                 | PASS                                                                                                   |
| `pnpm format:check`              | PASS                                                                                                   |
| `pnpm test`                      | PASS: 189 tests, 16 files                                                                              |
| `pnpm test:integration`          | PASS: 30 tests, 9 files; deliverables rechecked after final draft wording                              |
| `pnpm test:e2e`                  | PASS: 10 scenarios (7 staff, 3 existing customer); final draft text also inspected under all roles     |
| `pnpm rules:check`               | PASS: 52 document types, 79 fact attributes                                                            |
| `pnpm fixtures:check`            | PASS: all five independent oracles, readability and synthetic-data lint                                |
| `pnpm fixtures:generate --check` | PASS: A 40, B 32, C 22 files                                                                           |
| `pnpm eval`                      | PASS: all 15 unchanged gates, 371/371 checklist statuses, zero false satisfied, no baseline regression |
| `pnpm build`                     | PASS: production build                                                                                 |

No engine, pipeline, fixture, scorecard gate or baseline changes are included. The latest scorecard records the passing run; only its date and measured duration changed. All database proofs use the synthetic test database, sequentially. No messages, live model calls, real data or deployment; cost $0. Repository observed PUBLIC and left unchanged.

## Limits

Reviewer original/ZIP restrictions are existing policy; scans may provide only masked quoted evidence to that role. Rule-definition editing, user management, lending approval and automatic email delivery do not exist and were not invented. Creating an incomplete version remains permitted with explicit confirmation. Focused research is linked in the direction document: public help text was inspected; vendor image access was limited (Rossum image URLs expired; Content Snare rate-limited), so no authenticated-screen inspection is claimed. No unresolved permission or domain-policy contradiction was found.
