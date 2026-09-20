// Responsive smoke test against a deployed Sourcer.
// Signs in, visits every page at phone, tablet and desktop widths, and fails
// if any page scrolls horizontally, any element overflows the viewport, or the
// browser logs an error.
//
//   SOURCER_URL=https://careful-capybara-546.convex.site \
//   SOURCER_EMAIL=... SOURCER_PASSWORD=... npm run test:e2e
import { chromium } from "playwright";

const BASE = process.env.SOURCER_URL ?? "https://careful-capybara-546.convex.site";
const EMAIL = process.env.SOURCER_EMAIL ?? "judge@sourcer.demo";
const PASSWORD = process.env.SOURCER_PASSWORD ?? "SourcerJudge2026";
const SIZES = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const size of SIZES) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Quote requests").waitFor({ timeout: 30_000 });

    // The newest request, if any, so the board page is covered too.
    const firstRow = page.locator("table.ledger tbody tr").first();
    await firstRow.waitFor({ timeout: 8_000 }).catch(() => {});
    const rfqPath = (await firstRow.count())
      ? await firstRow.evaluate(async (el) => { el.click(); await new Promise((r) => setTimeout(r, 800)); return location.pathname; })
      : null;
    const pages = ["/", "/suppliers", "/prices", "/history", "/inbox", "/rfqs/new", ...(rfqPath?.startsWith("/rfqs/") ? [rfqPath] : [])];

    for (const path of pages) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const report = await page.evaluate(() => {
        const vw = window.innerWidth;
        const overflowing = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0) return false;
            // Tables are allowed to scroll inside their own container.
            if (el.closest("table")) return false;
            return r.right > vw + 1 || r.left < -1;
          })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(el.getBoundingClientRect().right)}`);
        return { scrollWidth: document.documentElement.scrollWidth, vw, overflowing };
      });
      const problems = [];
      if (report.scrollWidth > report.vw + 1) problems.push(`page scrolls horizontally (${report.scrollWidth} > ${report.vw})`);
      if (report.overflowing.length) problems.push(`overflow: ${report.overflowing.join("; ")}`);
      if (consoleErrors.length) problems.push(`console: ${consoleErrors.splice(0).join(" | ").slice(0, 300)}`);
      const status = problems.length ? "FAIL" : "ok";
      console.log(`${status.padEnd(4)} ${size.name.padEnd(7)} ${path}${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
      if (problems.length) failures.push({ size: size.name, path, problems });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`\n${failures.length} responsive check(s) failed`);
  process.exit(1);
}
console.log("\nAll pages fit every viewport with no console errors.");
