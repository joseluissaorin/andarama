import { chromium } from "@playwright/test";
const BASE = "https://ull360.jlsf2005.workers.dev";
const b = await chromium.launch();
const page = await (await b.newContext({ locale: "es-ES" })).newPage();
await page.goto(`${BASE}/studio/login`);
await page.waitForSelector("#email"); await page.waitForTimeout(1500);
await page.fill("#email", "admin@ull360.dev"); await page.fill("#password", "Ull360-cloud-demo-2026");
await page.click('button[type="submit"]');
await page.waitForSelector('nav[aria-label="Principal"]', { timeout: 40000 });

const r = await page.evaluate(async () => {
  const mirar = async (id, ruta) => {
    const res = await fetch(`/api/v1/media/${id}/tiles/${ruta}`);
    if (!res.ok) return { ruta, status: res.status };
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob).catch((e) => null);
    if (bmp == null) return { ruta, kb: Math.round(blob.size / 1024), decodifica: false };
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext("2d");
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data;
    const colores = new Set();
    let opacos = 0;
    for (let i = 0; i < d.length; i += 4) {
      colores.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      if (d[i + 3] > 8) opacos++;
    }
    bmp.close();
    return { ruta, kb: Math.round(blob.size / 1024), tam: `${bmp.width}x${bmp.height}`, colores: colores.size, muestra: [...colores].slice(0, 3), opacosPct: Math.round((opacos / (d.length / 4)) * 100) };
  };
  const casa = "woWdzGZtsvB23tyK0N8gp"; // 11968x5984
  const grande = "ndYaTh6aCp35awytgaCfW"; // 13876x6938
  const media = "F71PkAZq7mF4LU26OJEYI"; // 10000x5000
  const buena = "zSi2xutxtLUtLawVji9wS"; // 4096x2048
  return {
    casa11968: [await mirar(casa, "0/f/0/0.webp"), await mirar(casa, "2/f/1/1.webp")],
    duisburg13876: [await mirar(grande, "0/f/0/0.webp")],
    sandiego10000: [await mirar(media, "0/f/0/0.webp")],
    aula4096: [await mirar(buena, "0/f/0/0.webp")],
    maxTex: (() => { const c = document.createElement("canvas"); const g = c.getContext("webgl"); return g?.getParameter(g.MAX_TEXTURE_SIZE); })(),
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
