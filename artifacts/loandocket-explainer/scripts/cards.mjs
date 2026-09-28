// Renders the opening illustration, closing card and all overlay PNGs (captions, labels,
// disclosure) with the app's own fonts and colours. Deterministic: CSS animations are paused
// and seeked frame by frame, so the output is identical on every run.
// Fonts are the app's own (Public Sans, Source Serif 4; SIL OFL 1.1), committed in ../fonts.
// Writes work/cards/manifest.json with a hash of every input; render.py refuses stale cards.
// Usage: node artifacts/loandocket-explainer/scripts/cards.mjs
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(HERE, "work/cards");
const FONT_DIR = path.join(HERE, "fonts");
const FONT_FILES = [
  "public-sans-latin.woff2",
  "public-sans-latin-ext.woff2",
  "source-serif-4-latin.woff2",
  "source-serif-4-latin-ext.woff2",
];
const INPUTS = [
  path.join(HERE, "scripts/cards.mjs"),
  path.join(HERE, "scripts/edit.json"),
  path.join(HERE, "narration.json"),
  ...FONT_FILES.map((f) => path.join(FONT_DIR, f)),
];
for (const f of INPUTS)
  if (!fs.existsSync(f)) throw Error(`Missing card input ${path.relative(HERE, f)}`);
const edit = JSON.parse(fs.readFileSync(path.join(HERE, "scripts/edit.json"), "utf8"));
const narration = JSON.parse(fs.readFileSync(path.join(HERE, "narration.json"), "utf8"));
const FPS = edit.fps;

