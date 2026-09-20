Yes. **The Adviser view should be the quality benchmark, not the workflow template.** Admin, Operator, and Reviewer should feel like parts of the same finished product, but each should prioritize different work.

The key change is to require the agent to inspect and redesign **every role’s complete experience**, rather than improve one shared dashboard and assume the others are covered.

Use this as the replacement prompt:

---

# AcqFile: Complete Role-Aware Redesign for Admin, Operator, and Reviewer

Act as a senior product manager, product designer, and frontend engineer.

Redesign and implement the **Admin, Operator, and Reviewer experiences** in AcqFile.

The Adviser experience is now looking good. These other roles still do not meet the same standard of visual quality, usability, and product thinking.

**Use the Adviser experience as the quality benchmark and shared brand reference, not as a layout to copy.**

These roles perform different work. They need different priorities, information density, and controls. However, they should all feel like they belong to the same thoughtfully designed product.

This is a complete staff-experience redesign, not a cosmetic update, one-page improvement, or exercise in hiding buttons based on permissions.

## 1. Establish the actual responsibilities of each role

Before designing, inspect the existing application, role definitions, permissions, routes, and supported actions.

Do not assume what a role can do from its name.

Use the following as initial product hypotheses, then verify them against the implementation:

| Role         | Likely product emphasis                                                                                     | Important distinction                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Admin**    | Operational oversight, deal access, configuration, and administrative interventions where supported         | Admin should not land on a wall of every available control simply because it has broad access            |
| **Operator** | Moving work forward through document intake, filing, requirements, issue resolution, and follow-ups         | The experience should support efficient execution without exposing processing logs as the main interface |
| **Reviewer** | Understanding completeness, inspecting evidence, evaluating unresolved issues, and examining review history | Reviewer must have a useful evidence-review experience, even where permissions are read-only             |

These are not instructions to create new permissions or workflows.

In particular, do not assume that Reviewer can approve a loan, waive a requirement, edit facts, or generate a lender file. Do not assume Admin automatically has every capability. Verify what actually exists.

Create a concise **role × capability matrix** before implementation. Distinguish viewing, editing, confirming, waiving, dismissing, recording follow-ups, configuring rules, and generating or downloading file versions.

**Design each role around its actual responsibilities, not merely around which buttons it is allowed to see.**

## 2. Inspect Adviser and identify why it works

Open the current Adviser experience in the browser and inspect its implementation.

Identify the successful design decisions: page hierarchy, navigation, typography, spacing, component styling, terminology, action placement, and use of detail views.

Use those decisions to establish the shared visual language for the staff experiences.

Do not revert Adviser to the older design system. Do not change Adviser unnecessarily to accommodate the staff redesign.

The relationship should be:

> Same product identity and finishing quality. Different workflows and appropriate information density.

A reviewer may need a document and evidence comparison side by side. An operator may need a compact work queue. An administrator may need configuration controls. Those differences should feel intentional, not like different generations of the application.

Preserve Adviser with before-and-after screenshots and regression checks wherever shared components change.

## 3. Audit the complete experience for every target role

Inspect every route and meaningful interaction available to Admin, Operator, and Reviewer.

The supplied screenshots and pasted content describe existing functionality. They are **not a layout specification**, and they do not replace inspecting the actual role-specific application.

Build a coverage map that includes:

| Surface                       | What to inspect                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace and deal navigation | Landing page, deal list, workspace context, selected deal, account utilities                        |
| Deal overview                 | Current status, outstanding work, readiness, evaluation recency                                     |
| Documents                     | Upload, processing, classification, filing, previews, duplicates, versions, retry and review states |
| Requirements                  | Applicability, completion, checks, linked evidence, confirmations, waivers, tracking                |
| Review and findings           | Current issues, evidence comparisons, decisions, resolved history                                   |
| Follow-ups                    | Recipient groups, draft content, copy actions, recording requests as sent, history                  |
| Lender file                   | Preparation, generation, versions, contents, downloads, blocked and empty states                    |
| Profile and configuration     | Parties, ownership, transaction details, rule packs, and existing administrative functions          |

Map each surface to the roles that actually have access.

