# Official blank form trial

Downloaded directly from SBA on 2026-09-19, within the two-hour timebox (trial took minutes):

- [SBA 1919 (02/2025)](https://legacy.sba.gov/sites/default/files/2025-03/2025.02.27%20Form%201919%20-%20Updates%20%28FINAL%29_03-12-2025%20%281%29.pdf): seven pages, 126 AcroForm fields, no XFA. Filled `applicantname` with synthetic text, saved, reopened with pdf-lib and read back the exact text.
- [SBA 413](https://legacy.sba.gov/sites/default/files/2025-02/SBAForm413.pdf): six pages, 147 AcroForm fields, no XFA. Filled `Name`, saved, reopened and read back the exact text.

Phase 3 A29/A30 supersedes the earlier facsimile decision. Every generated Form 1919 and Form 413 now uses these official blanks, including forms subsequently rasterized. See `src/lib/config/official-form-fields.ts` for the shared field mapping and `docs/phase-3-step-0.md` for coverage. Each original page carries SYNTHETIC; one appended synthetic evidence sheet supplies literal truth quotes. The complete originals remain cached unchanged. Filling, saving and readback succeeded within the three-hour timebox; no fallback was needed.