const font = (f) => fs.readFileSync(path.join(FONT_DIR, f)).toString("base64");
const FONTS = `
@font-face { font-family: "Public Sans"; font-weight: 100 900; src: url(data:font/woff2;base64,${font("public-sans-latin.woff2")}) format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 100 900; src: url(data:font/woff2;base64,${font("public-sans-latin-ext.woff2")}) format("woff2"); unicode-range: U+100-2BA, U+2BD-2C5, U+2C7-2CC, U+2CE-2D7, U+2DD-2FF, U+304, U+308, U+329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Source Serif 4"; font-weight: 200 900; src: url(data:font/woff2;base64,${font("source-serif-4-latin.woff2")}) format("woff2"); }
@font-face { font-family: "Source Serif 4"; font-weight: 200 900; src: url(data:font/woff2;base64,${font("source-serif-4-latin-ext.woff2")}) format("woff2"); unicode-range: U+100-2BA, U+2BD-2C5, U+2C7-2CC, U+2CE-2D7, U+2DD-2FF, U+304, U+308, U+329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
`;
// App tokens (src/app/globals.css, customer and staff theme).
const T = {
  bg: "#F7F6F2",
  surface: "#FFFFFF",
  rail: "#F0EEE8",
  line: "#E4E1D8",
  ink: "#14202B",
  body: "#2C3A47",
  muted: "#5A6875",
  accent: "#12355B",
  warn: "#8A5A00",
  warnSoft: "#FBF3DF",
};
const BASE_CSS = `${FONTS}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1920px; height: 1080px; overflow: hidden; }
.stage { height: 920px; }
body { font-family: "Public Sans", system-ui, sans-serif; color: ${T.ink}; -webkit-font-smoothing: antialiased; }
.serif { font-family: "Source Serif 4", Georgia, serif; }
`;
const icon = (paths, size, stroke = "currentColor", width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const I = {
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  upload:
    '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
};
const logo = (size) =>
  `<span style="display:inline-grid;place-items:center;width:${size}px;height:${size}px;border-radius:${size * 0.22}px;background:${T.accent};color:#fff;box-shadow:0 1px 2px rgba(20,32,43,.12)">${icon(I.shield, size * 0.57, "#fff", 2.2)}</span>`;

// ── Opening illustration (not an app screen and not an integration) ─────────────
function openingHtml() {
  const sources = [
    { icon: I.mail, label: "Email attachments", y: 280 },
    { icon: I.folder, label: "Shared folders", y: 450 },
    { icon: I.upload, label: "Uploads and scans", y: 620 },
  ];
  const docs = [
    ["Purchase agreement", 0, 800, 268, -2],
    ["Letter of intent", 0, 1160, 284, 2.5],
    ["Personal tax return", 1, 820, 446, 1.5],
    ["Bank statement", 2, 1170, 458, -2.5],
    ["Sources and uses", 1, 800, 624, -1.5],
    ["Financial statement", 2, 1160, 634, 2],
  ];
  const flags = [
    ["Missing document", 1530, 318, 4.6],
    ["Details disagree", 1530, 492, 5.3],
    ["Needs a correction", 1530, 666, 6.0],
  ];
  const srcHtml = sources
    .map(
      (s, i) =>
        `<div class="src" style="top:${s.y}px;animation-delay:${0.35 + i * 0.25}s">${icon(s.icon, 44, T.accent)}<span>${s.label}</span></div>`,
    )
    .join("");
  const docHtml = docs
    .map(([t, from, x, y, r], i) => {
      const sy = sources[from].y;
      return `<style>@keyframes fly${i} { 0% { opacity:0; transform: translate(${300 - x}px, ${sy - y}px) rotate(0deg) scale(.7); } 15% { opacity:1; } 100% { opacity:1; transform: translate(0,0) rotate(${r}deg) scale(1); } }</style>
      <div class="doc" style="left:${x}px;top:${y}px;animation: fly${i} 1.1s cubic-bezier(.2,.7,.2,1) ${1.1 + i * 0.42}s both">${icon(I.file, 34, T.muted)}<span>${t}</span></div>`;
    })
    .join("");
  const flagHtml = flags
    .map(
      ([t, x, y, d]) =>
        `<div class="flag" style="left:${x}px;top:${y}px;animation-delay:${d}s">${t}</div>`,
    )
    .join("");
  return `<!doctype html><html><head><style>${BASE_CSS}
body { background: ${T.bg}; position: relative; }
h1 { position:absolute; left:160px; top:84px; font-size:68px; font-weight:600; letter-spacing:-.01em; animation: rise .8s ease-out .1s both; }
.sub { position:absolute; left:162px; top:176px; font-size:32px; color:${T.muted}; animation: rise .8s ease-out 2.6s both; }
.src { position:absolute; left:160px; width:470px; height:118px; display:flex; align-items:center; gap:24px; padding:0 32px; background:${T.surface}; border:1px solid ${T.line}; border-radius:16px; font-size:32px; font-weight:600; animation: rise .6s ease-out both; }
.lane { position:absolute; left:660px; top:300px; width:300px; height:560px; border-left:2px dashed ${T.line}; opacity:0; animation: fade .6s ease-out 1s both; }
.doc { position:absolute; width:320px; height:150px; padding:22px 24px; display:flex; flex-direction:column; gap:14px; background:${T.surface}; border:1px solid ${T.line}; border-radius:12px; box-shadow:0 10px 24px rgba(20,32,43,.08); font-size:24px; font-weight:600; color:${T.body}; }
.flag { position:absolute; padding:14px 22px; border-radius:12px; background:${T.warnSoft}; color:${T.warn}; border:1px solid #EAD9A8; font-size:28px; font-weight:600; animation: pop .45s cubic-bezier(.2,.9,.3,1.3) both; }
.note { position:absolute; left:160px; top:846px; font-size:22px; color:${T.muted}; letter-spacing:.06em; text-transform:uppercase; animation: fade .6s ease-out .4s both; }
@keyframes rise { from { opacity:0; transform: translateY(18px); } to { opacity:1; transform:none; } }
@keyframes fade { from { opacity:0 } to { opacity:1 } }
@keyframes pop { from { opacity:0; transform: scale(.85); } to { opacity:1; transform:none; } }
</style></head><body>
<h1 class="serif">Preparing an acquisition-loan file</h1>
<div class="sub">Collect the documents. Check the details. Chase what's missing.</div>
${srcHtml}${docHtml}${flagHtml}
<div class="note">Illustration</div>
</body></html>`;
}

// ── Closing card ────────────────────────────────────────────────────────────────
function closingHtml() {
  return `<!doctype html><html><head><style>${BASE_CSS}
body { background:${T.bg}; display:grid; place-items:center; }
.wrap { text-align:center; }
.brand { display:inline-flex; align-items:center; gap:30px; font-size:96px; font-weight:600; letter-spacing:-.015em; animation: rise .8s ease-out .1s both; }
.line { margin-top:56px; font-size:44px; line-height:1.4; color:${T.body}; animation: rise .8s ease-out .9s both; }
.foot { position:absolute; left:0; right:0; bottom:64px; text-align:center; font-size:24px; color:${T.muted}; animation: fade .8s ease-out 1.6s both; }
@keyframes rise { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform:none; } }
@keyframes fade { from { opacity:0 } to { opacity:1 } }
</style></head><body><div class="wrap">
<div class="brand">${logo(112)}<span>LoanDocket</span></div>
<div class="line serif">${edit.closing.lines.map(esc).join("<br>")}</div>
</div><div class="foot">Prototype demonstration · Sample data · Supports document preparation and human review; lending decisions stay with the lender.</div></body></html>`;
}

// ── Overlays: transparent full-frame PNGs ────────────────────────────────────────
const BAND_TOP = 920; // app footage above, caption band below (drawn by render.py)
const overlayCss = `${BASE_CSS} html, body { background: transparent; } body { position: relative; }
.cap { position:absolute; left:520px; right:64px; top:${BAND_TOP}px; height:134px; display:flex; align-items:center; color:#fff; font-size:34px; line-height:1.34; font-weight:500; text-wrap:pretty; }
.label { position:absolute; left:64px; width:396px; top:${BAND_TOP}px; height:160px; display:flex; flex-direction:column; justify-content:center; gap:8px; color:#fff; }
.label .eyebrow { font-size:17px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#9DB0C3; }
.label .text { font-size:28px; line-height:1.2; font-weight:600; }
.rule { position:absolute; left:488px; top:${BAND_TOP + 34}px; width:1px; height:92px; background:rgba(255,255,255,.2); }
.disc { position:absolute; left:520px; top:${BAND_TOP + 124}px; font-size:18px; letter-spacing:.02em; color:#9DB0C3; }
`;
const overlayHtml = (inner) =>
  `<!doctype html><html><head><style>${overlayCss}</style></head><body>${inner}</body></html>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const clipFor = (name) =>
  name === "opening" ? { x: 0, y: 0, width: 1920, height: 920 } : undefined;

async function animate(name, html, seconds) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(
      (ms) => document.getAnimations().forEach((a) => (a.currentTime = ms)),
      (i * 1000) / FPS,
    );
    await page.screenshot({
      path: path.join(dir, `${String(i).padStart(4, "0")}.png`),
      clip: clipFor(name),
    });
  }
  console.log(`${name}: ${n} frames`);
}

async function still(file, html) {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
}

fs.mkdirSync(OUT, { recursive: true });
await animate("opening", openingHtml(), edit.opening.duration);
await animate("closing", closingHtml(), edit.closing.duration);

for (const n of narration)
  await still(`cap-${n.id}.png`, overlayHtml(`<div class="cap">${esc(n.caption)}</div>`));
const labelled = [{ id: "opening", ...edit.opening }, ...edit.shots].filter((s) => s.label);
for (const s of labelled)
  await still(
    `label-${s.id}.png`,
    overlayHtml(
      `<div class="label"><span class="eyebrow">${esc(edit.steps[s.step])}</span><span class="text">${esc(s.label)}</span></div><div class="rule"></div>`,
    ),
  );
await still(
  "disclosure.png",
  overlayHtml(
    `<div class="disc">Prototype demonstration · Sample data · Document readings prepared for this demo</div>`,
  ),
);
await browser.close();
const inputs = createHash("sha256");
for (const f of INPUTS) inputs.update(fs.readFileSync(f));
fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify(
    { inputs: inputs.digest("hex"), files: INPUTS.map((f) => path.relative(HERE, f)) },
    null,
    1,
  ),
);
console.log("cards and overlays written to", path.relative(HERE, OUT));
