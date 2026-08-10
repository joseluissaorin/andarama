import { chromium } from "@playwright/test";
const b = await chromium.launch();
const page = await (await b.newContext()).newPage();
page.on("pageerror", (e) => console.log("JS:", String(e)));
await page.goto("http://localhost:8123/index.html");
await page.waitForFunction(() => window.listo === true, null, { timeout: 30000 });

// 1. Caso normal (con el recorte de probeImage)
const normal = await page.evaluate(() => window.probar(6720, 3360, false));
console.log("NORMAL:", JSON.stringify({ ...normal, muestras: normal.muestras.slice(0, 3) }));

// 2. Textura que la tarjeta NO puede aceptar: lo que le pasó a las 13 fotos
const forzado = await page.evaluate(() => window.probar(11968, 5984, true));
console.log("FORZADO:", JSON.stringify({ ...forzado, muestras: forzado.muestras.slice(0, 3) }));
await b.close();
