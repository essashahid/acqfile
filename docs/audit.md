# AcqFile Phase 0 audit

Read the base audit and deployment runbook at EvidenceOps main `9341148348f8535ed0f15981360728da58fd186c` before code changes. Their historical hosted status and benchmark scores do not apply to AcqFile.

The new codebase removes the complete retrieval/answer stack and retains extraction provenance, immutable review, authorization, durable steps, idempotent resume, run accounting, evaluation checkpoint replay and HTML QA output. Dedicated local databases and a single AcqFile Git remote prevent accidental reuse of the base deployment.

The operational-report schema and fixtures are temporary regression scaffolding. There are no deal schemas, SBA rules, acquisition fixtures, package exports or live-model quality results yet. Follow SPEC.md phases in order.

Measured verification is recorded in [phase-0-proof.md](phase-0-proof.md); current status is in [PROGRESS.md](PROGRESS.md). The user has explicitly reserved Phase 1 for a later instruction.
