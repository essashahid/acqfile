import fs from "node:fs";
import { loadPack, PACK_VERSIONS } from "../src/lib/rules/loader";
import { exportReview } from "../src/lib/rules/review-export";
const result = exportReview(PACK_VERSIONS.flatMap(v => [loadPack(v), loadPack(v, "northfield-bank")]));
fs.writeFileSync("docs/RULEPACK_REVIEW.xlsx", result.xlsx);
fs.writeFileSync("docs/RULEPACK_REVIEW.html", result.html);
console.log("PASS: docs/RULEPACK_REVIEW.xlsx and docs/RULEPACK_REVIEW.html (four resolved configurations)");
