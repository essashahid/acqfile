# Phase 0 architecture

Next.js App Router renders workspace-scoped server queries. Mutations authorize workspace membership and role, then call services. Signed-session auth, database, private storage, jobs and LLM providers retain the base driver pattern and local/mock variants.

Upload → SHA-256 duplicate/version registration → source-block parsing → extraction → deterministic validation → independent verification → code-computed confidence → immutable review → finalize.

PostgreSQL stores source versions and locators, extraction/review records, durable run steps, model usage, dead letters, evaluation results and QA report references. Source blocks preserve provenance. There are no retrieval tables, vector extension, chunking jobs or answer routes.

Model extraction and verification use the inherited Responses/Zod adapter. Mock is explicit and deterministic; live models must differ. The extraction evaluation harness retains compatible baselines and durable case replay. HTML reports escape source text and are served through authorized private routes with a restrictive content policy.

Phase 1 will extend this foundation with the specified deal/party/fact schema and rule engine. None of that phase is implemented here.
