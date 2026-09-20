import fs from "node:fs";
const escape = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
type Report = {
  recordedAt: string;
  passed: boolean;
  gates: {
    label: string;
    measured: number | string;
    required: string;
    passed: boolean;
    correct?: number;
    total?: number;
  }[];
  planted: {
    deal: string;
    batch: number;
    item: string | number;
    description: string;
    result: string;
  }[];
  traps: { deal: string; batch: number; id: string; result: string }[];
};
export function writeScorecard() {
  if (!fs.existsSync("eval/latest.json")) return;
  const r = JSON.parse(fs.readFileSync("eval/latest.json", "utf8")) as Report;
  const live = fs.existsSync("eval/live.json")
    ? (JSON.parse(fs.readFileSync("eval/live.json", "utf8")) as {
        status?: string;
        reason?: string;
        deals?: {
          deal: string;
          facts: Record<string, [number, number]>;
          scanClassification: [number, number];
          reviewItems: number;
          falseAccepts: unknown[];
          costUsd: number;
          wallClockMs: number;
        }[];
        releaseBlockers?: string[];
      })
    : null;
  const table = (headers: string[], rows: unknown[][]) =>
    `<table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>AcqFile scorecard</title><style>@page{size:A3 landscape;margin:9mm}body{font:10px Arial;margin:0}h1{font-size:17px}h2{font-size:12px}main{display:grid;grid-template-columns:1fr 1.65fr;gap:16px}table{border-collapse:collapse;width:100%;font-size:9px}td,th{border:1px solid #bbb;padding:3px;text-align:left}tr{break-inside:avoid}pre{white-space:pre-wrap;font-size:9px}</style></head><body><h1>AcqFile scorecard — ${r.passed ? "PASS" : "FAIL"}</h1><p><strong>Mock results say nothing about model quality.</strong> ${escape(r.recordedAt)}. Independent authored truth; real intake, parsing, extraction, review and evaluation.</p><main><section><h2>Mock gates</h2>${table(
    ["Gate", "Measured", "Required", "Result"],
    r.gates.map((g) => [
      g.label,
      typeof g.measured === "number"
        ? `${g.measured.toFixed(2)}${g.total !== undefined ? `% (${g.correct}/${g.total})` : ""}`
        : g.measured,
      g.required,
      g.passed ? "pass" : "FAIL",
    ]),
  )}<h2>Traps</h2>${table(
    ["Deal/batch", "Trap", "Result"],
    r.traps.map((t) => [t.deal + "/" + t.batch, t.id, t.result]),
  )}<h2>Live run</h2><p>${escape(live?.status ? `${live.status}: ${live.reason}` : live ? "See method accuracy, scan classification, review items, false accepts, cost and timing below." : "Not run")}</p>${
    live?.deals
      ? table(
          ["Deal", "Acro/text/vision", "Scans", "Review", "False accepts", "USD / seconds"],
          live.deals.map((d) => {
            const pct = ([ok, n]: [number, number]) =>
              n ? `${((100 * ok) / n).toFixed(1)}%` : "n/a";
            return [
              d.deal,
              ["acroform", "text", "vision"].map((m) => pct(d.facts[m]!)).join(" / "),
              pct(d.scanClassification),
              d.reviewItems,
              d.falseAccepts.length,
              `${d.costUsd.toFixed(3)} / ${(d.wallClockMs / 1000).toFixed(1)}`,
            ];
          }),
        )
      : ""
  }${live?.releaseBlockers?.length ? `<p>Release blockers: ${escape(live.releaseBlockers.join(", "))}</p>` : ""}<p>Full source paths, batch comparisons and regression details: latest.json; optional provider run: live.json. Only passing mock runs can establish baseline.json.</p></section><section><h2>Planted items</h2>${table(
    ["Deal/batch", "Item", "Expected issue", "Result"],
    r.planted.map((p) => [p.deal + "/" + p.batch, p.item, p.description, p.result]),
  )}</section></main></body></html>`;
  fs.writeFileSync("eval/scorecard.html", html + "\n");
}
