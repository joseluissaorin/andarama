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

// Crear un tour y entrar en el editor
console.log("BOTONES:", (await page.locator("button").allTextContents()).slice(0, 12).join(" | "));
await page.getByRole("button", { name: /tour/i }).first().click();
await page.waitForTimeout(600);
await page.locator('[role="dialog"] input').first().fill("Prueba panel");
await page.getByRole("button", { name: /^crear$|^create$/i }).first().click();
await page.waitForTimeout(2500);
console.log("URL:", page.url());
await page.screenshot({ path: "/tmp/editor-1.png" });
console.log("ERRORES:", errs.slice(0, 3));
await browser.close();
