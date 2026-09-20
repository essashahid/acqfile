# Borrower portal: visual research handoff

Research date: 20 September 2026

## Scope and evidence

Reviewed public material for FileInvite, Floify, LoanBud, Blend, Content Snare, TaxDome, Maxwell, Finmo, Clustdoc, and File Request Pro. The gallery contains 20 visually inspected images across six products. It separates help-centre screenshots, published product screens, device-framed views, and illustrative UI compositions. No authenticated portals were used. Published images do not prove the exact appearance of every current installation.

Open `portal_visual_gallery.html` in a browser with internet access. Its images are linked to the vendors’ public hosts, not downloaded or embedded. Each card has an original-image link, source link, evidence label, date caveat, design use, and a caution. `reference_manifest.json` contains the same sources in structured form.

## Start with these references

- **BL01 / Blend:** application status, next actions, review stage, and human contact on one page.
- **FL01 and FL05 / Floify:** a few meaningful application stages and one clear next action.
- **FI01 / FileInvite:** the 2026 borrower portal and grouping for larger requirement sets; do not automatically copy its percentage bar or filter density.
- **CS01 / Content Snare:** correct one specific file while retaining the others.
- **MX01 / Maxwell:** document-type feedback with immediate repair choices; this is a marketing-framed feature illustration.

## Proposed design brief

The current product should be redesigned around what the customer needs to do, not around the backend’s requests, packages, checks, file paths, and exception states. This is a proposed direction, not a claim that the references have been usability-tested for our audience.

Build a calm home screen that explains the current stage, the next required actions, what the team is reviewing, and how to get help. Use a few meaningful stages instead of leading with a large item-completion count. Keep detailed requirements available below that summary.

For a document task, show what is needed, the relevant person/company and period, why it is needed, acceptance instructions, the uploaded files, and a clear action. Where the workflow supports it, let the customer explain that an item is not applicable, has already been provided, or will arrive later. Do not silently treat those answers as accepted evidence.

Treat corrections as specific tasks. Explain what needs clarification, identify the relevant file or answer, and offer a replacement or confirmation action. Preserve valid uploads. Do not translate an uncertain automated check into a definitive statement that the customer supplied false or contradictory information. Keep detailed reviewer diagnostics internal.

Do not copy nested status/category tabs, percentage bars, or counts-first KPI cards merely because an established vendor uses them. Do not copy branding, layouts pixel for pixel, or unsupported mortgage-specific functionality. Preserve the underlying required behavior while reconsidering navigation, terminology, hierarchy, and components.

Prototype and verify: first visit; partial completion; save and return; upload; several files for one requirement; a document that cannot yet be supplied; a correction; resubmission; a waiting-for-review state; and an all-current-actions-complete state. Saved, submitted, accepted, and approved must remain distinct.

## Important limits

LoanBud’s application entry was reached, but its portal screens were not inspectable. Do not label another product’s imagery as LoanBud. TaxDome, Finmo, and File Request Pro contribute official workflow documentation, not verified screenshot sets in this handoff. Videos were located through official pages but were not reviewed frame by frame. No video timestamps are asserted.

The older FileInvite and Content Snare images are workflow references, not evidence of their latest visual systems. Floify’s official 2026 mobile application images are a different surface from its documented document-request portal. The Maxwell and Clustdoc images are marketing-framed UI compositions and should not be treated as full live screenshots.

## Image source register

### BL01 | Blend | Application status with tasks and loan stages

**Evidence:** Published product screen. **Audience:** Customer.

Asset path: April 2024. This is a published example, not a verified 2026 live screen.

