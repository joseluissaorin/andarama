/**
 * Prueba de humo del aviso de anuncio (D3) contra un servidor, por defecto
 * `astro preview` en http://127.0.0.1:4321:
 *  - sin parámetros de anuncio no sale el aviso;
 *  - con gclid y utm sale; mientras no se contesta, los enlaces al Studio
 *    solo llevan las utm;
 *  - con «Sí», llevan gclid, landing_web y consent=1, también en la página
 *    siguiente (sessionStorage);
 *  - con «No», nada de gclid y consent=0.
 *
 *   pnpm --filter @andarama/web preview &
 *   node apps/web/scripts/comprobar-aviso-anuncio.mjs [url-base]
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:4321";
const browser = await chromium.launch();
let fallos = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) fallos++;
};
const enlaceApp = (page) => page.locator('a[href^="https://app.andarama.com/plan"]').first().getAttribute("href");

try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${base}/precios/`);
  ok(!(await page.locator("[data-aviso-anuncio]").isVisible()), "sin anuncio no hay aviso");

  await page.goto(`${base}/en/pricing/?gclid=PRUEBA-123&utm_source=google&utm_medium=cpc&utm_campaign=9&utm_content=77`);
  ok(await page.locator("[data-aviso-anuncio]").isVisible(), "con gclid sale el aviso");
  let href = new URL(await enlaceApp(page));
  ok(href.searchParams.get("utm_source") === "google" && !href.searchParams.has("gclid"), `sin contestar, solo utm (${href.search})`);

  await page.click('[data-decision="si"]');
  ok(!(await page.locator("[data-aviso-anuncio]").isVisible()), "al contestar desaparece");
  href = new URL(await enlaceApp(page));
  ok(
    href.searchParams.get("gclid") === "PRUEBA-123" && href.searchParams.get("consent") === "1" && href.searchParams.get("landing_web") === "/en/pricing/" && href.searchParams.get("plan") === "paseo",
    `con «Sí» lleva gclid, consent=1 y landing_web sin perder ?plan= (${href.search})`,
  );
  await page.goto(`${base}/en/`);
  href = new URL(await enlaceApp(page));
  ok(href.searchParams.get("gclid") === "PRUEBA-123", "en la página siguiente sigue la atribución de la sesión");
  ok(!(await page.locator("[data-aviso-anuncio]").isVisible()), "y no vuelve a preguntar");

  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${base}/precios/?gclid=PRUEBA-456&utm_source=google`);
  await page2.click('[data-decision="no"]');
  href = new URL(await enlaceApp(page2));
  ok(!href.searchParams.has("gclid") && href.searchParams.get("consent") === "0" && href.searchParams.get("utm_source") === "google", `con «No», sin gclid y consent=0 (${href.search})`);
} finally {
  await browser.close();
}
if (fallos > 0) {
  console.log(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo en orden.");
