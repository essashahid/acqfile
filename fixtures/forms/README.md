# Official blank form trial

Downloaded directly from SBA on 2026-09-19, within the two-hour timebox (trial took minutes):

- [SBA 1919 (02/2025)](https://legacy.sba.gov/sites/default/files/2025-03/2025.02.27%20Form%201919%20-%20Updates%20%28FINAL%29_03-12-2025%20%281%29.pdf): seven pages, 126 AcroForm fields, no XFA. Filled `applicantname` with synthetic text, saved, reopened with pdf-lib and read back the exact text.
- [SBA 413](https://legacy.sba.gov/sites/default/files/2025-02/SBAForm413.pdf): six pages, 147 AcroForm fields, no XFA. Filled `Name`, saved, reopened and read back the exact text.

AcroForm support works. However, the official blanks contain literal terms barred by guardrail 1 (1919: eligible, ineligible, approved; 413: ineligible, approved). Reproducing those pages as generated fixture documents would fail the required synthetic-data lint. We therefore use clearly labeled simplified training facsimiles with our own AcroForm fields, form numbers, OMB identifiers, titles and signature blocks. This is a conflict between the official-form preference and the hard wording guardrail, not a claimed library failure. Cached originals here are reference source documents, not generated deal files.

The document readback test checks every generated AcroForm field against its plan value. These facsimiles are deliberately incomplete training documents and must never be submitted.
