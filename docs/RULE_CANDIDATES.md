# Candidates and limits requiring lender or SME review

Recorded 2026-09-19. None of the proposed regulatory determinations below is an active rule. All shipped rules remain `verified: false`. Explicit synthetic lender conventions in the seed are preparation requirements, not claims that the SBA universally requires a document.

| Candidate | Why it is not implemented as a regulatory rule |
| --- | --- |
| Citizenship status determination, treatment of entity owners, and the reported legal challenge | The original version 8 text and version 8.1 differ, later notices may matter, and the supplied sources do not establish the current procedural posture of a lawsuit. GUA-05 collects evidence and a documented lender discussion only. No legal-status inference, disqualification or citizenship decision is made. |
| Treating a 100% Form 1919 ownership list as the form’s universal minimum | The seed demands a 100% total and matching owner list. The cited form guide describes narrower minimum listing coverage. ENT-01 keeps the requested stronger preparation convention, explicitly distinguished in its citation. |
| Transaction-specific equity thresholds and exceptions | Appendix 15 has category-specific requirements and exceptions. CON-07 deliberately implements the requested fixed `0.10 × 0.50 × project cost` comparison, labeled for lender review. It cannot establish the actual required injection, and it is not structuring advice. |
| Universal independent valuation without exceptions | Appendix 15 states the general valuation rule, while Section A's ESOP discussion retains an exception. TXN-08 follows the requested seed as a tracking item; no determination about an exception is implemented. |
| Fiscal-year tax-return coverage | A13 expressly limits v1 to calendar-year filers. Fiscal periods cannot be inferred from calendar labels. |
| Universal 120-day validity of IRS Form 4506-C; universal ten-year lease requirement; universal two-month account history | These exact thresholds are seed conventions. They are not attributed to the IRS, an SBA form, or a universally applicable SOP requirement. No separate regulatory rule is shipped. |
| Automated interpretation of personal licenses, franchise directory status, signatures, and citizenship documents | Manual confirmations and segment metadata are used. Automated external verification and document interpretation are outside Phase 1. |
| Sample Lender A policy authenticity | Sample Lender A is a synthetic overlay. No real lender policy has been obtained or represented as verified. |

Optional overlay rows are **defined**, not unresolved sourcing candidates: TXN-10b CIM, TXN-10c escrow evidence, TGT-12a key contracts, TGT-12b employee roster, TGT-12c seller good standing. They have `required: false`, remain visible in the viewer/review sheet, and produce `not_applicable` rows with no request or finding. The user selected TXN-10a non-compete and TGT-11 add-back schedule as Sample Lender A's two required additions. A later lender configuration can enable the others with a `set` operation.

The seed's statement that all lender tracking items are always listed conflicts with its explicit pack-specific QOE and conditional real-estate rows. Implemented resolution: retain unconditional credit, transcript, lien and insurance tracking; show valuation in both versions; include QOE only in 8.1 with the specified applicability; retain appraisal/environmental rows with conditional applicability. Do not manufacture a second mandatory QOE row in pack 8.
