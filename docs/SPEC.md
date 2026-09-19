# MASTER BUILD PROMPT: Opportunity 1 MVP

**SBA 7(a) business-acquisition file preparation workbench. Working name: AcqFile.**
Prepared 19 September 2026.

> **Before you send this (delete this box)**
> - Every assumption I made sits in Section 1, PARAMETERS. Edit there and nowhere else.
> - `BASE_REPO` assumes you want to build on EvidenceOps. Set it to `none` for a clean start; the rest of the prompt still holds.
> - The checklist in Section 13 is a seed built from public sources and is marked unverified on purpose. The agent also builds a rule-pack review sheet. Hand that sheet to Asif: his corrections are the most valuable output of the first call.
> - SOP 50 10 8.1 takes effect on 1 October 2026. The prompt specifies two rule packs. Do not let the agent merge them into one.

---

You are building a finished internal MVP called **AcqFile**.

Do not treat this as an exploratory prototype. Build it end to end, test it, seed it with deterministic synthetic deals, and leave the repository deployable.

Do not ask me implementation questions. Where this specification makes a decision, follow it. Where a detail is unspecified, choose the simplest production-sensible option consistent with this document and record it in `docs/DECISIONS.md` with one line of reasoning. Do not substitute another architecture because you prefer it.

Three standing rules:

1. **Verify before pinning.** Do not trust version strings, model identifiers, prices or API shapes from this prompt or from memory. Check the base repo's lockfile and the vendor's current documentation, then pin.
2. **Do not fabricate.** Report only metrics the evaluation suite produced. Do not describe a feature as built unless it exists and is tested.
3. **Do not add SBA rules from memory.** A rule enters a rule pack only with a `source_ref`. Anything you believe is a rule but cannot source goes in `docs/RULE_CANDIDATES.md`.

# 1. PARAMETERS

| Key | Value |
| --- | --- |
| PRODUCT_CODENAME | `AcqFile` (keep in one config constant so it can be renamed) |
| BASE_REPO | `https://github.com/essashahid/EvidenceOps` at current `main`. This is the owner's own prior work. Copy it as the starting codebase. No runtime dependency on it. If it is unreachable, build greenfield on the same stack and patterns and say so in `docs/DECISIONS.md`. |
| REPO_VISIBILITY | private |
| DATA_MODE | synthetic only |
| FIXTURE_AS_OF_DATE | 2026-09-15 (inject a clock; no test may read the system date) |
| RULE_PACKS | `sop-50-10-8` for an expected SBA loan number before 2026-10-01; `sop-50-10-8-1` on or after |
| LLM | Keep the base repo's provider adapter and its explicit mock mode. All model identifiers via env. Extractor and verifier must be different models. Image-only pages use the provider's native PDF or image input. |
| MAX_LIVE_EVAL_COST_USD | 10. Estimate before running; abort if the projection exceeds it. |
| TIMEBOX | Seven phases (Section 23). Stop adding features when the Phase 7 gates pass. |
| DEMO_AUDIENCE | Commercial finance brokers, SBA loan packagers, acquisition advisers, and one bank SBA lending contact |

# 2. MISSION

We are a small services agency. The opportunity is a done-for-you service that prepares SBA 7(a) business-purchase (change of ownership) loan files for firms with repeat deal volume, before the file reaches the lender. No customer, budget or sample file is confirmed yet.

The MVP has two jobs:

1. **Discovery demo.** Show, on synthetic deals, a messy folder turning into a lender-ready file with its open issues listed. We use this in first conversations with a lending contact and with brokers.
2. **Pilot tool.** Be the internal workbench our operators would use to run one paid test on a broker's past files.

AcqFile is an internal tool that powers a service. It is not software we sell. Build for one trained operator, not for self-serve borrowers.

Every deal produces four deliverables:

1. an **indexed file**;
2. a **missing-item list**;
3. a **conflict list**;
4. a **source record**.

What must be visibly true of the product:

- it owns one complete, repeated task;
- every result points back to its source document, page and text;
- unclear items go to a review list and are never guessed;
- the second customer needs configuration, not code.

# 3. HARD GUARDRAILS

These override everything else in this document.

1. **No decisions.** Never output an approval, decline, eligibility determination, debt service coverage pass or fail, creditworthiness view, deal structuring advice or lender match. Arithmetic comparisons are allowed only as flags "for lender review" that show both source values. User-facing text and exports must not use: "eligible", "ineligible", "qualifies", "approved", "compliant", "meets SBA requirements". Use: "received", "missing", "stale", "incomplete", "inconsistent", "for lender review". Rename the base repo's user-facing "auto-approved" label to "auto-accepted". Add a lint test that scans UI strings, templates and generated exports for the banned terms.
2. **Rules are data, not law.** Every rule carries `source_ref`, pack version and `verified: false` until a subject-matter expert confirms it. The UI and every export mark unverified rules.
3. **Code decides status; models do not.** Models classify, extract, verify and draft text. Presence, freshness, completeness and consistency are evaluated by deterministic code over stored facts.
4. **No silent pass.** If the system cannot determine something, the status is `needs_review`. Marking an item satisfied when it is not is the worst failure this product can have.
5. **Nothing is sent automatically.** Request messages are drafts the operator copies.
6. **Synthetic data only.** No real personal data in the repo, fixtures, logs or screenshots. Use SSNs from never-issued ranges (area 900 to 999) and EINs with the invalid prefix `00-`. Watermark every fixture page `SYNTHETIC`. `REAL_DATA_MODE=false` by default, with a visible banner.
7. **PII hygiene from day one.** Mask SSN, EIN and account numbers in the UI (last four). Store SSN and EIN as a keyed HMAC plus last four, never in clear. Never store ID or passport numbers. No document text or extracted personal data in logs or run events: IDs and counts only. Private storage, signed URLs, per-client workspace isolation, and a purge command that deletes a deal's files, facts and model payloads and writes a deletion record.
8. **IP independence.** This repository must be independent of any tariff, HTS, customs or trade-data system and of any employer-owned code, prompts, schemas, rules or test cases.
9. **Export footer.** Every exported file ends with: "Prepared from documents supplied by the parties. Flags are preparation aids for lender review. They are not credit, legal, tax or eligibility determinations. Rule pack: {pack} {version}. Rules marked unverified have not been confirmed by a lender."

# 4. DOMAIN PRIMER

You are not expected to know SBA lending. This is what you need.

