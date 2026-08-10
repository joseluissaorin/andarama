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
  const me = await (await fetch("/api/v1/me")).json();
  const org = me.orgs[0].id;
  const ms = await (await fetch(`/api/v1/media?org=${org}`)).json();
  const casa = ms.find((m) => m.filename.startsWith("Foto 12-7-26"));
  const buena = ms.find((m) => m.filename === "aula-magna.jpg");
  const manifiesto = (m) => {
    const d = (m.derivatives ?? []).find((x) => x.kind === "tiles");
    if (d == null) return null;
    const { preview, ...resto } = d.manifest ?? {};
    return { ...resto, preview: preview == null ? null : `${Math.round(preview.length / 1024)} kB` };
  };
  const sondear = async (m) => {
    const ext = manifiesto(m)?.extension ?? "webp";
    const out = {};
    for (const p of ["0/f/0/0", "1/f/0/0", "2/f/0/0", "1/f/1/1", "0/u/0/0"]) {
      const res = await fetch(`/api/v1/media/${m.id}/tiles/${p}.${ext}`);
      out[p] = res.status + (res.ok ? ` (${res.headers.get("content-type")})` : "");
    }
    return out;
  };
  // Escenas del proyecto de la casa
  const proyectos = await (await fetch(`/api/v1/projects?org=${org}`)).json();
  const casaProy = proyectos.find((p) => p.title === "Casa prefabricada");
  const contenido = await (await fetch(`/api/v1/projects/${casaProy.id}/scenes`)).json();
  return {
    casa: { id: casa.id, file: casa.filename, manifiesto: manifiesto(casa), teselas: await sondear(casa) },
    buena: { id: buena.id, file: buena.filename, manifiesto: manifiesto(buena), teselas: await sondear(buena) },
    proyecto: casaProy.id,
    escenas: contenido.scenes.map((s) => ({ t: s.title, mediaId: s.mediaId, source: s.sourceJson })),
  };
});
console.log("CASA:", JSON.stringify(r.casa, null, 1));
console.log("REFERENCIA QUE SÍ FUNCIONA:", JSON.stringify(r.buena, null, 1));
console.log("PROYECTO:", r.proyecto);
console.log("ESCENAS:", JSON.stringify(r.escenas, null, 1).slice(0, 1500));
await b.close();
