# Temporary extraction regression corpus

These inherited synthetic operational reports exercise the retained extraction, provenance, review, duplicate and corrected-version behavior during Phase 0. They are not the SBA acquisition fixtures.

`pnpm fixtures:generate` regenerates the 20 source files, manifest, per-version truth and corrupt/unreadable parser examples. PDF metadata and DOCX timestamps are fixed. The question set and its generator are deleted.

The mock provider reads truth deliberately. Its scores test implementation behavior, not live model quality. Phase 2 replaces this corpus with the specified three synthetic deals.