Also include drawers, dialogs, forms, detail pages, loading states, and error states. A redesigned landing page with old detail screens underneath is not a completed role experience.

**The unit of completion is role × screen × key state, not “dashboard redesigned.”**

Do not invent billing, user management, analytics, approvals, or other features to make a role look more substantial.

## 4. Use research appropriate to professional workflows

You already have the competitor research handover and visual reference gallery. Reuse them.

However, distinguish borrower-facing references from operator-facing and reviewer-facing references.

For gaps in the staff experience, inspect publicly available product screens, help-centre images, and walkthroughs covering:

- Operational work queues and document collection.
- Document validation and evidence review.
- Requirements, exceptions, and decision history.
- Versioned output preparation and administrative configuration.

FileInvite, Content Snare, Floify, Rossum, and the other products in the handover are research candidates. Use additional products where they answer a specific design question.

Borrow workflow patterns, not entire screens.

For each significant reference, identify what it shows, which role it serves, what we should borrow, and what we should avoid. Distinguish actual product screenshots from marketing compositions.

Do not claim access to authenticated screens you could not inspect. Do not upload AcqFile documents into competitor products.

Keep the research focused. It should support implementation, not become an open-ended browsing exercise.

## 5. Create a coherent shared structure with role-specific priorities

Do not build three unrelated interfaces. Do not build one generic dashboard and merely remove unauthorized controls.

Use a shared product structure where the underlying work is shared, with role-specific entry points, default views, and actions.

Separate workspace navigation from work inside a deal. Keep the selected deal and business name clear throughout the experience.

Avoid stacked horizontal navigation bars, tabs within tabs, and pages that require users to understand the backend structure before finding their work.

Choose navigation based on the actual tasks. Existing labels such as Overview, Documents, Requirements, Review, Follow-ups, and Lender file may be useful, but the current navigation is not a constraint.

Within that structure:

**Admin** should see the operational or administrative context relevant to its verified responsibilities.

**Operator** should reach actionable work quickly and retain context while moving between a task, its document, and its resolution.

**Reviewer** should be able to understand the state of the file, inspect evidence, and distinguish outstanding issues from completed review without searching through operational noise.

A read-only role still needs an excellent product experience. Do not leave it with a sparse page because editing controls are absent.

Use the same terminology for the same underlying object across roles. Change emphasis and explanatory detail, not the meaning of the data.

## 6. Organize the experience around work, not database entities

Every major screen should make clear:

> What am I looking at? What matters here? What can I do? What evidence or detail is available?

Do not lead with raw rule codes, source paths, processing enums, generic item counts, or large grids of summary cards.

At the same time, do not oversimplify professional workflows into a borrower-style wizard.

Use compact tables when comparison and scanning matter. Use a focused detail panel when an operator or reviewer needs depth. Use cards where they genuinely improve comprehension.

Keep technical details available to authorized users through progressive disclosure. An administrator may legitimately need an original path, hash, processing result, or rule identifier. Those details should not dominate the default view.

Do not require several layers of drawers and accordions to reach routine evidence. Preserve list position, filters, selection, and deal context when users inspect details and return.

## 7. Keep the data model understandable and truthful

The existing content mixes requirements, findings, uploaded files, filed document segments, pending values, and historical events.

These are different units. Do not call all of them “items” or combine them into a generic completion percentage.

Verify all counts and statuses against authoritative application state.

Preserve these distinctions:

| Distinction                             | Design requirement                                                |
| --------------------------------------- | ----------------------------------------------------------------- |
| Applicable vs not applicable            | Excluded requirements must not appear as unfinished work          |
| Satisfied vs waived                     | Both may affect readiness, but they are not the same outcome      |
| Current vs resolved findings            | Historical blockers must not look like current blockers           |
| Informational vs actionable             | An informational note does not automatically require a correction |
| Uploaded vs processed vs reviewed       | Upload success does not mean the document passed review           |
| Source files vs filed documents         | A single uploaded packet may produce several document records     |
| Missing evidence vs processing failure  | A document can exist but remain unusable or unclassified          |
| No sent requests vs no outstanding work | Nothing recorded as sent does not mean no follow-up is needed     |

For example, a view containing four open findings and 56 total findings should not default to a wall of 56 equally prominent alerts.

