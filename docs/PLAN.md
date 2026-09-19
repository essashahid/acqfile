# AcqFile build plan

Authority: [SPEC.md](SPEC.md), read in full, and the user's instruction to do **Phase 0 only**. Each phase must run its proof, update PROGRESS.md and commit with its number before reporting. Phase 1 requires the user's next instruction.

## Starting point

Copy EvidenceOps main `9341148348f8535ed0f15981360728da58fd186c` into an independent private AcqFile repository. Read AGENTS.md, CLAUDE.md, README.md, docs/audit.md and docs/deployment.md before edits. Do not reuse deployment resources or credentials. Preserve the installed Next.js 16 conventions, driver pattern, source provenance, immutable review, durable jobs and regression harness.

## Ordered phases

| Phase | Work | Required proof |
| --- | --- | --- |
| 0 | Record design decisions; verify and pin existing dependencies and model configuration; delete retrieval, embeddings, chunking, answer/draft paths and golden questions across code, migrations, fixtures, tests and UI; retain extraction and reliability checks | lint, typecheck, unit tests and clean production build; additionally exercise retained database integration and browser flows where available |
| 1 | Deal/party/segment/fact schema; YAML packs, validation, overlay merge, immutable pack snapshots, viewer and pure deterministic engine | rules:check and hand-written JSON facts reproduce expected findings |
| 2 | Fixed-clock, fixed-seed synthetic generators and truth for all three deals | repeated generation produces identical file hashes |
| 3 | Safe ZIP/folder intake, format parsing, signatures, segment classification, party/period assignment and manual filing | mock Deal A segment gate; bundle split proposed |
| 4 | Per-type extraction, separate verifier, method-aware confidence, grouped immutable review, entity resolution, fact storage and PII handling | uncertain values route to review; correction creates a version and triggers evaluation |
| 5 | Checklist, findings lifecycle, requests, snapshot/diff, package exports and rule review sheet | Deal A ZIP contains seven artifacts; v1/v2 diff matches changes |
| 6 | Replace inherited extraction metrics with Section 18 gates, HTML QA report and capped live evaluation | mock eval passes; separate measured live result and cost, zero false-satisfied blockers |
| 7 | Three-deal demo, read-only restrictions, walkthrough, pilot runbook, documentation and security pass | every Section 21 command passes |

## Implementation boundaries

- No Phase 1 schema or rule implementation in Phase 0. The retained operational-report extraction corpus is temporary regression scaffolding, not the SBA demo.
- Rules are unverified data with sources; no model determines a checklist status. Unknown facts and facts in review cannot satisfy items.
- Keep SOP packs separate and select by expected loan-number date. Record unresolved specification details in DECISIONS.md before implementing the affected phase.
- Retain the extractor/verifier system prompts verbatim; adapt field definitions in Phase 4.
- Use existing pdf-lib for browser-free server PDF generation and existing JSZip for ZIP writing. Select secure ZIP intake, XLSX and safe condition evaluation dependencies only when needed, after vendor verification.
- Use an injected 2026-09-15 clock for domain and fixture tests. Operational latency may use elapsed time; freeze wall-clock dates in test setup.
- No live evaluation spend, deployment or real-data handling during Phase 0.

## Verification policy

Capture actual command exits and counts in docs/phase-0-proof.md, then summarize in PROGRESS.md. Do not carry inherited benchmark reports forward as AcqFile results. Check that removed routes, provider methods, SQL tables, configuration and golden fixtures are absent. Preserve meaningful extraction, verifier transport, review, authorization, duplicate/version and recovery tests.

## Phase 1 execution and boundary

Authority: SPEC_AMENDMENTS.md and PHASE_1.md. Phase 0 is accepted at b586d9c.

- Load-validated taxonomy/fact registries; Zod profile, parties, ownership and evidenced inputs.
- Additive domain SQL/Drizzle schema, same-deal constraints, append-only events and exact pack snapshots.
- Independently authored SOP 8/8.1 YAML, Sample Lender A required/optional definitions, validated AST, canonical overlay resolution.
- Pure engine with conservative unknowns, scopes/periods, provenance, stable finding keys and deterministic result hashes.
- Rule validation command, XLSX/HTML review exports, authenticated read-only comparison viewer.
- Hand-authored clean/defects/unknowns/traps/packs proofs; invariants; database/browser checks; all retained suites and production build.
- Write phase-1-proof.md, update PROGRESS.md, commit and push AcqFile with Phase 1 in the message, then stop. The Phase 5 review-sheet entry above now means PDF only; XLSX/HTML moved here under A17.
