import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, locale: "es-ES" });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
page.on("response", (r) => { if (r.status() >= 400) errs.push(r.status() + " " + r.url().replace("http://localhost:8788", "").slice(0, 90)); });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text().slice(0, 200)); });
await page.goto("http://localhost:8788/studio/login");
await page.getByLabel(/email/i).fill("ui@ull360.test");
await page.locator('input[type="password"]').first().fill("password-ui-12345");
await page.getByRole("button", { name: /entrar|iniciar|sign in|log in/i }).first().click();
await page.waitForTimeout(1800);
await page.goto("http://localhost:8788/studio/media");
await page.waitForTimeout(2000);

// Hover: el little planet
const card = page.locator(".grid > div").first();
const t0 = Date.now();
await card.hover();
await page.waitForFunction(() => document.querySelectorAll('img[aria-hidden="true"]').length > 0, null, { timeout: 4000 }).catch(() => {});
const ms = Date.now() - t0;
const planet = await page.evaluate(() => {
  const card = document.querySelector(".grid > div");
  const imgs = [...card.querySelectorAll("img")].map((i) => ({ src: (i.getAttribute("src") ?? "").slice(0, 22), op: getComputedStyle(i).opacity }));
  return imgs;
});
console.log(`HOVER: ${ms} ms ->`, JSON.stringify(planet));
await page.screenshot({ path: "/tmp/planet-hover.png" });

// Doble clic: visor 360
await card.dblclick();
await page.waitForTimeout(4000);
const viewer = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const host = d?.querySelector(".ull360-viewer");
  return {
    dialogo: d != null,
    host: host != null,
    hostSize: host != null ? [host.clientWidth, host.clientHeight] : null,
    canvas: d?.querySelectorAll("canvas").length ?? 0,
    innerText: (d?.innerText ?? "").slice(0, 120),
  };
});
console.log("DOBLE CLIC:", JSON.stringify(viewer));
await page.screenshot({ path: "/tmp/pano-dialog.png" });
console.log("ERRORES:", errs.slice(0, 3));
await browser.close();
