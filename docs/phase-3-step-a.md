# Phase 3 Step A

Deals can be created, listed, opened and edited with every profile field, parties, roles and ownership, plus profile JSON import. Unknown values remain explicit. Pack selection follows the expected loan-number date; Sample Lender A selects the configured overlay. Edits are audited and stale revisions rejected. Existing parties retain stable evidence identities.

Folder/ZIP intake preserves arrival paths and assigns sequential batch numbers. Exact hashes are unique within a deal; duplicates link to the existing version without parse or model calls. Safe ZIP decoding checks headers, paths, entry counts, expansion limits, nested archives, symlinks, methods and CRCs. Runtime parsers read page text and AcroForm widgets, DOCX paragraphs and XLSX sheet/cell locators, detect image-only pages, and route unreadable files to high-priority review. Code computes identifier HMAC/last-four values and scrubs stored text and payloads.

Proof: 132 unit tests passed, including every unique fixture's parser path and ZIP adversarial cases. Three new database integration tests passed: full profile/change audit/stale edits; batch parsing/duplicate skips/unreadable review/identifier-free stored outputs; cross-deal duplicate boundaries and role/workspace denial. The 20 retained integration tests also passed during the initial suite runs; the new suite initially exposed repeated-widget locator collisions and the inherited PDF/DOCX-only MIME constraint, both corrected. Production build passes after correcting a test-only TypeScript indexed-byte assertion.

Browser verification: authenticated home navigation and /deals/new load, all profile controls appear, no console errors or framework error overlay. Screenshot inspected locally. Full phase end-to-end flow follows in Step B.
