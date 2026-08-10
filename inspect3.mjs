import { chromium } from "@playwright/test";
const BASE = "https://ull360.jlsf2005.workers.dev";
const PROY = "g2F8wtpQ1GC1yq7evZonI";
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1500, height: 950 }, locale: "es-ES" })).newPage();
const fallos = [];
const teselas = [];
page.on("response", (r) => {
  const u = r.url().replace(BASE, "");
  if (u.includes("/tiles/")) teselas.push(`${r.status()} ${u}`);
  if (r.status() >= 400 && !u.includes("oidc")) fallos.push(`${r.status()} ${u}`);
});
page.on("console", (m) => { if (m.type() === "error") fallos.push("CONSOLE: " + m.text()); });
page.on("pageerror", (e) => fallos.push("JS: " + String(e)));

await page.goto(`${BASE}/studio/login`);
await page.waitForSelector("#email"); await page.waitForTimeout(1500);
await page.fill("#email", "admin@ull360.dev"); await page.fill("#password", "Ull360-cloud-demo-2026");
await page.click('button[type="submit"]');
await page.waitForSelector('nav[aria-label="Principal"]', { timeout: 40000 });

await page.goto(`${BASE}/studio/p/${PROY}`);
await page.waitForSelector(".ull360-viewer", { timeout: 40000 });
await page.waitForTimeout(9000);
await page.screenshot({ path: "/tmp/casa-editor.png" });

const estado = await page.evaluate(() => {
  const el = document.querySelector(".ull360-viewer");
  const canvas = el?.querySelector("canvas");
  let pintado = null;
  if (canvas != null) {
    const c = document.createElement("canvas");
    c.width = 40; c.height = 24;
    const x = c.getContext("2d");
    try {
      x.drawImage(canvas, 0, 0, 40, 24);
      const d = x.getImageData(0, 0, 40, 24).data;
      const colores = new Set();
      for (let i = 0; i < d.length; i += 4) colores.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      pintado = { colores: colores.size, muestra: [...colores].slice(0, 4) };
    } catch (e) { pintado = { error: String(e) }; }
  }
  return { hayCanvas: canvas != null, tam: canvas != null ? `${canvas.width}x${canvas.height}` : null, pintado, texto: el?.innerText?.slice(0, 200) };
});
console.log("VISOR:", JSON.stringify(estado));
console.log("TESELAS PEDIDAS:", teselas.length);
console.log(teselas.slice(0, 8).join("\n"));
console.log("FALLOS:", [...new Set(fallos)].slice(0, 12).join("\n"));
await b.close();