[Original image](https://blend.com/wp-content/uploads/2024/04/Follow-ups-1120x702.png) · [Official source](https://blend.com/products/mortgage-suite/originations/)

**Visible:** A review-stage headline, a task card, a completed/current/upcoming timeline, and lender contact details appear together.

**Design use:** Use this as the main desktop structure reference. Separate the customer’s actions from the lender’s work.

**Caution:** The pre-approval card is mortgage-specific. Do not invent equivalent approval information for our product.

### FL01 | Floify | A small number of meaningful application stages

**Evidence:** Device-framed product view. **Audience:** Customer.

Asset path: February 2026. Official product-page image.

[Original image](https://i0.wp.com/floify.com/wp-content/uploads/2026/02/image-2.png?fit=964%2C1970&ssl=1) · [Official source](https://floify.com/lender-edition)

**Visible:** Three sections introduce work/income, bank accounts, and final review. One stage is active and there is one primary action.

**Design use:** Use stages to explain the journey, rather than making a large document count the main story.

**Caution:** This illustrates an application flow, not the later document-request portal. Do not conflate those experiences.

### FI01 | FileInvite | Portal V3: grouped borrower document requirements

**Evidence:** Published product screen. **Audience:** Customer.

2026 platform announcement; image itself shows May 2026.

[Original image](https://www.fileinvite.com/hubfs/2-Images/Blog%20Images/2026-platform-screenshot.png) · [Official source](https://www.fileinvite.com/blog/fileinvite-delivers-major-platform-expansion-in-2026)

**Visible:** Simple persistent navigation, personal/business requirement groups, a due date, and status filters.

**Design use:** Useful for organizing a large set of requirements without exposing file-system structure.

**Caution:** It still uses percentage progress, a dense list, and several status filters. Those are not automatic recommendations.

### CS01 | Content Snare | Replace one incorrect file without redoing the rest

**Evidence:** Help-centre screenshot. **Audience:** Customer.

Screenshot asset: March 2024. Host article updated February 2026.

[Original image](https://contentsnare.com/help/wp-content/uploads/2024/03/chrome_Se9Sc2v3ox.png) · [Official source](https://contentsnare.com/help/knowledge-base/approving-rejecting/)

**Visible:** One file in a group is singled out with an explanation and a Replace action; other files remain visible.

**Design use:** Turn a validation issue into one specific repair action. Preserve the files that are already usable.

**Caution:** Borrow the repair pattern, not necessarily the bright palette or the term Redo.

### BL02 | Blend | Focused property-intake form

**Evidence:** Published product screen. **Audience:** Customer.

Asset path: April 2024. Published example.

[Original image](https://blend.com/wp-content/uploads/2024/04/Application-Intake-1120x702.png) · [Official source](https://blend.com/products/mortgage-suite/originations/)

**Visible:** A single form column collects a small set of related property details and ends with one Continue button.

**Design use:** Keep each application step focused on one understandable subject.

**Caution:** The mortgage fields are examples, not our requirements.

### FL02 | Floify | Choose the purpose of the loan

**Evidence:** Device-framed product view. **Audience:** Customer.

Asset path: February 2026.

[Original image](https://i0.wp.com/floify.com/wp-content/uploads/2026/02/dynamic-apps-1.png?fit=964%2C1970&ssl=1) · [Official source](https://floify.com/lender-edition)

**Visible:** Large selectable loan-purpose cards include short explanations and lead to a single Continue action.

**Design use:** Use clear choices and explanations before presenting a long questionnaire.

**Caution:** Only show choices our backend and product rules actually support.

### FL03 | Floify | Employment choice in a mobile bottom sheet

**Evidence:** Device-framed product view. **Audience:** Customer.

Asset path: February 2026.

[Original image](https://i0.wp.com/floify.com/wp-content/uploads/2026/02/image-4.png?fit=964%2C1970&ssl=1) · [Official source](https://floify.com/lender-edition)

**Visible:** A contextual sheet asks the user to choose wage employment or self-employment, with plain-language descriptions.

**Design use:** Use contextual selection rather than forcing a second navigation layer.

**Caution:** Bottom sheets need appropriate mobile focus, keyboard, and dismissal behavior.

### FL04 | Floify | Explain what is happening during document processing

**Evidence:** Device-framed product view. **Audience:** Customer.

Asset path: February 2026.

[Original image](https://i0.wp.com/floify.com/wp-content/uploads/2026/02/image-10.png?fit=501%2C1024&ssl=1) · [Official source](https://floify.com/lender-edition)

**Visible:** A processing screen explains that document information is being extracted and gives an estimated wait.

**Design use:** Replace raw job states with a clear explanation of the action in progress.

**Caution:** Only promise a waiting time that our system can support. Design a separate delay or failure state.

### FL05 | Floify | Review and finish the application

**Evidence:** Device-framed product view. **Audience:** Customer.

Asset path: February 2026.

[Original image](https://i0.wp.com/floify.com/wp-content/uploads/2026/02/image-12.png?fit=964%2C1970&ssl=1) · [Official source](https://floify.com/lender-edition)

**Visible:** Completed stages carry checkmarks; final review is clearly active with one Continue action.

**Design use:** Make completion visible by meaningful section, while keeping the next action prominent.

**Caution:** Application submitted, documents received, documents accepted, and loan approved are different states.

### FI02 | FileInvite | Document-specific guidance, upload, and note

**Evidence:** Help-centre screenshot. **Audience:** Customer.

Legacy help-centre interface. Not Portal V3; the guide includes 2023 example data.

[Original image](https://help.fileinvite.com/hubfs/Knowledge%20Base%20Import/downloads.intercomcdn.comio700923209135e78c191e7ec7d1d1a2aba36f40e9a-9da8-4375-9391-85fd555ff2dd.png) · [Official source](https://help.fileinvite.com/client-and-sender-experiences)

**Visible:** An ID requirement combines acceptance instructions, an uploaded file, and a note explaining the customer’s situation.

**Design use:** Put upload guidance and a way to explain a problem in the same task.

**Caution:** Legacy visual styling and an explicit Save step are not design targets.

### FI03 | FileInvite | Legacy portal layout for comparison

**Evidence:** Help-centre screenshot. **Audience:** Customer.

Legacy help-centre interface with 2023 example data. Not Portal V3.

[Original image](https://help.fileinvite.com/hubfs/Knowledge%20Base%20Import/downloads.intercomcdn.comio700923215b4b72132bd4b1e9ea2e5bd185eba46b6-60f3-4b41-b3ed-523dc78c71ff.png) · [Official source](https://help.fileinvite.com/client-and-sender-experiences)

**Visible:** A requirement list and messaging panel sit side by side, with total requests and due date above.

**Design use:** Keep related communication accessible; use this mainly to contrast the legacy and V3 approaches.

**Caution:** Do not use the old Requests terminology or this dense layout as a default blueprint.

### FI04 | FileInvite | Customer–adviser messaging

**Evidence:** Help-centre screenshot. **Audience:** Customer.

Legacy help-centre image with March 2023 example data.

[Original image](https://help.fileinvite.com/hubfs/Knowledge%20Base%20Import/downloads.intercomcdn.comio70092321186baeab980f0f9280d63628a0a628e0a-ae39-4a03-a7a5-3ca0a1eeb44c.png) · [Official source](https://help.fileinvite.com/client-and-sender-experiences)

**Visible:** A conversation allows the customer to explain when the remaining documents will be available.

**Design use:** Offer an explanation route rather than assuming every outstanding item can be uploaded immediately.

**Caution:** Prefer a task-linked conversation for a specific document problem; this example is a general thread.

### CS02 | Content Snare | Client welcome and instructions

**Evidence:** Help-centre screenshot. **Audience:** Customer.

Guide updated March 2024; screenshot includes 2021 example data. Legacy reference.

[Original image](https://contentsnare.com/help/wp-content/uploads/2024/03/h2-1024x589.png) · [Official source](https://contentsnare.com/help/knowledge-base/client-guide/)

**Visible:** A welcome screen introduces the process and automatic saving before the customer begins.

**Design use:** Explain why information is needed and whether the customer can leave and return.

**Caution:** The long instruction block, percentage bar, and old styling are not recommendations.

### CS03 | Content Snare | A question with instructions and draft continuation

**Evidence:** Help-centre screenshot. **Audience:** Customer.

Guide updated March 2024; legacy annotated screenshot.

[Original image](https://contentsnare.com/help/wp-content/uploads/2024/03/h6-1024x204.png) · [Official source](https://contentsnare.com/help/knowledge-base/client-guide/)

**Visible:** A question has a short instruction and separate submission and draft-continuation actions.

**Design use:** Distinguish saved progress from a response submitted for review.

**Caution:** This is a field-level example. Avoid giving every field an unnecessary separate submission action.

### CS04 | Content Snare | Correction feedback attached to the answer

**Evidence:** Help-centre screenshot. **Audience:** Customer.

Guide updated March 2024; legacy annotated screenshot.

[Original image](https://contentsnare.com/help/wp-content/uploads/2024/03/h15.png) · [Official source](https://contentsnare.com/help/knowledge-base/client-guide/)

**Visible:** The answer, requested requirements, reviewer comment, and resubmission action are shown together.

**Design use:** Keep the evidence, explanation, and fix in one place.

**Caution:** The example comment is vague. Our correction messages should state exactly what needs to change.

### CS05 | Content Snare | The staff action behind a customer correction

**Evidence:** Help-centre screenshot. **Audience:** Staff context.

Screenshot asset: March 2024. Host article updated February 2026.

[Original image](https://contentsnare.com/help/wp-content/uploads/2024/03/chrome_fZyM8PWnE4.png) · [Official source](https://contentsnare.com/help/knowledge-base/approving-rejecting/)

**Visible:** The staff rejection dialog asks for a reason and a description of how the customer can fix the answer.

**Design use:** Keep diagnostic/reviewer actions internal while giving customers an actionable explanation.

**Caution:** This is not a customer-facing screen. Do not put a Reject action into the borrower interface.

### CS06 | Content Snare | Nested section navigation and repeated counts

**Evidence:** Help-centre screenshot. **Audience:** Customer.

Guide updated March 2024; screenshot includes 2021 example data. Legacy reference.

[Original image](https://contentsnare.com/help/wp-content/uploads/2024/03/h10.png) · [Official source](https://contentsnare.com/help/knowledge-base/client-guide/)

**Visible:** A sidebar expands from stages to subsections to individual fields, with multiple completion counts.

**Design use:** This is an anti-reference for the current brief: even established products can expose too much structure.

**Caution:** Do not reproduce this hierarchy just because it appears in a competitor product.

### MX01 | Maxwell | Wrong-document feedback with repair choices

**Evidence:** UI illustration / composition. **Audience:** Customer.

Asset path: July 2025. Marketing-framed feature view, not a full live screen.

[Original image](https://himaxwell.net/wp-content/uploads/2025/07/POS_AI-Doc-Validation.png) · [Official source](https://himaxwell.com/products/maxwell-point-of-sale/)

**Visible:** A tax-return upload is flagged as a different document type, with options to move it, keep it, or remove it.

**Design use:** A useful correction pattern: identify the issue and immediately offer the next action.

**Caution:** For uncertain classifications, ask for confirmation rather than making an unsupported definitive accusation.

### MX02 | Maxwell | Borrower summary cards

**Evidence:** UI illustration / composition. **Audience:** Customer.

Asset path: September 2025. Marketing-framed composition, not a full live screen.

[Original image](https://himaxwell.net/wp-content/uploads/2025/09/BorrowerDashboard%402x-1-766x1024.png) · [Official source](https://himaxwell.com/products/maxwell-point-of-sale/)

**Visible:** Large cards show task counts, documents to review, loan amount, and a contact.

**Design use:** An optional visual reference for readable cards and contact visibility.

**Caution:** The counts-first dashboard repeats part of the problem in the brief. It is not our preferred home-page model.

### CL01 | Clustdoc | Branded onboarding entry form

**Evidence:** UI illustration / composition. **Audience:** Customer.

Asset path: March 2023. Product UI framed within a marketing image.

[Original image](https://clustdoc.com/wp-content/uploads/2023/03/Illustration-pictures-5.png) · [Official source](https://clustdoc.com/features/onboarding-portal/)

**Visible:** A branded registration/login entry asks for basic company and contact details before starting onboarding.

**Design use:** Use recognizable provider identity and a clear reason for entering information.

**Caution:** This is an entry-screen reference only. It does not verify the interior client workflow.

## Additional workflow sources

### Floify | Borrower portal: complete workflow guide

[Official help guide; embedded tutorial linked from page](https://help.floify.com/en/articles/15141516-portal-overview-for-borrowers)

Guide describes document upload, lender-review states, multiple files per requirement, and not-applicable requests. It also describes layered status/category tabs. These differ from the newer mobile application examples above.

### TaxDome | Client home page and to-do list

[Official workflow documentation](https://client-help.taxdome.com/article/1885-client-dashboard)

Describes a client to-do list and a separate work-in-progress area. Strong reference for separating client actions from staff work. Individual screenshots could not be extracted and verified in this session.

### TaxDome | Document checklist and missing-document reasons

[Official workflow documentation](https://client-help.taxdome.com/article/document-checklist)

Documents can be matched to checklist items. Customers can explain missing items, including not applicable, already provided, or a later upload date. Automatic matching depends on the firm enabling it.

### TaxDome | Document-checklist video

[Official embedded video located; not reviewed frame by frame](https://player.vimeo.com/video/1152262760)

Linked from the official checklist guide. Open to see the workflow in motion; no timestamps or frame-level observations are claimed here.

### TaxDome | Client mobile-app overview video

[Official embedded video located; not reviewed frame by frame](https://player.vimeo.com/video/721354492)

Linked from the official client-home guide. Included as a further visual walkthrough, not as a verified current-screen recording.

### Finmo | Request documents from a borrower

[Official workflow documentation](https://help.finmo.ca/en/articles/3552802-how-to-request-documents-from-your-borrower-s)

Describes notification-to-portal document collection and grouping by borrower. The guide covers both staff and customer actions; do not assume all status labels are customer-visible.

### Finmo | Review uploads and ask for a correction

[Official workflow documentation](https://help.finmo.ca/en/articles/3308733-how-to-review-document-uploads-and-mark-them-with-the-correct-status)

Staff can mark an upload as needing attention and explain the correction to the borrower. No standalone Finmo screenshot was visually verified for this gallery.

### File Request Pro | Guided intake: steps, tasks, and sign-off

[Official workflow documentation](https://filerequestpro.com/docs/frp/upload-page-layouts)

Distinguishes a reusable upload link from a recipient-specific workflow. Useful reminder that save-and-resume behavior must match the selected access model.

### File Request Pro | Upload-page product example

[Public product example; not an authenticated walkthrough](https://filerequestpro.com/upload-pages)

Shows the distinction between the client’s upload task and the team’s file organization. The full-size image linked there is an editor view, not a borrower portal, and was not visually verified here.

### LoanBud | Public site and application entry point

[Evidence gap](https://loanbud.com/)

The Apply link leads to https://apply.loanbud.com/. The research browser could not inspect that JavaScript application or verify its authenticated screens. No LoanBud portal screenshot is represented in the gallery.
