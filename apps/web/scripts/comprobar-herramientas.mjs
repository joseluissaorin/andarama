/**
 * Prueba de humo de las tres herramientas gratuitas contra un servidor
 * (por defecto `astro preview` en http://127.0.0.1:4321): abre cada página en
 * Chromium, le da un equirectangular sintético y comprueba que el visor se
 * monta, que el planeta se dibuja y que salen las seis caras del cubo.
 *
 *   pnpm --filter @andarama/web preview &
 *   node apps/web/scripts/comprobar-herramientas.mjs [url-base]
 */
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:4321";
const dir = await mkdtemp(join(tmpdir(), "anda-herr-"));

// Un equirect 2048×1024 con un degradado y una banda: basta para ver que algo se pinta
const w = 2048;
const h = 1024;
const buf = Buffer.alloc(w * h * 3);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    buf[i] = Math.round((x / w) * 255);
    buf[i + 1] = Math.round((y / h) * 255);
    buf[i + 2] = y > h / 2 - 20 && y < h / 2 + 20 ? 255 : 60;
  }
}
const equi = join(dir, "equi.jpg");
await writeFile(equi, await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errores = [];
page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errores.push(`console: ${m.text()}`);
});
const resultados = {};

// 1. Visor 360
await page.goto(`${base}/herramientas/visor-360-online/`, { waitUntil: "networkidle" });
await page.setInputFiles("#visor-fichero", equi);
await page.waitForSelector(".visor360.es-visible canvas", { timeout: 30_000 });
resultados.visor = (await page.locator(".visor360 canvas").count()) > 0;

// 2. Pequeño planeta
await page.goto(`${base}/herramientas/pequeno-planeta/`, { waitUntil: "networkidle" });
await page.setInputFiles("#planeta-fichero", equi);
await page.waitForSelector(".lienzo.es-visible canvas", { timeout: 30_000 });
resultados.planeta = await page.evaluate(() => {
  const c = document.querySelector(".lienzo canvas");
  const ctx = c.getContext("2d");
  const centro = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
  const esquina = ctx.getImageData(2, 2, 1, 1).data;
  // El centro del disco tiene color (nadir) y la esquina es transparente
  return centro[3] === 255 && esquina[3] === 0;
});

// 3. Cubemap
await page.goto(`${base}/herramientas/equirectangular-a-cubemap/`, { waitUntil: "networkidle" });
await page.setInputFiles("#cubemap-fichero", equi);
await page.waitForFunction(() => document.querySelectorAll(".caras.es-visible figure canvas").length === 6, null, { timeout: 60_000 });
await page.waitForFunction(() => !document.querySelector("[data-zip]").disabled, null, { timeout: 60_000 });
resultados.cubemap = await page.evaluate(() => {
  const caras = Array.from(document.querySelectorAll("[data-panel=cubo] .caras figure canvas"));
  // La cara «u» (cielo) debe ser verde oscuro (y=0 arriba) y la «d» clara
  const media = (c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let g = 0;
    for (let i = 1; i < d.length; i += 4) g += d[i];
    return g / (d.length / 4);
  };
  const u = media(caras[4]);
  const d = media(caras[5]);
  return caras.length === 6 && u < 60 && d > 190;
});
const descarga = page.waitForEvent("download", { timeout: 30_000 });
await page.click("[data-zip]");
const zip = await descarga;
resultados.zip = (zip.suggestedFilename() ?? "").endsWith(".zip");

await browser.close();
console.log(JSON.stringify({ resultados, errores }, null, 2));
if (Object.values(resultados).some((v) => v !== true) || errores.length > 0) process.exit(1);
