// Records the Sourcer demo on production as a WebM video via Playwright.
// Usage: node record.mjs <outDir> <email> <password> [replyByMinutes]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [outDir = "./out", email, password, replyByMinutesArg = "6"] = process.argv.slice(2);
const BASE = "https://careful-capybara-546.convex.site";
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: outDir, size: { width: 1600, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);

async function clickText(text, exact = false) {
  const loc = exact ? page.getByRole("button", { name: text, exact: true }) : page.getByRole("button", { name: text });
  await loc.first().click();
}

try {
  log("open sign-in");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(1500);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/convex\.site\/?$/, { timeout: 30_000 }).catch(() => {});
  await page.getByText("Quote requests").waitFor();
  await sleep(2500);

  log("new request");
  await page.getByRole("button", { name: "+ New request" }).first().click();
  await page.getByText("What does the kitchen need?").waitFor();
  const note = page.locator("textarea");
  await note.click();
  await note.pressSequentially("20 kg paneer, 10 L sunflower oil, 5 kg tomatoes, and some eggs", { delay: 35 });
  await sleep(600);
  await clickText("Read items");
  await page.getByText("Line items").waitFor({ timeout: 90_000 });
  await sleep(2500);

  log("fix eggs");
  const chips = page.locator(".chip");
  const eggChip = chips.filter({ hasText: "egg" }).first();
  await eggChip.locator("input").fill("5");
  await eggChip.locator("select").selectOption("dozen");
  await sleep(800);

  const replyBy = new Date(Date.now() + Number(replyByMinutesArg) * 60_000);
  const pad = (n) => String(n).padStart(2, "0");
  const local = `${replyBy.getFullYear()}-${pad(replyBy.getMonth() + 1)}-${pad(replyBy.getDate())}T${pad(replyBy.getHours())}:${pad(replyBy.getMinutes())}`;
  await page.locator('input[type="datetime-local"]').fill(local);
  await page.locator('input[type="number"]').last().fill("0.05");
  await sleep(600);
  await clickText("Create request and draft the email");
  await page.getByText("Quote request email").waitFor();

  log("wait for draft");
  await page.getByText("written by OpenAI in your voice").waitFor({ timeout: 120_000 });
  await sleep(2000);
  const body = page.locator("textarea").last();
  await body.click();
  await page.keyboard.press("End");
  await page.keyboard.type("\nP.S. Please quote for weekly standing orders too.", { delay: 25 });
  await sleep(600);
  await clickText("Save edits");
  await sleep(1200);

  log("send");
  await clickText("Send request to");
  await page.getByText("Price comparison").waitFor();
  await page.locator(".pill.sent").first().waitFor({ timeout: 90_000 });
  await sleep(2500);

  log("greenleaf clean reply");
  await clickText("Reply as Greenleaf");
  await page.locator(".quote-card").first().waitFor({ timeout: 180_000 });
  await page.locator(".quote-card .pill.parsed").first().waitFor({ timeout: 180_000 });
  await sleep(4000);
  await page.mouse.wheel(0, 500);
  await sleep(2500);
  await page.mouse.wheel(0, -500);

  log("nandini messy reply");
  await clickText("Reply as Nandini");
  await page.locator(".quote-card").nth(1).waitFor({ timeout: 180_000 });
  await page.locator(".quote-card .pill.parsed").nth(1).waitFor({ timeout: 180_000 });
  await sleep(4000);
  await page.mouse.wheel(0, 600);
  await sleep(3000);

  log("purchase order");
  await clickText("Generate purchase order");
  await page.getByText("ready:").waitFor({ timeout: 30_000 });
  await sleep(2500);
  await clickText("Send purchase order");
  await page.getByText("Sent ").first().waitFor({ timeout: 30_000 });
  await sleep(3000);

  log("orders and prices");
  await page.getByRole("link", { name: "Orders" }).click();
  await page.getByText("Order history").waitFor();
  await sleep(2500);
  await page.getByRole("link", { name: "Prices" }).click();
  await page.getByText("Price watch").waitFor();
  await sleep(1500);
  await page.locator("table.ledger tbody tr").first().click();
  await sleep(3000);
  await page.getByRole("link", { name: "Requests" }).click();
  await page.getByText("Quote requests").waitFor();
  await sleep(2500);
  log("done");
} catch (err) {
  console.error("RECORDING FAILED:", err);
  await page.screenshot({ path: `${outDir}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