Likewise, “3 of 5 done” is misleading where the other two requirements are not applicable.

Investigate contradictory displays. The supplied lender-ordered rows show “Satisfied” while some tracking controls display `not_started`. Determine whether this is a binding problem, stale state, or a genuine data inconsistency. Do not overwrite persisted values merely to make the screen look consistent.

Use the supplied deal as a regression fixture, not as hardcoded production content.

## 8. Apply role-aware product thinking to each workflow

### Overview and work queues

Make current priorities understandable within the first screen.

Show what prevents progress, what the current user can act on, and what depends on someone else. Derive those distinctions from supported data and permissions.

Completion counts may be useful for staff, but should support the explanation rather than replace it.

Do not present the same underlying problem as several unrelated tasks when the records are demonstrably connected. Equally, do not combine issues merely because their filenames look similar.

Do not invent owners, deadlines, stages, activity events, risk scores, or approval status.

### Documents and intake

Create a clear distinction between documents needing attention, the current document library, and upload/processing history.

Use readable document names, party information, and relevant periods. Keep original filenames, paths, hashes, page mappings, and version history accessible where permitted.

Opening a document should support the work of the current role: filing and correction for an authorized operator, evidence inspection for a reviewer, or additional diagnostics for an authorized administrator.

Retain supported file, folder, and ZIP upload capabilities and existing limits. Show selection, validation, progress, partial failures, and processing results clearly.

Preserve safe handling of unreadable or unsafe files. Do not bypass checks to make preview or manual filing appear to work.

Distinguish current, superseded, and duplicate records without displaying the entire processing history in every row.

### Requirements

Make the default view easy to scan by requirement, party, period, status, and evidence.

Show detailed checks and decision controls in context rather than displaying every passing check and waiver form at once.

Keep non-applicable requirements accessible without making them look incomplete.

Preserve distinct actions for waiving a requirement, dismissing a finding, confirming a fact, and updating lender-ordered tracking. Show only the actions authorized for that role.

Use the correct record identity. Repeated rule codes across different people or years must not cause an action to affect the wrong requirement.

### Findings and evidence review

Default to current work, with clear access to resolved and other historical records.

Keep finding type, severity, and resolution state distinct.

A useful detail view should explain the concern, affected party or requirement, source evidence, and permitted next action.

Replace unlabeled values and raw diagnostic statements with named fields and readable explanations. Format amounts, dates, and percentages according to known field types.

Do not turn uncertain extraction into an absolute assertion. “Signature could not be confirmed” and “Signature is absent” are different claims.

Preserve the distinction between extracted, declared, and operator-confirmed values where supported.

Use valid source references. Replace `page null` with an appropriate label such as “Deal profile.” Collapse repetitive citations without discarding distinct evidence.

Do not claim that all referenced documents caused a resolution unless the system actually establishes that relationship.

For read-only reviewers, prioritize evidence access, comparison, coverage, and decision history. Do not simulate decision authority.

### Follow-ups

Separate internal review detail from recipient-facing messages.

Remove raw rule JSON, diagnostic enums, internal paths, and null page references from actual outgoing drafts and copied content, not just the visible preview.

Make each requested action understandable: which document or correction, for which person or entity, and for which period.

Do not automatically turn informational findings into demands for additional documents.

Keep recipient identity and responsibility clear. Do not invent contact information.

“Copy draft” must not imply sending. “Record as sent” must not imply AcqFile delivered the message. Preserve the actual communication capabilities and permissions.

### Lender file and version history

Treat this as a meaningful output workflow, not an empty page with a technical button.

Show preparation status, relevant unresolved work, supported contents information, generation state, and existing versions.

Use readable language to explain that each version preserves the documents and review results from its creation time.

Inspect existing generation rules before enabling or disabling actions. Do not invent new blocking rules or bypass existing ones.

Distinguish incomplete versions from versions meeting configured preparation checks where that distinction is supported.

A generated file is not lender approval. A download is not a submission. Older versions must remain immutable.

Adapt available generation and download actions to each role without changing the meaning of the underlying version.

### Profile and configuration

Present existing parties, roles, ownership, transaction terms, and rule configuration clearly to authorized users.

