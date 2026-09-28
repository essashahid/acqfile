// High-resolution screen capture through the Chrome DevTools screencast.
// Playwright's built-in video ignores deviceScaleFactor, so frames are captured at device
// pixels here, timestamped, and later rebuilt into constant-frame-rate video by render.py.
import fs from "node:fs";
import path from "node:path";

export class Recorder {
  constructor(page, dir, { width = 2880, height = 1620, quality = 92 } = {}) {
    Object.assign(this, { page, dir, width, height, quality });
    this.frames = [];
    this.marks = [];
    // Never clears an existing take: record.mjs chooses a fresh folder or moves the old one aside.
    if (fs.existsSync(path.join(dir, "frames"))) throw Error(`${dir} already has frames.`);
    fs.mkdirSync(path.join(dir, "frames"), { recursive: true });
  }
  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
      const file = `frames/f${String(this.frames.length).padStart(6, "0")}.jpg`;
      fs.writeFileSync(path.join(this.dir, file), Buffer.from(data, "base64"));
      this.frames.push({ file, t: metadata.timestamp });
      try {
        await this.cdp.send("Page.screencastFrameAck", { sessionId });
      } catch {}
    });
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: this.quality,
      maxWidth: this.width,
      maxHeight: this.height,
      everyNthFrame: 1,
    });
    this.t0 = Date.now() / 1000;
    this.mark("start");
  }
  mark(name) {
    const t = Date.now() / 1000;
    this.marks.push({ name, t });
    console.log(`[mark] ${name} @ ${(t - (this.t0 ?? t)).toFixed(2)}s`);
  }
  async stop() {
    this.mark("end");
    await this.cdp.send("Page.stopScreencast");
    fs.writeFileSync(
      path.join(this.dir, "timeline.json"),
      JSON.stringify({ t0: this.t0, frames: this.frames, marks: this.marks }, null, 1),
    );
  }
}

/** Browser zoom for recording: a 1440x810 layout rendered with 2880x1620 real pixels. */
export const ZOOM = 2;
export const ZOOM_SCRIPT = `
(() => {
  // A stylesheet rather than an attribute on <html>, so React hydration is unaffected.
  const apply = () => {
    if (document.getElementById("__rec_zoom") || !document.head) return;
    const s = document.createElement("style");
    s.id = "__rec_zoom";
    s.textContent = "html { zoom: ${ZOOM}; }";
    document.head.appendChild(s);
  };
  document.addEventListener("DOMContentLoaded", apply);
})();
`;

/** A visible cursor for headless recording. It only follows real mouse events. */
export const CURSOR_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById("__rec_cursor")) return;
    const c = document.createElement("div");
    c.id = "__rec_cursor";
    c.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2 L2 24 L8 18.5 L12.2 28 L16 26.3 L11.9 17 L20 17 Z" fill="#14202B" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "-40px", top: "-40px", zIndex: 2147483647, pointerEvents: "none", transition: "transform 120ms ease-out" });
    document.documentElement.appendChild(c);
    const ring = document.createElement("div");
    ring.id = "__rec_ring";
    Object.assign(ring.style, { position: "fixed", width: "34px", height: "34px", marginLeft: "-17px", marginTop: "-17px", borderRadius: "50%", border: "2px solid #12355B", opacity: 0, zIndex: 2147483646, pointerEvents: "none", transition: "opacity 350ms ease-out, transform 350ms ease-out" });
    document.documentElement.appendChild(ring);
    const pos = (window.__recPos ||= { x: -40, y: -40 });
    // Mouse events report viewport pixels; this overlay lives inside the zoomed root.
    const z = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const place = () => { c.style.left = pos.x / z() - 2 + "px"; c.style.top = pos.y / z() - 2 + "px"; };
    place();
    addEventListener("mousemove", (e) => { pos.x = e.clientX; pos.y = e.clientY; place(); }, true);
    addEventListener("mousedown", (e) => {
      c.style.transform = "scale(0.88)";
      ring.style.transition = "none"; ring.style.left = e.clientX / z() + "px"; ring.style.top = e.clientY / z() + "px";
      ring.style.opacity = 0.9; ring.style.transform = "scale(0.5)";
      requestAnimationFrame(() => { ring.style.transition = "opacity 450ms ease-out, transform 450ms ease-out"; ring.style.opacity = 0; ring.style.transform = "scale(1.4)"; });
    }, true);
    addEventListener("mouseup", () => { c.style.transform = ""; }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();
`;
