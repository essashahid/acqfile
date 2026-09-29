/**
 * The name written into the document properties of every generated synthetic fixture (PDF
 * Creator/Producer/Author, Office creator). Deliberately product-independent, so renaming the
 * product never requires regenerating the corpus. Never applied to uploaded or exported files.
 */
export const FIXTURE_PRODUCER = "Synthetic fixture generator";
export const RASTER_PRODUCER = `${FIXTURE_PRODUCER} (image-only pages)`;
export const IRS_PAGE_PRODUCER = `${FIXTURE_PRODUCER} (official IRS page, fields removed)`;