Keep configuration separate from routine review work.

Preserve rule verification status, effective/as-of context, overlays, and manual-confirmation requirements. Reduce repetitive notices without hiding important limitations.

Do not change lending, legal, tax, eligibility, or evaluation policy as part of this redesign.

## 9. Match Adviser’s quality without sacrificing professional efficiency

The staff screens should look as deliberately designed as Adviser.

Use coherent typography, spacing, component styling, table treatment, status presentation, and action hierarchy.

Avoid giant headings that consume working space, excessive rounded cards, decorative charts, tiny text used to force density, and empty areas that push useful content below the fold.

Use restrained status colors. Historical resolved issues should not visually compete with urgent current work.

Make the primary action obvious for the current task and role. Keep secondary actions available without giving every control equal prominence.

Integrate workspace, role, and synthetic-data context compactly. Preserve the restriction that real-data processing is disabled.

Evaluate the experience at ordinary laptop sizes, including 1366 × 768 and 1440 × 900. A screen that only looks good on an unusually wide monitor is not finished.

Support keyboard navigation, visible focus, readable contrast, meaningful labels, and accessible detail interactions.

**Before propagating the redesign everywhere, render a representative work-list screen and an evidence-detail screen. Compare their hierarchy, density, and finishing quality against Adviser. Correct the direction, then apply it consistently across all target roles.**

Do not stop at those representative screens.

## 10. Implement without weakening the product

Reuse successful shared primitives where appropriate. Refactor inherited staff layouts where needed.

Do not create three duplicated applications, but do not force different workflows into an unsuitable universal component.

Preserve backend contracts, tenant boundaries, role permissions, masking, provenance, audit behavior, document relationships, and immutable output versions.

Hiding a button is not authorization. Existing server-side permission checks must remain effective.

Do not introduce new frameworks or major backend systems solely for this redesign.

Presentation-layer and data-binding corrections are in scope. Separate genuine domain-policy changes and unsupported feature requests from the work.

Use synthetic fixtures for testing. Do not send messages, alter real customer records, or enable real-data processing to demonstrate the new interface.

## 11. Validate every role, not just shared components

Use the role-appropriate test accounts or existing test fixtures.

For each role, verify navigation, default priorities, permitted actions, restricted actions, evidence access, and state persistence after reload.

Where supported, test these journeys:

| Journey                            | Required outcome                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Find and open a deal               | The user immediately understands the deal context and relevant next work                |
| Inspect a current issue            | Requirement, finding, party, and source evidence stay connected                         |
| Investigate a failed document      | Safe, supported next steps are clear                                                    |
| Review requirements and history    | Non-applicable and resolved records do not appear as unfinished current work            |
| Perform an authorized decision     | The correct record changes, reasons are retained, and dependent views refresh correctly |
| Prepare or inspect a follow-up     | Recipient-facing content is readable and free of internal implementation details        |
| Generate or inspect a file version | Permissions, generation rules, downloads, and immutability remain correct               |
| Return to Adviser                  | Its existing design and workflows remain intact                                         |

Also test empty, loading, error, partial-upload, no-results, long-name, duplicate-document, and populated-history states.

Run existing tests and add regression coverage where behavior changes. Do not remove or weaken tests to make the redesign pass.

Capture and inspect screenshots for every target role’s important screens and detail states. A successful build is not sufficient evidence of a successful redesign.

## 12. Completion requirements

Begin with a short design direction, the verified role-capability matrix, and the screen coverage map. Then implement, render, inspect, and correct the complete experience.

At completion, provide the role-by-role screen map, representative screenshots, tested workflows, regression results, and any genuine limitations.

Do not mark a role complete because it inherits the new header, uses the updated colors, or shares a redesigned Overview.

**Admin, Operator, and Reviewer must each have a coherent end-to-end experience appropriate to their responsibilities.**

The acceptance standard is:

> Adviser and the staff experiences feel like the same finished product. Each role can understand the work, reach the relevant evidence, and perform its permitted tasks without navigating AcqFile’s internal data model.

Make reasonable product decisions and proceed. Ask only when an unresolved permission, business rule, or product decision would materially change the implementation.
