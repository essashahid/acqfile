# Staff experience: direction and coverage

21 September 2026. Authority: [owner request](../STAFF_REDESIGN.md), which replaces the earlier light-restyle limit. Keep the engine, pipeline, gates, permissions and Adviser intact.

One compact workspace bar, one persistent deal rail, readable work lists and evidence beside the selected record. Reuse Adviser's warm surfaces, navy accent and serif headings; use smaller headings and tables for professional comparison. Admin leads with oversight/configuration, Operator with execution, Reviewer with coverage/history. Counts retain their units. URL filters retain context.

## Verified capability matrix

| Capability                                                           | Admin (`admin`)  | Operator (`reviewer`) | Reviewer (`viewer`) |
| -------------------------------------------------------------------- | ---------------- | --------------------- | ------------------- |
| View deals, masked evidence, decisions, rules and version contents   | Yes              | Yes                   | Yes                 |
| Create/edit deals, upload/retry, file/reclassify, confirm/edit facts | Yes              | Yes                   | No                  |
| Confirm rule checks, update lender tracking, waive requirements      | Yes, audited     | Yes, audited          | No                  |
| Dismiss findings                                                     | Yes, with reason | Yes, with reason      | No                  |
| Copy drafts / record as sent                                         | Both             | Both                  | Copy only           |
| Generate versions / open originals / download ZIP                    | Yes              | Yes                   | No                  |
| Choose existing overlay through profile                              | Yes              | Yes                   | No                  |
| Edit rule definitions in UI / approve lending                        | No               | No                    | No                  |

Sources: workspace.ts, access.ts, staff actions, service.ts, review.ts, attestations.ts, findings.ts, requests.ts, snapshot.ts and signed original/download handlers. Public demo can further restrict mutations. Admin has a demo-mode override, not new workflows.

## Role × surface × state coverage

All three roles: workspace/deal list (populated, empty, filtered); overview (outstanding/ready); documents (attention, library, duplicate/superseded history, no results); filing detail (readable/unreadable/bundle); values (pending/decided/source); requirements (needs work/all/not applicable, tracking and decision history); review (current/info/history, filtered, selected evidence); follow-ups (draft/recorded/empty); lender file (empty/current/older versions); profile/ownership/rule comparison; help; loading and recoverable error. Admin and Operator additionally: create/edit profile, intake selection/validation/partial processing, filing and fact decisions, confirmations/waivers/dismissals, record-as-sent and generate/download. Reviewer gets readable evidence and recorded reasons, never disabled edit forms as its primary experience.

Representative work list and evidence detail are rendered and inspected before propagating the direction. Browser proof uses every role at 1366×768 and 1440×900; Adviser before/after is retained. Existing tests remain.

## Focused references

Existing RESEARCH.md, RESEARCH_BROADER.md and gallery inform brand and separation of customer tasks from staff review. Their borrower screens are not staff layouts.

- [Rossum validation screen](https://knowledge-base.rossum.ai/docs/document-validation-screen-in-rossum), official help article with product screenshots (7 March 2025): operator document/field comparison, source navigation, duplicate and diagnostic detail. Borrow adjacent evidence and values, with diagnostics secondary. Avoid automated acceptance policy or queue configuration not supported here.
- [Content Snare review](https://contentsnare.com/help/knowledge-base/approve-reject-and-comment/), official help workflow and embedded screenshots: staff can review partial arrivals in compact view. Borrow distinction between received and checked; avoid their approval vocabulary and automatic emails. Search text inspected; direct fetch rate-limited, so no authenticated or visual inspection claimed.

No competitor accounts used and no AcqFile documents uploaded.

## Route map

`D` is the selected deal. Every viewing route below was opened under Admin, Operator and Reviewer accounts. Editing controls follow the matrix above; they do not create a second application.

| Route                                                | Screen and retained context                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/staff/deals`                                       | Role landing, real counts, business search and empty results                                                  |
| `/staff/deals/new`                                   | Create profile; Admin/Operator only                                                                           |
| `/staff/deals/D`                                     | Role priorities, coverage, readiness and saved check date                                                     |
| `/staff/deals/D/documents`                           | Attention, library, intake, filters and duplicate/superseded arrival history                                  |
| `/staff/deals/D/documents/:version`                  | Filing, unreadable handling, source pages and original details                                                |
| `/staff/deals/D/documents/:version/values/:document` | Pending/decided values, quotes, source pages and immutable earlier records                                    |
| `/staff/deals/D/requirements`                        | Current work, all/excluded rows, scoped controls and retained reasons                                         |
| `/staff/deals/D/review`                              | Current, informational and historical findings; evidence; URL selection and return link                       |
| `/staff/deals/D/follow-ups`                          | Recipient drafts, copy, record-as-sent confirmation and saved message history                                 |
| `/staff/deals/D/lender-file`                         | Preparation, explicit incomplete-version confirmation, saved contents, older selection and permitted download |
| `/staff/deals/D/profile`                             | Parties, ownership, funding, rules; edit existing profile for Admin/Operator                                  |
| `/staff/rulepacks`                                   | Search, comparison, verification notices and disclosed definitions                                            |
| `/staff/how-it-works`                                | Existing workflow and provenance explanation                                                                  |
| Staff loading/error boundaries                       | Meaningful waiting state and recovery while keeping saved work                                                |

Implementation evidence: the representative list/evidence review identified the inherited `table.grid` / Tailwind collision before the shared table treatment was propagated. The final screenshot review also corrected unresolved wording on historical findings, raw evidence-link codes, and premature captures of PDF loading. Desktop labels, overflow and normal-route page errors are automated; screenshot inspection covers hierarchy and source detail. Reviewer ZIP denial is checked at the server endpoint, not inferred from missing buttons.
