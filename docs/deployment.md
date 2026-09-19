# AcqFile deployment notes

Phase 0 is local foundation work. No AcqFile hosted resources are provisioned or verified. The repository is `essashahid/acqfile`, private. Do not link or deploy this repository to the EvidenceOps project, database or storage.

Use a dedicated direct PostgreSQL connection (session advisory locks require it), private Blob storage, database-backed signed sessions and Inngest for a future Vercel deployment. Local variants are PostgreSQL, filesystem storage, local signed sessions and inline jobs.

Configuration is described in `.env.example`. Hosted operation needs DATABASE_URL, AUTH_DRIVER=database, AUTH_SECRET (48+ random characters), STORAGE_DRIVER=blob, BLOB_READ_WRITE_TOKEN, JOB_DRIVER=inngest, INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY. Explicit live processing additionally requires LLM_PROVIDER=openai, OPENAI_API_KEY, OPENAI_EXTRACT_MODEL and OPENAI_VERIFY_MODEL; live models must differ. Local/CI defaults are mock. REAL_DATA_MODE accepts only false in this build.

Models and standard prices were checked against official documentation; see DECISIONS.md. Phase 0 makes no live calls. Native PDF input, live budget estimation and live evaluation remain future phases.

Fresh migrations intentionally omit the removed retrieval tables. Never apply these copied and edited migrations as an EvidenceOps database upgrade. Local tests use only `acqfile_test` and reset its schema.

The inherited deployment helper remains available for later review but has not been run. Before deployment, create and verify dedicated AcqFile resources and explicitly link the AcqFile project; use isolated preview/development resources. Phase 7 owns deployment readiness and complete security verification.
