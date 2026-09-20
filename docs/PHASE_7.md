# PHASE 7 (revision 3): A customer-facing portal

This replaces any earlier Phase 7 request. If amendments A54 to A66 were already recorded, the rulings below override them wherever they conflict. Do Phase 7 only, then stop and report. Save this request as `docs/PHASE_7.md`. A45 (keep it simple) still governs everything inside this scope.

## Why this phase changed

The owner reviewed the product against FileInvite, Floify and LoanBud. The finding: what we built reads like an internal operations dashboard. It exposes the system's model (requests, packages, checks, exceptions, counts, flags) to people who should never need to understand it. `docs/design/RESEARCH.md` has the review, and `docs/design/RESEARCH_BROADER.md` a second, wider one (Blend, FileInvite's 2026 portal, Content Snare, TaxDome, Maxwell and others). Read both first.

So the owner has reversed one earlier decision: **the product now has a customer-facing portal, and that portal is the face of the product.** The engine, the pipeline and every Phase 6 gate stay exactly as they are. This phase builds a new presentation layer on top of them.

A customer must be able to answer four questions in five seconds:

1. What do I need to do?
2. What have I already completed?
3. Is there anything that needs my attention?
4. What happens next?

## The designs

Eleven reference screens are in `docs/design/` as plain HTML. The person's home in its three states: `PortalHome` (things to do), `PortalWaiting` (nothing to do, we are checking), `PortalDone` (all done), plus `PortalHomePhone`. One task: `PortalUpload`, `PortalTaskFiles` (several files, one to replace), `PortalCantSend`. After an upload: `PortalChecking`, then `PortalChecked`. The adviser: `ClientOverview`, `QuestionForYou`. They specify structure, hierarchy, wording and tone. Match those. Do not copy their inline styles; build with the app's own components and Tailwind. Change the React component architecture freely where that gives the right experience. Do not keep a component because it exists.

## 0. Append these rulings to `docs/SPEC_AMENDMENTS.md`

- **A70. Three audiences, three areas.**
  - _The person sending documents_ (a buyer, the seller, an accountant): `/p/:token`. Home, one task, the result of an upload, all done. Works on a phone.
  - _The adviser who owns the deal_ (our client): `/deals` and `/deals/:d`. One page per deal with sections, never tabs: Questions for you, People, The lender file. "See every document" opens the full list as a plain page.
  - _Staff_ (us): `/staff/...` holds sorting and checking. Same function as today, restyled, never linked from a customer page.
- **A71. Access for people.** Each person in a deal gets a link with a long random token. No password in v1. A token sees only that person's own items and documents in that one deal, and nothing else: not other people's items, not the adviser's view, not staff tools. Tokens can be revoked and reissued. `REAL_DATA_MODE` stays false.
- **A72. Three states a customer sees:** **To do**, **With us for review**, **Done**. Map them from the engine: missing, needs fixing and an open question go to To do; uploaded and awaiting staff, or still processing, go to With us for review; complete and waived go to Done. Not-applicable items never appear. Lender-ordered items never appear to a person; the adviser sees one line for them.
- **A73. One to-do per document.** However many checks failed on a document, the person sees one to-do with one sentence and one action. Choose the sentence by this order: not received; wrong document or wrong year; unsigned or undated; out of date; anything else. Several system flags must never become several rows.
- **A74. A disagreement is a question, not an error.** When documents disagree, one person is asked one question (the rule's responsible party; the adviser by default), as in `QuestionForYou`: the two sources with their quoted lines, then the distinct values as choices, plus "Neither" and "I'm not sure yet". The answer is recorded with an audit event and creates a to-do for whoever must correct the other document. It never edits a fact. We never say which document is right.
- **A75. Check at the moment of upload.** For text and fillable-form uploads, run the pipeline through its deterministic checks while the person waits, up to about 20 seconds. A definite problem (wrong year, wrong person, unsigned, out of date, a duplicate, a locked file) shows `PortalChecked`: what we noticed, in one calm sentence, with two choices: upload the right one, or "This is the right document", which sends it to staff. Scans, and anything slow, go straight to With us for review. Never block the person.
- **A76. Progress is stages and a sentence.** Four named stages in the left rail, each with a short note, as in the designs. No "X of Y", no percentage, no progress bar, no counts of flags on any customer page. The headline sentence carries the number that matters: "Three things need your attention", or "You're all done for now".
- **A77. Voice.** Second person, by first name. Every ask has one sentence of why and one of what to do. Dates read "28 April". A form number appears once, in brackets, after the plain name. All customer copy comes from deterministic templates. Add a lint that fails on any of these in customer copy: error, invalid, failed, rejected, flag, exception, conflict, mismatch, stale, request, package, checklist item, finding, plus the system words from A55.
- **A78. Nothing system-oriented,** as in A55, and no file paths. The one exception: a person's own file name may be shown back to them once, right after they upload it.
- **A79. Reminders and messages** open the user's own email with the text filled in. The system still sends nothing (guardrail 5).
- **A80. The firm's name leads.** The adviser's firm name sits at the top of the rail with "Secure document portal", and the named contact at the bottom. AcqFile's name does not appear on customer pages.
- **A81. Visual system.** Source Serif 4 for headlines and Public Sans for everything else, both through `next/font`. Tokens from the reference files: ground `#F7F6F2`, surface `#FFFFFF`, rail `#F0EEE8`, line `#E4E1D8`, ink `#14202B`, body `#2C3A47`, muted `#5A6875`, accent `#12355B`, attention `#8A5A00` on `#FBF3DF`, done `#1E6B45` on `#E8F3EC`. Headline 38 to 42px, body 16 to 18px, controls at least 48px tall, radius 10 to 16. Rows separated by a line, not boxed cards. One primary button per row. No tables, tabs, badges, charts, gradients, emoji or dark mode on customer pages.
- **A83. "I can't send this right now."** Every task offers this. Three reasons, as in `PortalCantSend`: I'll send it later (with an expected date), I've already sent this, this doesn't apply to me; plus an optional note. It is recorded with an audit event and shown to the adviser on the deal page. **It never counts as done and never satisfies a checklist row.** The task stays on the person's list, reworded to show what they told us, until the adviser or staff act: waive it with a reason, find the document, or accept the later date.
- **A84. Several files in one task.** A task can hold more than one file (for example, two monthly statements). `PortalTaskFiles` is the pattern: list what was sent, mark only the file that needs replacing, say exactly what is wrong with it, and leave the good files untouched. "Replace this file" supersedes that file alone.
- **A85. Three home states,** chosen by the mapping module: things to do; nothing to do while we check (`PortalWaiting`); all done. The headline is always a sentence about the person's situation, never a count of system states.
- **A86. While we read a document** show `PortalChecking`: what was received, what is happening now, what comes next, and that the person does not have to wait. State a wait only as long as the system really allows: "up to 20 seconds". If it takes longer, carry on in the background and show the result on the list. Design for the slow case and the failure case; neither may strand the person.
- **A87. Done is not approved.** "Done" means we have what we need from that person. No customer page may suggest the lender has accepted a document, or that the loan is approved, pre-approved, likely or on track. Keep four ideas separate in wording and in data: saved, sent to us, accepted by us, decided by the lender. The last one is never ours to show. This sits under guardrail 1.
- **A88. Ask, do not accuse.** Use definite wording only when the check is certain, for example a tax year read from the form's own text. When a check is uncertain (a scan, a classifier's view), phrase it as a question: "Is this your 2024 return?" and always offer "This is the right document".
- **A89. Small things.** One "please send these by" date on the home page when the adviser has set one, written as a date, never a countdown. An optional note to the adviser on every task. On a person's first visit, one short welcome line saying who asked for this, why, and that they can leave and come back. Split a person's list into "About you" and "About the business" only when it has more than six to-dos.
- **A82. "The lender file"** is the customer word for a package. "Not ready yet" states what is outstanding in one sentence. When everything is done the same block becomes "The lender file is ready" with one button to download it.

