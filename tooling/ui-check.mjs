import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, locale: "es-ES" });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

await page.goto("http://localhost:8788/studio/login");
await page.getByLabel(/email/i).fill("ui@ull360.test");
await page.locator('input[type="password"]').first().fill("password-ui-12345");
await page.getByRole("button", { name: /entrar|iniciar|sign in|log in/i }).first().click();
await page.waitForTimeout(2000);

// Biblioteca: subir un panorama equirect sintético (se tesela en el navegador)
await page.goto("http://localhost:8788/studio/media");
await page.waitForTimeout(1200);
await page.evaluate(async () => {
  const W = 4096, H = 2048;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  // Cielo arriba, suelo abajo y una rejilla: así se reconoce el planeta
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#7fb8ff"); g.addColorStop(0.5, "#dfe8f5"); g.addColorStop(1, "#4a3050");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 3;
  for (let i = 0; i <= 12; i++) { ctx.beginPath(); ctx.moveTo((i * W) / 12, 0); ctx.lineTo((i * W) / 12, H); ctx.stroke(); }
  ctx.fillStyle = "#5c068c"; ctx.font = "bold 200px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("FRENTE", W / 2, H / 2);
  const blob = await new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.85));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], "aula-magna.jpg", { type: "image/jpeg" }));
  const input = document.querySelector('input[type="file"]');
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(9000);
await page.reload();
await page.waitForTimeout(2500);
console.log("TARJETAS:", await page.locator(".grid > div").count());
await page.screenshot({ path: "/tmp/media-grid.png" });
console.log("ERRORES:", errs.slice(0, 3));
await browser.close();