**Actors.** Buyer (one or more individuals plus an acquisition entity). Seller (entity plus its owners). Business broker (sell side). Loan broker, packager or acquisition adviser (our customer). Lender (an SBA 7(a) lender). CPAs and attorneys on both sides. Valuation firm. Landlord.

**Flow.** Letter of intent, then lender pre-qualification, then file assembly (our job), then underwriting, commitment and closing. Our job ends when the file is complete, organized and internally consistent, with every open issue listed and sourced.

**Why files stall.** Documents arrive from five parties by email. Scans, phone photos, several documents in one PDF, meaningless filenames. Wrong tax year. Unsigned or undated forms. Stale financials. Purchase price, seller note and ownership percentages that disagree between the letter of intent, the purchase agreement, the sources and uses, the SBA form and the operating agreement. Equity injection that is claimed but not evidenced.

**Rules context, September 2026.** Treat all of this as unverified input to the rule packs.

- SOP 50 10 8 has governed since 1 June 2025. SBA issued SOP 50 10 8.1 on 14 August 2026. It applies to loans that receive an SBA loan number on or after 1 October 2026. The trigger is the loan number date, not the application date.
- SOP 50 10 8.1 moves change-of-ownership rules into a new Appendix 15 with four transaction categories: initial acquisition, business expansion, owner buyout, ESOP or cooperative. The lender decides the category. We record what we are told.
- Reported 8.1 changes that affect file contents: an independent business valuation on every change of ownership; a lender-ordered quality of earnings report when the business purchase price is 3,000,000 USD or more for initial acquisitions and expansions; seller standby notes, other standby debt and non-controlling minority investor equity together limited to half of the required equity injection; a seller may stay as a consultant for up to 24 months (12 under SOP 50 10 8); historical rather than projected earnings carry the coverage test.
- Under both versions a complete change of ownership needs an equity injection of at least 10 percent of total project costs, and a seller note counts toward it only on full standby for the life of the SBA loan and only up to half of the requirement.
- Since 1 March 2026, SBA notices require every direct and indirect owner to be a U.S. citizen or U.S. national residing in the United States; 8.1 extends this to guarantors. The rule is reported to be under legal challenge. We track the evidence document and flag for lender review. We never state an outcome.
- The current SBA Form 1919 revision is 02/2025. SBA is revising forms for 8.1. Form revision is therefore a configurable value, not a constant.
- People paid to help with an SBA application are "Agents" under 13 CFR Part 103 and are disclosed on SBA Form 159. Compensation above 2,500 USD requires an itemization of work, hours and rates. This is why the work log in Section 6 exists.

If you have web access, fetch the official SOP 50 10 8.1 from sba.gov and replace secondary `source_ref` values with section and page references where you can find them. If not, keep the secondary sources listed in the appendix.

# 5. USERS AND WORKFLOW

**Roles.** `admin`, `operator` (the base repo's reviewer), `viewer` (a client's read-only user). A workspace is one client firm. Deals live inside a workspace. Our operators belong to several workspaces.

**Operator workflow.**

1. Create a deal; enter the deal profile and parties (Section 10).
2. Drop in a folder or ZIP of whatever has arrived.
3. The system hashes, de-duplicates, parses, splits bundles, classifies, assigns parties and periods, and extracts the facts the rules need.
4. The operator clears the review queue, one document at a time, with the source beside each value.
5. The system evaluates the rule pack and shows the checklist matrix and findings.
6. The operator confirms or dismisses conflict candidates, with a reason.
7. The system drafts one request per responsible party. The operator edits, copies, and marks it sent.
8. New documents arrive. The system re-evaluates. Findings resolve or reopen with their history intact.
9. The operator generates a package snapshot: the ZIP with the four deliverables plus a change log against the previous snapshot.
10. The deal overview always shows readiness counts, blockers and the oldest outstanding request.

Anything the system cannot read must still be fileable. The operator can always classify a document by hand and enter facts by hand with a page reference. Those facts carry `method = manual` and the operator's identity.

# 6. SCOPE

## Must build (v1)

- Deals, parties, ownership links, deal profile.
- Folder and ZIP intake with SHA-256 duplicate detection and source versioning.
- Parsing: PDF text layer, PDF AcroForm fields, DOCX, XLSX, image-only page detection, password-protected and corrupt file detection.
- Segment-level classification: one file can hold several logical documents, each with a page range, type, party, period and form revision.
- Extraction of rule-feeding facts with provenance, deterministic validation, independent verification, code-computed confidence and routing.
- A vision path for image-only pages.
- Entity resolution of names and identifiers to deal parties.
- Review queue grouped per document segment, with immutable versions and stale-edit rejection.
- Rule packs, overlays, a deterministic rule engine, and a rule-pack viewer.
- Checklist matrix, findings lifecycle, request drafts, snapshots with diff, and the deliverable exports.
- Rule-pack review sheet export for a subject-matter expert.
- Synthetic deal generator with planted defects and truth files.
- Evaluation harness, regression gates, HTML QA report.
- Carry-over reliability: durable steps, retries, dead letters, idempotent resume, failure injection, run observability, cost tracking.
- Read-only public demo mode with seeded deals.
- Append-only audit events for every user and system action.

## Nice to have, in this order, only after every gate passes

1. Work log per deal (activity, minutes, note) with an itemized export to support Form 159.
2. Single bookmarked binder PDF.
3. Pilot comparison: import a past deal's actual lender deficiency list as CSV and report which items AcqFile found.
4. Tokenized read-only status page for the client.

## Do not build

Credit analysis, financial spreading, coverage ratios, eligibility screening, lender matching, credit memo drafting, borrower self-serve portal, e-signature, email sending, inbox ingestion, SBA E-Tran integration, a separate OCR engine, RAG or chat over documents, a generic agent framework, SSO, billing, a mobile app, n8n, Make or Zapier, Kubernetes, Terraform.

# 7. STARTING POINT AND STACK

Read the base repo's `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/audit.md` and `docs/deployment.md` before writing code. Follow its warning about Next.js 16 conventions.

**Stack: whatever the base repo ships with.** Next.js 16 App Router, React, TypeScript, PostgreSQL with Drizzle, private blob storage with a local filesystem driver, signed database sessions, Inngest with an inline job driver for local runs, Zod, Vitest, Playwright, Tailwind, shadcn/ui, TanStack Table, pdfjs-dist, pdf-lib, mammoth, a fixed-seed Faker. Add only: an XLSX reader and writer, a ZIP reader and writer, and a small safe expression evaluator for rule conditions (JSON-logic style; no `eval`). PDF generation must work in the production serverless runtime without a headless browser. Choose a pure JavaScript approach and record it.

