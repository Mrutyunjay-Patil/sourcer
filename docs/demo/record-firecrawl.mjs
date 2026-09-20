// Records the Firecrawl supplier discovery segment on production.
// Usage: node record-firecrawl.mjs <outDir> <email> <password>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [outDir = "./out", email, password] = process.argv.slice(2);
const BASE = "https://careful-capybara-546.convex.site";
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const marks = [];
const mark = (label) => { const s = (Date.now() - t0) / 1000; marks.push({ t: s, label }); console.log(s.toFixed(1).padStart(6), label); };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: outDir, size: { width: 1600, height: 900 } } });
const page = await context.newPage();
page.setDefaultTimeout(120_000);
await context.addInitScript(() => {
  const style = document.createElement("style");
  style.textContent = `#__cursor{position:fixed;z-index:2147483647;width:22px;height:22px;pointer-events:none;transform:translate(-3px,-2px);transition:transform 60ms linear;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}#__cursor.click{animation:__pulse 320ms ease-out}@keyframes __pulse{0%{scale:1}40%{scale:.8}100%{scale:1}}#__ring{position:fixed;z-index:2147483646;width:44px;height:44px;border-radius:50%;border:3px solid #d2452b;pointer-events:none;opacity:0;transform:translate(-50%,-50%)}#__ring.show{animation:__ring 500ms ease-out}@keyframes __ring{0%{opacity:.9;scale:.3}100%{opacity:0;scale:1.4}}`;
  document.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(style);
    const c = document.createElement("div"); c.id = "__cursor";
    c.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2 L20 12 L12.5 13.5 L16.5 21 L14 22 L10 14.5 L4 20 Z" fill="#1f3d2b" stroke="#f5efe3" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    const r = document.createElement("div"); r.id = "__ring"; document.body.append(c, r);
    window.__moveCursor = (x, y) => { c.style.left = x + "px"; c.style.top = y + "px"; r.style.left = x + "px"; r.style.top = y + "px"; };
    window.__clickCursor = () => { c.classList.remove("click"); r.classList.remove("show"); void c.offsetWidth; c.classList.add("click"); r.classList.add("show"); };
  });
});
let cur = { x: 800, y: 450 };
async function glide(x, y, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) { const k = i / steps; const e = 1 - Math.pow(1 - k, 3); const px = cur.x + (x - cur.x) * e; const py = cur.y + (y - cur.y) * e; await page.mouse.move(px, py); await page.evaluate(([a, b]) => window.__moveCursor?.(a, b), [px, py]).catch(() => {}); await sleep(16); }
  cur = { x, y };
}
async function click(locator, { settle = 900 } = {}) {
  await locator.scrollIntoViewIfNeeded(); const box = await locator.boundingBox(); if (!box) throw new Error("no box");
  await glide(box.x + box.width / 2, box.y + box.height / 2); await sleep(250);
  await page.evaluate(() => window.__clickCursor?.()).catch(() => {}); await locator.click(); await sleep(settle);
}
const btn = (name) => page.getByRole("button", { name }).first();

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Quote requests").waitFor();
  await sleep(1500);
  mark("dashboard");
  await click(page.getByRole("link", { name: "Suppliers" }));
  await page.getByText("Supplier book").waitFor();
  mark("suppliers page");
  await sleep(3000);
  const input = page.locator('input[placeholder="paneer, sunflower oil, tomatoes"]');
  await click(input, { settle: 300 });
  await input.fill("");
  await input.pressSequentially("paneer, sunflower oil, tomatoes", { delay: 55 });
  await sleep(1200);
  await click(btn("Find suppliers"));
  mark("firecrawl searching");
  await page.locator(".pill").filter({ hasText: "completed" }).first().waitFor({ timeout: 240_000 });
  mark("candidates ready");
  await sleep(5000);
  const accept = page.getByRole("button", { name: "Accept" }).first();
  if (await accept.isVisible().catch(() => false)) {
    const enabled = await accept.isEnabled();
    if (enabled) { await click(accept); mark("accepted candidate"); await sleep(3000); }
    else { mark("no email on first candidate"); await sleep(2000); }
  }
  await click(page.getByRole("link", { name: "Prices" }));
  await page.getByText("Price watch").waitFor();
  mark("price watch");
  await sleep(4000);
  await page.mouse.wheel(0, 500);
  await sleep(4000);
  mark("end");
} catch (err) {
  console.error("RECORDING FAILED:", err);
  await page.screenshot({ path: `${outDir}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(`${outDir}/marks.json`, JSON.stringify(marks, null, 2));
  await context.close(); await browser.close();
}
