// One complete fresh run on production, recorded with a visible cursor.
// Emits marks.json so the video can be cut to the narration timeline.
// Usage: node record3.mjs <outDir> <email> <password>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [outDir = "./out", email, password] = process.argv.slice(2);
const BASE = "https://careful-capybara-546.convex.site";
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t0 = 0;
const marks = [];
const mark = (label) => { const s = (Date.now() - t0) / 1000; marks.push({ t: s, label }); console.log(s.toFixed(1).padStart(6), label); };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: outDir, size: { width: 1600, height: 900 } } });
const page = await context.newPage();
t0 = Date.now();
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
  await locator.scrollIntoViewIfNeeded(); await sleep(200); const box = await locator.boundingBox(); if (!box) throw new Error("no box");
  await glide(box.x + box.width / 2, box.y + box.height / 2); await sleep(250);
  await page.evaluate(() => window.__clickCursor?.()).catch(() => {}); await locator.click(); await sleep(settle);
}
async function typeSlow(locator, text, delay = 55) { await click(locator, { settle: 300 }); await locator.pressSequentially(text, { delay }); }
async function scrollTo(y, ms = 1200) {
  const start = await page.evaluate(() => window.scrollY); const steps = Math.round(ms / 32);
  for (let i = 1; i <= steps; i++) { const k = i / steps; const e = 1 - Math.pow(1 - k, 3); await page.evaluate((v) => window.scrollTo(0, v), start + (y - start) * e); await sleep(32); }
}
const btn = (name) => page.getByRole("button", { name }).first();
const link = (name) => page.getByRole("link", { name });

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Quote requests").waitFor();
  await sleep(500);
  mark("dashboard");
  await sleep(3500);

  // ---- Firecrawl: discovery ------------------------------------------------
  await click(link("Suppliers"));
  await page.getByText("Supplier book").waitFor();
  mark("suppliers page");
  await sleep(1500);
  const disc = page.locator('input[placeholder="paneer, sunflower oil, tomatoes"]');
  await click(disc, { settle: 300 });
  await disc.fill("");
  await disc.pressSequentially("paneer, sunflower oil, tomatoes", { delay: 55 });
  await sleep(900);
  await click(btn("Find suppliers"));
  mark("firecrawl searching");
  await page.locator(".pill").filter({ hasText: "completed" }).first().waitFor({ timeout: 240_000 });
  mark("candidates ready");
  await sleep(6000);
  const rejectBtn = page.getByRole("button", { name: "Reject" }).first();
  const acceptBtn = page.getByRole("button", { name: "Accept" }).first();
  if (await acceptBtn.isVisible().catch(() => false)) {
    if (await acceptBtn.isEnabled()) { await click(acceptBtn); mark("accepted candidate"); }
    else if (await rejectBtn.isVisible().catch(() => false)) { await sleep(1500); }
  }
  await sleep(1500);

  // ---- Firecrawl: track a price page --------------------------------------
  await scrollTo(420, 1200);
  await sleep(800);
  const trackInput = page.locator('input[placeholder="https://supplier.com/price-list"]').first();
  await click(trackInput, { settle: 300 });
  await trackInput.pressSequentially("https://dir.indiamart.com/impcat/paneer.html", { delay: 30 });
  await sleep(600);
  await click(btn("Track"));
  mark("tracking page");
  await sleep(2500);
  await click(link("Prices"));
  await page.getByText("Price watch").waitFor();
  mark("price watch");
  await page.locator(".pill").filter({ hasText: "priced" }).first().waitFor({ timeout: 240_000 });
  mark("page priced");
  await sleep(1500);
  await scrollTo(700, 1600);
  await sleep(5000);

  // ---- The request ---------------------------------------------------------
  await click(btn("+ New request"));
  await page.getByText("What does the kitchen need?").waitFor();
  mark("new request");
  await sleep(1200);
  await typeSlow(page.locator("textarea"), "20 kg paneer, 10 L sunflower oil, 5 kg tomatoes, and some eggs", 60);
  await sleep(1200);
  await click(btn("Read items"));
  mark("reading items");
  await page.getByText("Line items").waitFor({ timeout: 120_000 });
  mark("line items");
  await sleep(4000);
  const eggChip = page.locator(".chip").filter({ hasText: "egg" }).first();
  await click(eggChip.locator("input"), { settle: 300 });
  await eggChip.locator("input").fill("5");
  await sleep(600);
  await eggChip.locator("select").selectOption("dozen");
  mark("eggs fixed");
  await sleep(2000);
  const replyBy = new Date(Date.now() + 12 * 60_000);
  const pad = (n) => String(n).padStart(2, "0");
  const dt = page.locator('input[type="datetime-local"]');
  await click(dt, { settle: 300 });
  await dt.fill(`${replyBy.getFullYear()}-${pad(replyBy.getMonth() + 1)}-${pad(replyBy.getDate())}T${pad(replyBy.getHours())}:${pad(replyBy.getMinutes())}`);
  await page.locator('input[type="number"]').last().fill("0.05");
  mark("reply-by set");
  await sleep(1500);
  await click(btn("Create request and draft the email"));
  await page.getByText("Quote request email").waitFor();
  mark("request created");
  await page.getByText("written by OpenAI in your voice").waitFor({ timeout: 120_000 });
  mark("draft ready");
  await sleep(3000);
  await scrollTo(260, 1400);
  await sleep(4000);
  await scrollTo(0, 1000);
  await sleep(800);
  await click(btn("Send request to"));
  await page.getByText("Price comparison").waitFor();
  mark("sent");
  await page.locator(".pill.sent").first().waitFor({ timeout: 120_000 });
  mark("sent confirmed");
  await sleep(3000);

  // ---- Replies -------------------------------------------------------------
  await click(btn("Reply as Greenleaf"));
  mark("greenleaf replying");
  await page.locator(".quote-card").first().waitFor({ timeout: 180_000 });
  mark("greenleaf reply landed");
  await page.locator(".quote-card .pill.parsed").first().waitFor({ timeout: 180_000 });
  mark("greenleaf parsed");
  await sleep(2500);
  await scrollTo(520, 1500);
  await sleep(6000);
  await scrollTo(0, 1200);
  await sleep(1200);
  await click(btn("Reply as Nandini"));
  mark("nandini replying");
  await page.locator(".quote-card").nth(1).waitFor({ timeout: 180_000 });
  mark("nandini reply landed");
  await page.locator(".quote-card .pill.parsed").nth(1).waitFor({ timeout: 180_000 });
  mark("nandini parsed");
  await sleep(2500);
  await scrollTo(420, 1500);
  await sleep(5000);
  await scrollTo(1250, 1800);
  mark("ranked cards");
  await sleep(6000);

  // ---- Purchase order ------------------------------------------------------
  const gen = btn("Generate purchase order");
  await gen.scrollIntoViewIfNeeded();
  await sleep(1200);
  mark("purchase order");
  await click(gen);
  await page.getByText("ready:").waitFor({ timeout: 30_000 });
  await sleep(3500);
  await click(btn("Send purchase order"));
  await page.getByText("Sent ").first().waitFor({ timeout: 30_000 });
  mark("po sent");
  await sleep(4000);
  await click(link("Orders"));
  await page.getByText("Order history").waitFor();
  mark("orders");
  await sleep(4000);
  await click(link("Prices"));
  await page.getByText("Price watch").waitFor();
  mark("prices again");
  await sleep(4000);
  await click(link("Requests"));
  await page.getByText("Quote requests").waitFor();
  mark("end");
  await sleep(5000);
} catch (err) {
  console.error("RECORDING FAILED:", err);
  await page.screenshot({ path: `${outDir}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(`${outDir}/marks.json`, JSON.stringify(marks, null, 2));
  await context.close(); await browser.close();
}