**Keep (generic, already proven).** The driver pattern for database, storage, auth, jobs and LLM with local and mock variants. Upload hashing, duplicate detection, source versioning. Source blocks and locators. The chain extract, deterministic validation, independent verification, code-computed confidence, routing. The two-panel review screen, immutable record versions, stale-edit rejection. Durable steps with retry, dead letter and idempotent resume. Failure injection. Run observability and the central price configuration. The evaluation harness with baseline regression gates. The HTML QA report. Public read-only demo mode. Rate limiting. Workspace roles.

**Adapt.** Documents belong to a deal. Classification becomes segment-level against the taxonomy in Section 9. Extraction schemas become per document type. Confidence becomes method-aware (Section 12). Review is grouped per segment. Evaluation metrics are replaced (Section 18).

**Remove from v1.** RAG, embeddings, pgvector, chunking, drafting modes, the golden question set, and their UI and tables. Delete them. Do not leave dead code.

# 8. DATA MODEL

Extend the base schema. UUID keys, timestamptz, foreign keys, sensible indexes, constrained enums.

- `deals`: workspace, `code`, name, status (`intake`, `in_progress`, `ready_for_lender`, `closed`, `archived`), `profile_json` (Zod-validated), rule pack version, overlay id, `as_of_date`, target submission date, expected loan number date.
- `parties`: deal, kind (`individual`, `entity`), roles (`buyer_owner`, `guarantor`, `buyer_entity`, `seller_entity`, `seller_owner`, `affiliate`, `donor`, `investor`, `landlord`, `cpa`, `attorney`, `broker`, `lender_contact`), legal name, name variants, HMAC and last four of SSN or EIN.
- `ownership_links`: owner party, owned party, percent, stage (`pre_closing`, `post_closing`), origin (`declared`, `extracted`).
- `documents`, `document_versions`: from the base, now with `deal_id`.
- `segments`: document version, page start and end, `doc_type`, party, period, form revision, signed and dated indicators, classification method (`signature`, `llm`, `manual`), classification confidence, status (`proposed`, `confirmed`, `rejected`), `is_current`.
- `facts`: deal, segment, subject party, namespaced `attribute`, value, normalized value, unit, period, method (`acroform`, `text`, `vision`, `manual`, `declared`), locator (page, source block, quote, optional region), confidence and its components, routing status, record version, `is_current`.
- `record_versions`, `review_items`, `review_actions`: from the base. Review item types: `classification`, `segmentation`, `party_assignment`, `fact`, `conflict_confirmation`, `unreadable`.
- `rule_pack_snapshots`: pack, version, overlay, content hash, resolved YAML. Rules live as files in the repo. Each evaluation stores the exact resolved pack it used.
- `evaluations`: deal, rule pack hash, facts hash, result hash, timing.
- `checklist_status`: evaluation, item id, scope key (party and period), status, satisfying segment ids, reasons.
- `findings`: deal, stable `finding_key`, rule id, type (`missing`, `stale`, `incomplete`, `conflict`, `needs_review`, `info`), severity (`blocker`, `major`, `minor`, `info`), subject, period, details (each side's value and fact id), status (`open`, `requested`, `received`, `resolved`, `dismissed`, `waived`), responsible role, first and last seen evaluation, resolution note, resolver.
- `requests`: deal, recipient role or party, subject, body, finding ids, status (`draft`, `marked_sent`, `closed`), marked-sent time, due date.
- `snapshots`: deal, version number, evaluation, manifest with file hashes, storage path, author.
- `events`: append-only audit with actor, action, entity, masked before and after values.
- `processing_runs`, `run_steps`, `eval_*`: from the base.

# 9. DOCUMENT TAXONOMY

**Extracted types** (fields in Section 12): `SBA_1919`, `SBA_413`, `TAX_PERSONAL`, `TAX_BUSINESS`, `FIN_YEAR_END`, `FIN_INTERIM`, `AGING_AR`, `AGING_AP`, `DEBT_SCHEDULE`, `LOI`, `PURCHASE_AGREEMENT`, `SOURCES_USES`, `SELLER_NOTE`, `BANK_STATEMENT`, `GIFT_LETTER`, `LEASE`, `OPERATING_AGREEMENT`, `EIN_LETTER`, `GOV_ID`, `CITIZENSHIP_EVIDENCE`, `IRS_4506C`, `SBA_159`, `CONSULTING_AGREEMENT`, `VALUATION`, `QOE`.

**Classification-only types:** `RESUME`, `CREDIT_AUTH`, `FORMATION_DOC`, `GOOD_STANDING`, `OWNERSHIP_CHART`, `BUSINESS_PLAN`, `PROJECTIONS`, `ADDBACK_SCHEDULE`, `EQUIPMENT_LIST`, `LICENSE`, `FRANCHISE_AGREEMENT`, `CIM`, `ESCROW_EVIDENCE`, `NON_COMPETE`, `RE_CONTRACT`, `OTHER_NOT_REQUIRED`, `UNREADABLE`.

Keep a **signature library** in config: form numbers, OMB numbers, title phrases and AcroForm field-name patterns per type. Classify by signature first, deterministically and offline. Call the model only when signatures are inconclusive or the file may be a bundle.

# 10. DEAL PROFILE

Entered by the operator. Drives which rules apply. The system also extracts the same facts from documents and raises a conflict when a document disagrees with the declared profile.

Fields: transaction category as stated by the broker or lender; structure (`asset`, `stock`); business purchase price; total project cost; real estate included; franchise and brand; seller note (amount, counted toward equity injection or not); gift funds; minority investor equity; seller staying on (role, months); target lender (selects the overlay); expected SBA loan number date (selects the rule pack); target submission date; the parties, their roles and the post-closing ownership table including indirect owners; affiliates of each guarantor.

# 11. PIPELINE

**Per file.** `upload → hash_dedupe → parse → segment_classify → assign_party_period → extract → deterministic_validate → independent_verify → calculate_confidence → route_review → finalize_segment`

- Exact duplicate: no new version, no parsing, no model call, a `duplicate_detected` event, a link to the existing version.
- Same logical document with new bytes: new version, prior version kept and superseded.
- Password-protected, corrupt or unreadable: `UNREADABLE`, high-priority review item, manual filing available.
- ZIP intake: guard against path traversal, nested archives, decompression bombs and oversized files. Sniff types by magic bytes, not extension.
- Bundles: the classifier proposes non-overlapping segments that cover every page. Uncertain boundaries become a `segmentation` review item where the operator confirms or edits page ranges.

**Per deal.** `evaluate_rules → compute_findings → update_readiness`

- Trigger on segment finalization, any review action, a profile change, a rule pack or overlay change, or a manual request. Debounce.
- It is a pure function of: deal profile, parties, current confirmed segments, current accepted facts, the resolved rule pack and the as-of date. Same inputs must give a byte-identical result hash.
- A fact that is still in review never satisfies anything. A rule that depends on it yields `needs_review`.
- `finding_key = hash(rule_id, scope_key, period)`. Findings persist across evaluations. When the condition disappears, the system resolves the finding and records which segment or fact resolved it. When it returns, the finding reopens.

# 12. EXTRACTION, CONFIDENCE, REVIEW

**Methods, in order of preference.** AcroForm field read. Text layer plus model with verbatim quote evidence. Vision model on page images with page-level evidence. Manual entry.

**Rule-feeding facts.** Extract only what an active rule consumes, and derive that list from the rule pack. Starting set:

| Type | Facts |
| --- | --- |
| SBA_1919 | applicant legal name, DBA, EIN, entity type, address, loan amount requested, owners (name, title, percent, SSN last four), form revision, signed, signature date |
| SBA_413 | name, as-of date, cash, total assets, total liabilities, net worth, signed, signature date, spouse signature present |
| TAX_PERSONAL | taxpayer names, tax year, SSN last four, page count |
| TAX_BUSINESS | entity name, EIN, form type, tax year, gross receipts, net or ordinary business income, officer compensation, depreciation, interest expense |
| FIN_YEAR_END, FIN_INTERIM | entity name, period start and end, revenue, net income, total assets, total liabilities |
| AGING_AR, AGING_AP | as-of date, total |
| DEBT_SCHEDULE | as-of date, debts (creditor, balance, payment), total |
| LOI | buyer, seller, purchase price, structure, seller note amount and terms, expiry date, signed by both |
| PURCHASE_AGREEMENT | parties, structure, purchase price, allocation table present, seller note amount and terms, closing or outside date, executed |
| SOURCES_USES | each source and use with amount, both totals |
| SELLER_NOTE | principal, rate, term, standby wording (full standby for the life of the SBA loan: yes, no or unclear, with the quote) |
| BANK_STATEMENT | account holder, institution, account last four, period end, ending balance |
| GIFT_LETTER | donor, recipient, amount, no-repayment statement present, signed |
| LEASE | landlord, tenant, premises address, commencement, expiry, renewal options, assignment clause present |
| OPERATING_AGREEMENT | entity, members (name, percent), signed |
| EIN_LETTER | entity, EIN |
| GOV_ID | name, expiry date |
| CITIZENSHIP_EVIDENCE | name, evidence kind (passport, birth certificate, naturalization certificate) |
| IRS_4506C | taxpayer, identifier last four, years requested, signature date |
| SBA_159 | agent, services, amount, payer, agent and applicant signatures present |
| CONSULTING_AGREEMENT | party, term in months |
| VALUATION, QOE | subject company, report date, preparer and credential, concluded value (valuation only) |

**Normalization.** Entity suffixes and punctuation, EIN and SSN formats, money, dates including forms such as `4 Sept. 26`, percentages, light address normalization. Normalized equality drives conflict detection.

**Entity resolution.** Match extracted names and identifiers to deal parties. An identifier match outranks a name match. Ambiguity becomes a `party_assignment` review item. Never auto-merge on a fuzzy name alone.

**Confidence, computed in code.**

- `acroform`: 1.0 when the field mapping is known and validators pass; otherwise review. No model call.
- `text`: the base formula and thresholds. `0.30 exact evidence + 0.20 deterministic validation + 0.25 verifier support + 0.15 cross-pass agreement + 0.10 evidence specificity`. Auto-accept at 0.86 or above, review from 0.65, blocked below. Unsupported evidence and contradictions block regardless of score.
- `vision`: `0.35 dual-read agreement + 0.25 deterministic validation + 0.30 verifier support + 0.10 evidence specificity`. A rule-feeding fact read by vision is never auto-accepted.
- `manual`: 1.0 with the actor recorded.

The verifier never sees the extractor's confidence and runs on a different model.

**Review.** One screen per segment. Left: the page with the evidence highlighted, or the page image. Right: every pending value for that segment with its confidence breakdown and verifier reason. Actions: Accept, Edit and accept, Reject, Needs a better copy, Reclassify. "Needs a better copy" opens an `incomplete` finding.

**Classifier system prompt.** Use verbatim apart from structured-output wrappers.

```text
You are AcqFile Classifier. You receive the pages of one uploaded file from a
small-business acquisition loan file, as page text or page images.

Identify each logical document in the file and return its page range.

Rules:
1. Use only what is on the pages. No outside knowledge.
2. Choose doc_type only from the supplied list. Use OTHER_NOT_REQUIRED for
   irrelevant material and UNREADABLE for pages that cannot be read.
3. A file may contain several logical documents. Return one segment per logical
   document. Segments must not overlap and must together cover every page.
4. For each segment return: doc_type; the person or entity it is about, exactly
   as written; the period it covers, exactly as written and normalized; the
   form revision if printed; whether a signature and a signature date are
   visible; and for each of these a short verbatim quote, or a page reference
   when the page is an image.
5. If you are unsure between two types, return both, preferred first, and set
   uncertain to true.
6. Never guess a party or a period that is not on the page. Return null.
7. Return only JSON matching the schema.
```

Reuse the base extractor and verifier system prompts. Change only the field definitions supplied per document type.

# 13. RULE PACKS

Rules are YAML in `rulepacks/`, validated by Zod at load, shown read-only in the UI, and snapshotted per evaluation.

```yaml
pack: sba7a-cho
version: sop-50-10-8-1
effective: { loan_number_on_or_after: 2026-10-01 }
verified: false
items:
  - id: GUA-01
    title: Personal financial statement (SBA Form 413 or lender equivalent)
    scope: per_guarantor
    applies_when: true
    accepts: [SBA_413]
    required: true
    severity: blocker
    responsible: buyer
    checks:
      - { type: freshness, fact: as_of_date, max_age_days: 90 }
      - { type: signed_and_dated }
      - { type: arithmetic, expr: "total_assets - total_liabilities == net_worth", tolerance_abs: 1 }
    source_ref: "Lender convention; SBA Form 413 instructions"
    verified: false
consistency:
  - id: CON-03
    title: Purchase price agrees across LOI, purchase agreement and sources and uses
    attribute: deal.purchase_price
    across: [LOI, PURCHASE_AGREEMENT, SOURCES_USES, DECLARED_PROFILE]
    tolerance_abs: 0
    severity: blocker
    responsible: broker
    source_ref: "Internal consistency check; no SBA citation needed"
    verified: false
```

**Check types to implement:** `presence`, `freshness`, `signed_and_dated`, `period_coverage` (for example, each of the last three tax years), `form_revision`, `page_completeness` (detect "Page X of Y" against the page count), `arithmetic`, `fact_agreement`, `fact_comparison`, `date_order`, `manual_confirmation` (an operator checkbox with a note), `tracking` (lender-ordered items with a manually set state: `not_started`, `ordered`, `received`).

**Checklist statuses:** `satisfied`, `received_with_issues`, `missing`, `needs_review`, `not_applicable`, `waived` (operator, with a reason), `tracking`.

**Overlays.** `rulepacks/overlays/<lender-or-client>.yaml` extends a pack. It can add, remove or rename items, change parameters, change severity, and define the index folder scheme and filename template. Adding an overlay must change the checklist with no code change. There is a test for exactly this.

**Pack selection.** By the deal's expected SBA loan number date. If that date is within 14 days of a pack boundary, raise an `info` finding: confirm the applicable SOP version with the lender.

## Seed checklist

Ship every row below in both packs unless the Packs column says otherwise. All `verified: false`.

**Transaction**

| ID | Item | Applies when | Checks | Responsible | Packs |
| --- | --- | --- | --- | --- | --- |
| TXN-01 | Signed letter of intent | always | signed by both; not expired | broker | both |
| TXN-02 | Purchase agreement, draft or executed, with purchase price allocation | always | parties match deal parties; allocation present; page completeness | buyer attorney | both |
| TXN-03 | Sources and uses | always | totals foot; presence | broker | both |
| TXN-04 | Seller note or term sheet | seller note | principal, term, standby wording extracted | seller | both |
| TXN-05 | Standby agreement (SBA Form 155 or lender equivalent) | seller note counted toward injection | tracking | lender | both |
| TXN-06 | Seller consulting or transition agreement | seller staying on | term in months extracted | seller | both |
| TXN-07 | SBA Form 159 per paid agent | any agent compensated | agent and applicant signatures | broker | both |
| TXN-08 | Independent business valuation | 8.1: always. 8: `manual_confirmation` "confirm with lender whether required" | tracking, lender-ordered | lender | differs |
| TXN-09 | Quality of earnings report | 8.1 and category is initial acquisition or business expansion and business purchase price at or above 3,000,000 | tracking, lender-ordered | lender | 8.1 only |
| TXN-10 | Non-compete; CIM; escrow evidence | overlay only | presence | varies | overlay |

**Buyer entity**

| ID | Item | Checks | Responsible |
| --- | --- | --- | --- |
| ENT-01 | SBA Form 1919 | form revision equals configured value (default 02/2025); signed and dated; ownership table sums to 100; every 20 percent or greater owner listed | buyer |
| ENT-02 | Formation documents | presence | buyer |
| ENT-03 | Operating agreement or bylaws | signed; members and percents extracted | buyer |
| ENT-04 | EIN confirmation letter | EIN extracted | buyer |
| ENT-05 | Certificate of good standing | presence; freshness via overlay | buyer |
| ENT-06 | Post-closing ownership chart including indirect owners | presence | buyer |
| ENT-07 | Business plan and projections with assumptions | presence | buyer |

**Each guarantor** (every owner of 20 percent or more, plus anyone else the deal profile marks as guarantor)

| ID | Item | Applies when | Checks |
| --- | --- | --- | --- |
| GUA-01 | SBA Form 413 | always | as-of date within 90 days; signed and dated; totals foot |
| GUA-02 | Personal federal tax returns, last three years | always | period coverage by year; page completeness |
| GUA-03 | Resume or management profile | always | presence |
| GUA-04 | Government photo ID | always | not expired |
| GUA-05 | Citizenship evidence | every direct and indirect owner and guarantor | presence; `manual_confirmation` "rule reported under legal challenge; confirm handling with lender" |
| GUA-06 | Credit authorization | always | signed |
| GUA-07 | Equity injection source statements | guarantor contributes cash | two most recent monthly statements per source account; account holder matches party |
| GUA-08 | Gift letter, donor statements, transfer evidence | gift funds | signed; amount extracted; no-repayment statement present |
| GUA-09 | Affiliate package: three years of returns, interim financials, debt schedule | guarantor owns 20 percent or more of another business | period coverage; interim within 120 days |

**Target business**

| ID | Item | Applies when | Checks |
| --- | --- | --- | --- |
| TGT-01 | Business federal tax returns, last three years | always | period coverage; entity name and EIN consistent |
| TGT-02 | Year-end income statement and balance sheet, last three fiscal years | always | period coverage |
| TGT-03 | Interim income statement and balance sheet | always | period end within 120 days of the as-of date |
| TGT-04 | Receivables and payables agings | always | same as-of date as TGT-03 |
| TGT-05 | Business debt schedule | always | dated; total extracted |
| TGT-06 | IRS Form 4506-C signed by the seller for the target | always | signature date within 120 days |
| TGT-07 | Lease, with assignment, landlord consent or new lease terms | leased premises | expiry and options extracted |
| TGT-08 | Equipment list and inventory summary | always | presence |
| TGT-09 | Licenses and permits needed to operate | always | presence; `manual_confirmation` "does the business operate on the seller's personal license?" |
| TGT-10 | Franchise agreement and disclosure document | franchise | presence; `manual_confirmation` "brand checked against the current SBA Franchise Directory" |
| TGT-11 | Add-back schedule with support | overlay | presence |
| TGT-12 | Key contracts; employee roster; seller good standing | overlay | presence |

**Real estate, when included:** purchase contract (presence); appraisal and environmental review (tracking, lender-ordered).

**Lender-ordered tracking items, always listed and never requested from the parties:** credit reports, IRS transcripts, valuation, quality of earnings, appraisal, environmental review, lien searches, insurance.

## Seed consistency rules

| ID | Check | Severity |
| --- | --- | --- |
| CON-01 | Seller legal name and EIN agree across tax returns, purchase agreement and 4506-C | blocker |
| CON-02 | Owner names and percents agree across Form 1919, operating agreement, ownership chart and declared profile; percents sum to 100 | blocker |
| CON-03 | Purchase price agrees across LOI, purchase agreement, sources and uses and declared profile | blocker |
| CON-04 | Sources total equals uses total | blocker |
| CON-05 | Seller note amount and terms agree across LOI, purchase agreement, note and sources and uses | major |
| CON-06 | Seller note counted toward equity injection while its standby wording is not "full standby for the life of the loan": for lender review | major |
| CON-07 | Limited-source share (seller standby note, other standby debt, minority investor equity) exceeds half of 10 percent of total project cost: for lender review; show the arithmetic | major |
| CON-08 | Cash injection claimed from an account exceeds that account's latest ending balance | major |
| CON-09 | Form 413 cash differs from bank statement balances dated within 45 days by more than the tolerance | minor |
| CON-10 | Tax return gross receipts differ from year-end income statement revenue for the same year by more than 1 percent | major |
| CON-11 | Declared structure differs from the purchase agreement's structure | blocker |
| CON-12 | Business address differs across lease, tax return and purchase agreement | minor |
| CON-13 | Lease expiry plus stated options ends before the as-of date plus ten years: for lender review | minor |
| CON-14 | Seller consulting term exceeds the pack limit (12 months under 8; 24 under 8.1): for lender review | major |
| CON-15 | LOI expired, or purchase agreement outside date before the target submission date | major |
| CON-16 | A document's party matches no deal party | needs_review |

Every finding shows each side's value, source file, page and quote, side by side.

# 14. FINDINGS, REQUESTS, SNAPSHOTS

**Findings.** `open → requested → received → resolved`, or `dismissed` with a reason, or `waived` with a note such as "lender waived". Dismissals and waivers are audit events and appear in the change log.

**Requests.** Group open findings by responsible party. Draft one message per party. The operator edits and copies it, then clicks "Mark as sent", which moves those findings to `requested` and starts aging. A deterministic template always works without a model. The model-drafted version is optional and uses this system prompt verbatim:

```text
You are AcqFile Request Drafter. You turn a list of open findings into one
short, polite email to one recipient.

Rules:
1. Use only the findings supplied. Do not add requests.
2. One numbered item per finding: what is needed, for whom, for which period,
   and in one clause why (for example, "the copy we have is unsigned").
3. For a conflict, state both values and where each came from, and ask which
   is correct. Do not say which is right.
4. No advice or opinion about loan approval, eligibility, deal structure, tax
   or law. No promises about timing or outcome.
5. Plain language. No mention of AI or software.
6. End with {{upload_instructions}} and a requested date {{due_date}}.
7. Return JSON: subject, body, finding_ids_used.
```

Validate in code that every supplied finding id was used, none was invented, and no banned term appears.

**Snapshots.** A snapshot freezes the evaluation, the index and the file manifest with hashes. Snapshots are immutable and numbered per deal. The diff against the previous snapshot lists: items newly satisfied, new findings, resolved findings, documents added or superseded, reviewer corrections.

# 15. DELIVERABLES

`{deal_code}_package_v{n}.zip`:

```text
00_INDEX.pdf
00_INDEX.xlsx
01_Missing_Items.pdf
02_Conflicts.pdf
03_Source_Record.xlsx
04_Change_Log.pdf
05_Status_Summary.pdf
A_Transaction/
B_Buyer_Entity/
C_Guarantor_<Name>/
D_Target_Business/
E_Lender_Ordered_Tracking/
Z_Unfiled_or_Not_Required/
```

- Files are copies renamed by the overlay's template, default `{item_id}_{doc_label}_{party}_{period}.pdf`. Originals are never altered. The original filename and SHA-256 appear in the index.
- **Index:** item id, item, applies to (party, period), status, package path, document date, open findings, rule verified or not.
- **Missing items:** grouped by responsible party; exactly what is needed and why.
- **Conflicts:** each side's value, file, page and quote; status; reviewer note.
- **Source record:** fact id, subject, attribute, value, period, original filename, package path, page, quote or region, method, confidence, review status, reviewer, reviewed at, file hash.
- **Status summary:** required items satisfied or waived out of applicable required items, shown as counts; blockers; outstanding requests with age; next actions. Never show a lone percentage.
- The footer from Section 3 on everything.

Also: `pnpm rules:export-review` writes `docs/RULEPACK_REVIEW.xlsx` and `.pdf`. One row per rule: a plain-English description, parameters, source reference, verified flag, and an empty "SME correction" column.

# 16. UI

An operational tool: light neutral surfaces, dense tables, restrained badges, obvious status, legible evidence panels. No gradients, no AI imagery, no placeholder charts.

1. **Deals:** status, readiness counts, blockers, oldest outstanding request, last activity.
2. **Deal overview:** profile, parties and ownership, rule pack and overlay in force, readiness, blockers, timeline, pilot metrics (Section 19).
3. **Intake:** drag a folder or ZIP; per file show hash, duplicate or version result, and proposed segments.
4. **Documents:** an inbox of unfiled and needs-review items, then filed documents by folder; manual file and manual fact entry.
5. **Checklist:** matrix of items by party and period with status chips; click through to the satisfying document and its checks.
6. **Findings:** filter by type, severity, responsible party and status; side-by-side sources; confirm, dismiss or waive with a reason.
7. **Review queue:** as in Section 12.
8. **Requests:** drafts per party, copy, mark as sent, aging.
9. **Package:** generate a snapshot, download the ZIP, view the diff.
10. **Rule packs:** read-only viewer of the resolved pack with unverified markers and source references.
11. **Runs, Evaluations, QA report:** carried over and adapted.

# 17. SYNTHETIC FIXTURES

A deterministic generator with a fixed seed. Identical hashes on regeneration. Every page watermarked `SYNTHETIC`. Fictional names only.

For Forms 1919 and 413, try the official blank PDFs from sba.gov (U.S. government works), cached under `fixtures/forms/` and filled through AcroForm. Timebox this to two hours. If filling is unreliable, generate look-alike forms with your own AcroForm fields and record the decision. Tax returns are simplified facsimiles that carry the form number, year, names, identifiers and the key lines only.

**Deal A, "Harborview HVAC".** The flagship mess. About 40 files. 2,400,000 asset purchase. Two buyers, 60 and 40 percent, through a new LLC. One buyer owns an affiliate. A 240,000 seller note. Leased premises. Not a franchise. Expected loan number date 2026-09-29, so pack `sop-50-10-8` plus the boundary info finding. Base overlay. At least 18 planted defects.

**Deal B, "Summit Commercial Landscaping".** About 28 files. 3,600,000 stock purchase, so the quality of earnings tracking item appears. Pack `sop-50-10-8-1`. A 15 percent minority investor plus a seller note, so the limited-source arithmetic flag appears. A fictional lender overlay "Northfield Bank": interim financials within 60 days, two added items, a different folder scheme and filename template. Mostly clean: 3 planted defects.

**Deal C, "Maple Street Fitness".** About 22 files. 850,000. Franchise. Gift funds. One buyer. Mostly scans and bundles. Pack `sop-50-10-8-1`. 8 planted defects.

**Planted defects.** Use all of these across the three deals and annotate each in truth.

1. a guarantor's tax return missing for one year;
2. Form 413 dated 140 days before the as-of date;
3. unsigned and undated Form 1919;
4. the same tax year supplied twice, one with a filename claiming another year;
5. one-digit EIN mismatch between the 4506-C and the returns;
6. purchase price differs between LOI, purchase agreement and sources and uses;
7. sources and uses out of balance by 25,000;
8. seller note counted toward injection with a 24-month standby;
9. ownership 60/40 on Form 1919 against 55/45 in the operating agreement;
10. exact duplicate under a different filename;
11. corrected Form 413 superseding an earlier one;
12. signed Form 413 as an image-only PDF;
13. ID, resume and credit authorization bundled in one PDF;
14. `scan0007.pdf` that is really the lease;
15. an irrelevant brochure;
16. a password-protected PDF;
17. income statement revenue 6 percent off the tax return;
18. interim financials 150 days old;
19. income statement as a multi-sheet XLSX;
20. lease expiring in three years with no options;
21. missing citizenship evidence for an indirect owner;
22. bank balance below the claimed cash injection;
23. expired LOI;
24. a document naming a party that is not in the deal.

**False-positive traps that must not raise a finding.** "Harborview HVAC, LLC" against "Harbor View HVAC L.L.C."; totals that differ only by rounding within tolerance; a superseded document that would have been stale.

**Truth per deal** under `fixtures/truth/<deal>/`: `deal.json`, `documents.json` (segments, types, parties, periods, rule-feeding facts with locators), `expected_checklist.json`, `expected_findings.json` (defect number to rule id and severity), `expected_review.json`.

# 18. EVALUATION AND GATES

`pnpm eval` runs the mock provider and gates CI. `pnpm eval:live` runs a real provider under the cost cap and is reported separately. Never present mock scores as evidence of model quality.

| Metric | Gate (mock baseline) |
| --- | --- |
| Segment type accuracy | at least 95% |
| Segment boundary accuracy on bundles | at least 90% |
| Party and period assignment accuracy | at least 90% |
| Rule-feeding fact accuracy, acroform and text | at least 95% |
| Rule-feeding fact accuracy, vision, before review | report only |
| Provenance validity, text layer | at least 98% |
| Checklist status accuracy | at least 95% |
| Planted defect recall: missing, stale, incomplete | at least 95% |
| Planted defect recall: conflicts | at least 90% |
| Finding precision | at least 80% |
| False-positive traps raised | 0 |
| **False-satisfied on planted blockers** | **0, hard gate** |
| Review routing recall on planted uncertain items | at least 90% |
| Deal evaluation determinism (result hash equal on rerun) | pass |
| Overlay changes the checklist with no code change | pass |
| Duplicate, superseded version, resume after injected failure | pass |

Regression rules against the stored baseline: any drop of more than 2 points in status accuracy or defect recall fails; any false-satisfied fails; any trap raised fails. Only a passing run can become a baseline.

On the live run, false-satisfied must be 0. If it is not, list it as a release blocker in the final report. Report cost and wall-clock time per deal.

The HTML QA report carries: run identity, quality summary, corpus, processing reliability, classification, extraction, provenance, review, checklist and findings accuracy, defect-by-defect results, regression comparison, cost, latency, errors, per-deal results, reproducibility.

# 19. RELIABILITY, OBSERVABILITY, PILOT METRICS

Carry over the durable steps, the retry schedule, dead letters with an admin retry, idempotency keys that include pipeline version and model configuration hash, the failure injection variable, step-level latency and token tracking, and central price configuration where an unknown model price fails loudly.

Pilot metrics per deal, on the overview and in the QA report: files received, segments auto-filed against manually filed, review items and median seconds per item (from event timestamps), findings by type, request rounds, days outstanding per finding, days from first upload to the first snapshot with zero blockers.

# 20. SECURITY

Server-only secrets. Workspace membership and role enforced in every server action. Private storage and signed URLs. File type, size and page limits. Sanitized filenames and generated storage paths. Escaped source content in every HTML and PDF export. Restrictive content policy on served reports. Rate-limited mutations. Validated model output. `pnpm deal:purge <deal-code>` removes files, facts and model payloads and records the deletion. Do not claim any security certification anywhere.

# 21. TESTS AND COMMANDS

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm rules:check
pnpm eval
pnpm build
```

Also: `pnpm rules:export-review`, `pnpm fixtures:generate`, `pnpm seed:demo`, `pnpm deal:evaluate <code>`, `pnpm deal:export <code>`, `pnpm deal:purge <code>`, `pnpm eval:live`.

**Unit:** pack and overlay validation and merge; every check type; condition evaluation; pack selection by date and the boundary finding; normalizers; entity resolution; finding key stability and the resolve and reopen lifecycle; confidence by method with exact numbers at the thresholds; snapshot diff; filename templating; request validation; banned-term lint; ZIP safety; SSN and EIN handling (HMAC equality, never clear text).

**Integration:** ZIP through to segments, facts, evaluation and findings; duplicates and superseded versions; a fact in review blocks satisfaction; a review action re-evaluates; an overlay swap re-evaluates; export contents and manifest hashes; purge; failure, retry and resume; role denial.

**End to end, four flows:** upload Deal A and see the planted missing and stale items; correct a vision-read Form 413 value and watch a finding change; confirm a proposed bundle split; snapshot v1, upload three fixes, snapshot v2, check the diff and the ZIP.

# 22. DEMO SEED AND WALKTHROUGH

The seed loads all three deals. Deal A is mid-flight: open review items, one reviewer correction, one dismissed conflict with a reason, one request marked sent, snapshot v1 exported, three fixes uploaded, snapshot v2 exported. There is one retried run and a passing evaluation with its QA report. Public visitors browse read-only and cannot upload or trigger model calls.

Write `docs/WALKTHROUGH.md`, a seven-minute script:

1. the raw folder listing for Deal A;
2. intake and auto-filing, including the bundle split and `scan0007.pdf` becoming the lease;
3. the review screen on the scanned Form 413;
4. the checklist matrix;
5. the purchase price conflict with its three sources side by side;
6. the request draft to the seller's CPA;
7. snapshot v2 and its change log;
8. Deal B, to show a second lender as an overlay file and the 8.1 pack;
9. the rule-pack review sheet, with the ask: "tell us what is wrong in this list".

# 23. PHASES AND CUT ORDER

| Phase | Build | Proof |
| --- | --- | --- |
| 0 | Read the base repo and this document. Write `docs/PLAN.md` and `docs/DECISIONS.md`. Verify dependencies and model identifiers. Remove RAG. | Clean build and tests green after removal |
| 1 | Schema. Rule pack loader, validator, overlay merge, viewer. Rule engine tested against hand-written facts. | `pnpm rules:check`; engine reproduces the expected findings from a JSON fact fixture |
| 2 | Fixture generators and truth for three deals | Identical hashes on regeneration |
| 3 | Intake, parsing (text, AcroForm, DOCX, XLSX, image-only), signature library, classifier, segments, party and period assignment, manual filing | Deal A segment accuracy at or above gate on mock; bundle split proposed |
| 4 | Extraction, verification, method-aware confidence, grouped review, entity resolution, fact store | Planted uncertain values reach review; a correction creates a version and triggers re-evaluation |
| 5 | Deal evaluation, checklist, findings lifecycle, requests, snapshots, exports, review sheet | Deal A ZIP with all seven artifacts; v1 to v2 diff correct |
| 6 | Evaluation harness, gates, QA report, live run under the cap | `pnpm eval` passes; live results recorded |
| 7 | Demo seed, read-only mode, README, walkthrough, `docs/PILOT_RUNBOOK.md` (how to run a paid test on a client's past files: consent, `REAL_DATA_MODE`, access, metrics to capture, purge), security pass | Every command in Section 21 passes |

**If time runs short, cut in this order:** work log; binder PDF; model-drafted requests (keep the template); official-form AcroForm filling (use look-alikes); XLSX parsing (route to manual filing); Deal C; vision extraction of values (keep vision classification and signature detection, enter values by hand).

**Never cut:** provenance; the review queue; deterministic rules; packs and overlays; the false-satisfied gate; the four deliverables; snapshot diff; manual filing; the synthetic-only and no-decision guardrails; the evaluation and QA report; tests.

# 24. FINAL REPORT REQUIRED FROM YOU

1. What was built, in one page.
2. Decisions taken (link `docs/DECISIONS.md`) and anything substituted.
3. What was reused from, adapted from and removed from the base repo.
4. The data model as implemented.
5. Fixtures: files per deal; planted defects and where each lives.
6. Evaluation results, mock and live kept separate, every metric in Section 18, measured only.
7. Defect-by-defect table: caught, missed or wrongly raised.
8. Reliability checks: duplicates, versions, determinism, failure and resume, purge.
9. Exact results for every command in Section 21.
10. Observed cost and time per deal on the live run.
11. Required production environment variables and deploy readiness.
12. Known limitations that are real. Rule candidates you could not source.

# 25. PRODUCT STANDARD

The finished application must make this statement visibly true:

**AcqFile does not judge a loan. It shows what is in the file, what is missing, what disagrees, where every value came from, what a human changed, and what is still unknown, and it never calls a file complete when it is not.**

Build it accordingly.

---

# APPENDIX: SOURCES FOR THE RULE SEEDS

Secondary sources, read 19 September 2026. Treat as unverified until a lender confirms.

- SOP 50 10 8.1 issuance, effective date, loan-number trigger: https://www.naggl.org/two-major-sba-announcements-issuance-of-sop-50-10-8-1-and-a-new-expansion-of-the-itl-program/ and https://colemanreport.com/this-just-in-sba-releases-sop-50-10-8-1-effective-october-1-2026/
- Appendix 15 categories, universal valuation, quality of earnings threshold, equity limits, citizenship: https://www.pbmares.com/new-sba-business-acquisition-rules-take-effect-october-1/
- Broker-facing 8.1 summary: https://www.funderintel.com/post/sba-sop-50-10-8-1-7-things-brokers-need-to-know-before-october-1
- Limited equity sources under 8.1: https://www.pioneercapitaladvisory.com/post/investor-equity-sba-7a-sop-50-10-8-1-new-rules-vs-old-rules
- Acquisition documentation checklist under SOP 50 10 8: https://www.pioneercapitaladvisory.com/post/the-complete-sba-documentation-checklist-for-business-buyers
- Equity injection and seller standby under SOP 50 10 8: https://starfieldsmith.com/2025/05/best-practices-a-review-of-equity-injection-requirements-under-sop-50-10-8/ and https://www.whitefordlaw.com/news-events/client-alert-sba-issues-sop-50-10-8-key-changes-impacting-sba-7a-lending
- Form 1919 revision, Form 912 status, March 2026 citizenship notice: https://statementsready.com/blog/how-to-fill-out-sba-form-1919
- Agents, Form 159, 13 CFR Part 103: https://www.sba.gov/sites/default/files/2022-02/SBA%20Form%20159_2.10.22-508_0.pdf and https://starfieldsmith.com/2026/07/best-practices-working-with-referral-agents/amp/
- Broker-side products to know about (context only; do not copy): https://loanbud.com/loanbud-launches-ai-powered-platform-to-verify-sba-financeability-before-businesses-go-to-market/ , https://www.crediflow.ai/blog/ai-for-commercial-loan-brokers , https://aloan.ai/guides/best-sba-lending-software