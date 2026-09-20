import { loadPack, PACK_VERSIONS } from "../src/lib/rules/loader";
import { FACT_CATALOG, TAXONOMY } from "../src/lib/domain/registry";
for (const version of PACK_VERSIONS)
  for (const overlay of [undefined, "sample-lender-a"]) {
    const pack = loadPack(version, overlay);
    console.log(
      `${version}${overlay ? " + " + overlay : ""}: ${pack.items.length} items (${pack.items.filter((r) => r.required).length} required definitions), ${pack.consistency.length} consistency; ${pack.content_hash}`,
    );
  }
console.log(`PASS: ${TAXONOMY.length} document types; ${FACT_CATALOG.length} fact attributes`);
