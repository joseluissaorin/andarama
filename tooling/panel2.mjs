import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, locale: "es-ES" });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
await page.goto("http://localhost:8788/studio/login");
await page.getByLabel(/email/i).fill("ui@ull360.test");
await page.locator('input[type="password"]').first().fill("password-ui-12345");
await page.getByRole("button", { name: /iniciar sesión/i }).first().click();
await page.waitForTimeout(1800);
// Entrar en el primer proyecto (la tarjeta abre el editor)
console.log("TEXTO:", (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n+/g, " | "));
await page.goto("http://localhost:8788/studio/p/2DpaO4CJ1JRhFzpfStdt2");
await page.waitForTimeout(3000);
console.log("URL:", page.url());

// Crear una escena para que haya panel de propiedades
const addScene = page.locator('button[aria-label*="scena"], button[aria-label*="Añadir escena"]').first();
if (await addScene.count() > 0) {
  await addScene.click();
  await page.waitForTimeout(500);
  await page.locator('[role="dialog"] input').first().fill("Sala uno");
  await page.getByRole("button", { name: /^crear$/i }).first().click();
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: "/tmp/editor-panel.png" });

// Abrir la paleta de hotspots
const addHs = page.getByRole("button", { name: /añadir hotspot/i }).first();
console.log("BOTON PALETA:", await addHs.count());
if (await addHs.count() > 0) {
  await addHs.click();
  await page.waitForTimeout(700);
  await page.locator('[role="dialog"] input').first().fill("puerta");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/palette.png" });
  const opciones = await page.locator('[role="dialog"] button').allTextContents();
  console.log("RESULTADOS:", opciones.filter((x) => x.trim() !== "").slice(0, 4));
}
console.log("ERRORES:", errs.slice(0, 3));
await browser.close();
