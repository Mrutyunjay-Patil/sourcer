// Slow, narrated-pace recording of the Sourcer walkthrough on production.
// A visible cursor is drawn on the page so viewers can follow every click.
// Usage: node record2.mjs <outDir> <email> <password>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [outDir = "./out", email, password] = process.argv.slice(2);
const BASE = "https://careful-capybara-546.convex.site";
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const marks = [];
const mark = (label) => {
  const s = (Date.now() - t0) / 1000;
  marks.push({ t: s, label });
  console.log(s.toFixed(1).padStart(6), label);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: outDir, size: { width: 1600, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(90_000);

// Fake cursor that follows Playwright's mouse so clicks are visible.
await context.addInitScript(() => {
  const style = document.createElement("style");
  style.textContent = `
    #__cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; pointer-events: none;
      transform: translate(-3px,-2px); transition: transform 60ms linear; filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
    #__cursor.click { animation: __pulse 320ms ease-out; }
    @keyframes __pulse { 0% { scale: 1; } 40% { scale: .8; } 100% { scale: 1; } }
    #__ring { position: fixed; z-index: 2147483646; width: 44px; height: 44px; border-radius: 50%; border: 3px solid #d2452b;
      pointer-events: none; opacity: 0; transform: translate(-50%,-50%); }
    #__ring.show { animation: __ring 500ms ease-out; }
    @keyframes __ring { 0% { opacity: .9; scale: .3; } 100% { opacity: 0; scale: 1.4; } }`;
  document.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(style);
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2 L20 12 L12.5 13.5 L16.5 21 L14 22 L10 14.5 L4 20 Z" fill="#1f3d2b" stroke="#f5efe3" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    const r = document.createElement("div");
    r.id = "__ring";
    document.body.append(c, r);
    window.__moveCursor = (x, y) => { c.style.left = x + "px"; c.style.top = y + "px"; r.style.left = x + "px"; r.style.top = y + "px"; };
    window.__clickCursor = () => { c.classList.remove("click"); r.classList.remove("show"); void c.offsetWidth; c.classList.add("click"); r.classList.add("show"); };
  });
});

let cur = { x: 800, y: 450 };
async function glide(x, y, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = 1 - Math.pow(1 - k, 3);
    const px = cur.x + (x - cur.x) * e;
    const py = cur.y + (y - cur.y) * e;
    await page.mouse.move(px, py);
    await page.evaluate(([a, b]) => window.__moveCursor?.(a, b), [px, py]).catch(() => {});
    await sleep(16);
  }
  cur = { x, y };
}
async function click(locator, { settle = 900 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box for locator");
  await glide(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(250);
  await page.evaluate(() => window.__clickCursor?.()).catch(() => {});
  await locator.click();
  await sleep(settle);
}
async function typeSlow(locator, text, delay = 55) {
  await click(locator, { settle: 300 });
  await locator.pressSequentially(text, { delay });
}
async function scrollTo(y, ms = 1200) {
  const start = await page.evaluate(() => window.scrollY);
  const steps = Math.round(ms / 32);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = 1 - Math.pow(1 - k, 3);
    await page.evaluate((v) => window.scrollTo(0, v), start + (y - start) * e);
    await sleep(32);
  }
}
const btn = (name) => page.getByRole("button", { name }).first();

try {
  mark("sign-in screen");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(2500);
  await typeSlow(page.getByLabel("Email"), email, 40);
  await typeSlow(page.getByLabel("Password"), password, 25);
  await click(btn("Sign in"));
  await page.getByText("Quote requests").waitFor();
  mark("dashboard");
  await sleep(3500);

  await click(btn("+ New request"));
  await page.getByText("What does the kitchen need?").waitFor();
  mark("new request");
  await sleep(2000);
  await typeSlow(page.locator("textarea"), "20 kg paneer, 10 L sunflower oil, 5 kg tomatoes, and some eggs", 60);
  await sleep(1500);
  await click(btn("Read items"));
  await page.getByText("Line items").waitFor({ timeout: 120_000 });
  mark("line items");
  await sleep(4000);

  const eggChip = page.locator(".chip").filter({ hasText: "egg" }).first();
  await click(eggChip.locator("input"), { settle: 300 });
  await eggChip.locator("input").fill("5");
  await sleep(700);
  await eggChip.locator("select").selectOption("dozen");
  mark("eggs fixed");
  await sleep(2500);

  const replyBy = new Date(Date.now() + 9 * 60_000);
  const pad = (n) => String(n).padStart(2, "0");
  await page.locator('input[type="datetime-local"]').fill(
    `${replyBy.getFullYear()}-${pad(replyBy.getMonth() + 1)}-${pad(replyBy.getDate())}T${pad(replyBy.getHours())}:${pad(replyBy.getMinutes())}`,
  );
  await page.locator('input[type="number"]').last().fill("0.05");
  await sleep(1200);
  await click(btn("Create request and draft the email"));
  await page.getByText("Quote request email").waitFor();
  mark("request created, drafting");
  await page.getByText("written by OpenAI in your voice").waitFor({ timeout: 120_000 });
  mark("draft ready");
  await sleep(4500);
  await scrollTo(260);
  await sleep(3000);
  await scrollTo(0);
  await sleep(1000);

  await click(btn("Send request to"));
  await page.getByText("Price comparison").waitFor();
  mark("sent");
  await page.locator(".pill.sent").first().waitFor({ timeout: 120_000 });
  await sleep(4000);

  await click(btn("Reply as Greenleaf"));
  mark("greenleaf replying");
  await page.locator(".quote-card").first().waitFor({ timeout: 180_000 });
  mark("greenleaf reply landed");
  await page.locator(".quote-card .pill.parsed").first().waitFor({ timeout: 180_000 });
  mark("greenleaf parsed");
  await sleep(3000);
  await scrollTo(520, 1500);
  await sleep(6000);
  await scrollTo(0, 1200);
  await sleep(1500);

  await click(btn("Reply as Nandini"));
  mark("nandini replying");
  await page.locator(".quote-card").nth(1).waitFor({ timeout: 180_000 });
  mark("nandini reply landed");
  await page.locator(".quote-card .pill.parsed").nth(1).waitFor({ timeout: 180_000 });
  mark("nandini parsed");
  await sleep(3500);
  await scrollTo(420, 1500);
  await sleep(6000);
  await scrollTo(1250, 1800);
  mark("ranked cards");
  await sleep(6000);

  const gen = btn("Generate purchase order");
  await gen.scrollIntoViewIfNeeded();
  await sleep(1500);
  mark("purchase order");
  await click(gen);
  await page.getByText("ready:").waitFor({ timeout: 30_000 });
  await sleep(4000);
  await click(btn("Send purchase order"));
  await page.getByText("Sent ").first().waitFor({ timeout: 30_000 });
  mark("po sent");
  await sleep(4500);

  await click(page.getByRole("link", { name: "Orders" }));
  await page.getByText("Order history").waitFor();
  mark("orders");
  await sleep(4000);
  await click(page.getByRole("link", { name: "Prices" }));
  await page.getByText("Price watch").waitFor();
  mark("prices");
  await sleep(2000);
  await click(page.locator("table.ledger tbody tr").first());
  await sleep(5000);
  await click(page.getByRole("link", { name: "Requests" }));
  await page.getByText("Quote requests").waitFor();
  mark("end");
  await sleep(4000);
} catch (err) {
  console.error("RECORDING FAILED:", err);
  await page.screenshot({ path: `${outDir}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(`${outDir}/marks.json`, JSON.stringify(marks, null, 2));
  await context.close();
  await browser.close();
}
