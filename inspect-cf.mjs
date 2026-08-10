import { chromium } from "@playwright/test";
const BASE = "https://ull360.jlsf2005.workers.dev";
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1500, height: 950 }, locale: "es-ES" })).newPage();
await page.goto(`${BASE}/studio/login`);
await page.waitForSelector("#email");
await page.waitForTimeout(1500);
await page.fill("#email", "admin@ull360.dev");
await page.fill("#password", "Ull360-cloud-demo-2026");
await page.click('button[type="submit"]');
await page.waitForSelector('nav[aria-label="Principal"]', { timeout: 40000 });

const info = await page.evaluate(async () => {
  const me = await (await fetch("/api/v1/me")).json();
  const out = { usuario: me.user.email, orgs: me.orgs.map((o) => ({ id: o.id, name: o.name })), proyectos: [], medios: [] };
  for (const org of me.orgs) {
    const ps = await (await fetch(`/api/v1/projects?org=${org.id}`)).json();
    out.proyectos.push(...ps.map((p) => ({ org: org.name, id: p.id, title: p.title })));
    const ms = await (await fetch(`/api/v1/media?org=${org.id}`)).json();
    out.medios.push(
      ...ms.map((m) => ({
        org: org.name,
        id: m.id,
        filename: m.filename,
        kind: m.kind,
        status: m.status,
        w: m.width,
        h: m.height,
        bytes: m.bytes,
        derivados: (m.derivatives ?? []).map((d) => d.kind),
      })),
    );
  }
  return out;
});
console.log("USUARIO:", info.usuario);
console.log("ORGS:", JSON.stringify(info.orgs));
console.log("PROYECTOS:", JSON.stringify(info.proyectos, null, 1));
console.log("MEDIOS:", info.medios.length);
for (const m of info.medios) console.log("  ", JSON.stringify(m));
await b.close();
