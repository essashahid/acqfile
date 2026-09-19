# Vendored XLSX distribution

`xlsx-0.20.3.tgz` is the unmodified SheetJS Community Edition tarball from:
https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

Installation guidance verified 2026-09-19:
https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

The vendor identifies this CDN distribution as authoritative and recommends vendoring for reproducibility. The public npm `xlsx` distribution is older. The package is pinned with `file:vendor/xlsx-0.20.3.tgz`; pnpm-lock.yaml records integrity. License: Apache-2.0, included in the tarball.

API references checked: https://docs.sheetjs.com/docs/api/utilities/array/ and https://docs.sheetjs.com/docs/api/write-options/ . String cells retain type `s`; HTML output is separately escaped.