## 1. Build

1. The A72 to A74 mapping as one pure, tested module that turns an evaluation into a person's home: to-dos, with-us items, done items, stages, headline. The adviser's page uses the same module across people.
2. The person portal: home in its three states (A85); one task, including several files (A84) and "I can't send this right now" (A83); the wait and the result after an upload (A86, A75). Phone layout is required here.
3. The adviser's pages: the deals list as simple rows (deal, who we are waiting on, whether the lender file is ready); the deal page as in `ClientOverview`; the question page; "See every document" as a plain grouped list using the same three states.
4. Staff tools under `/staff`, restyled with A81, function unchanged.
5. Delete what this replaces: the tabbed deal page, the checklist, issues, requests and package screens, and their components.
6. **Demo seed.** Three deals as before. For Varnholt Climate Services: an adviser sign-in, and portal links for Alex Morgan (three things to do), Bea Lindqvist (all done), the seller's accountant and the seller. Batch 2 is not yet uploaded, so the live demo is Alex uploading from his link.
7. **Walkthrough**, `docs/WALKTHROUGH.md`, seven minutes: Alex's home on a phone; he uploads the wrong year and gets the gentle note; he uploads the right one; the adviser's deal page; the purchase price question; staff checking one scanned page; the lender file becoming ready.
8. **Live run** under A53 if a provider key is present. Otherwise state plainly that it remains the largest open risk.
9. One-page `README.md` and `docs/PILOT_RUNBOOK.md`.

## 2. Proof

- Screenshots of all eleven screens from the running, seeded app (desktop at 1440px, phone at 390px) in `docs/screenshots/phase-7/`.
- **Isolation tests:** Alex's token cannot read Bea's or the seller's items, documents, originals or any adviser or staff route; a revoked token reads nothing.
- The A77 and A55 lints pass on every customer page.
- A83: an "I can't send this" answer never satisfies a row, never moves a task to Done, and appears on the adviser's page. A84: replacing one file leaves the others current. A86: a slow check and a failed check both land the person back on a usable list. A87: the lint also fails on approved, pre-approved, accepted by the lender, on track.
- The mapping module: several failed checks on one document give one to-do; a disagreement gives one question to one person; not-applicable and lender-ordered items never reach a person.
- Browser tests, three: Alex's upload with the gentle note and the correction; the adviser answering the price question; Bea's all-done home on a phone viewport.
- Every input labelled, visible focus, body text contrast at least 4.5 to 1.
- `pnpm eval` passes with every Phase 6 gate unchanged. No engine or pipeline behaviour changed.
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm rules:check`, `pnpm fixtures:check`, `pnpm fixtures:generate --check`, `pnpm eval`, `pnpm build`.

## 3. Not in this phase

Passwords or accounts for people, in-app chat, e-signature, notifications, any email sent by the system, a mobile app, engine or pipeline changes, new dependencies beyond the two fonts.

## 4. Report, then stop

One page in `docs/phase-7-proof.md`. Then report: the screenshots; anything built differently from a reference screen and why; anything a reference screen shows that the data could not support; the isolation test results; the live run result or that it was skipped; what was deleted; command results.
