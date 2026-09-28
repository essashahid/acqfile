// Exploration: screenshot a list of paths as the Operator. Usage: node explore.mjs outdir path...
import { launch, signIn, BASE } from "./lib.mjs";
const [out, ...paths] = process.argv.slice(2);
const { browser, context } = await launch({ viewport: { width: 1440, height: 900 }, scale: 1 });
const page = await context.newPage();
await signIn(page);
for (const p of paths) {
  await page.goto(`${BASE}${p}`);
  await page.waitForLoadState("networkidle");
  const name = p.replace(/[^a-z0-9]+/gi, "_").slice(0, 80) || "root";
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(p, "->", page.url().replace(BASE, ""), "|", await page.title());
}
await browser.close();
