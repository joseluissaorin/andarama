import { chromium } from "@playwright/test";
const BASE = "http://localhost:8802";
const EMAIL = `repro-${Date.now()}@pwa.test`;
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1500, height: 950 }, locale: "es-ES" })).newPage();
const fallos = [];
page.on("response", (r) => { if (r.status() >= 400) fallos.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
page.on("pageerror", (e) => fallos.push("JS: " + String(e)));

await page.goto(`${BASE}/studio/register`);
await page.waitForSelector("#email"); await page.waitForTimeout(1200);
await page.fill("#name", "Repro"); await page.fill("#email", EMAIL); await page.fill("#password", "password-larga-1");
await page.click('button[type="submit"]');
await page.waitForSelector('nav[aria-label="Principal"]', { timeout: 40000 });

await page.goto(`${BASE}/studio/media`);
await page.waitForSelector('input[type="file"]', { state: "attached" });
const marca = String(Date.now());
await page.evaluate(async (marca) => {
  const W = 6720, H = 3360;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  // Damero para ver de un vistazo si el visor pinta algo
  for (let i = 0; i < 24; i++) for (let j = 0; j < 12; j++) {
    x.fillStyle = (i + j) % 2 ? "#1f3a5f" : "#e8d9b0";
    x.fillRect((i * W) / 24, (j * H) / 12, W / 24, H / 12);
  }
  x.fillStyle = "#c0392b"; x.font = "bold 300px sans-serif"; x.textAlign = "center";
  x.fillText("FRENTE", W / 2, H / 2);
  const blob = await new Promise((r) => c.toBlob((z) => r(z), "image/jpeg", 0.9));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], `casa-${marca}.jpg`, { type: "image/jpeg" }));
  const input = document.querySelector('input[type="file"]');
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, marca);

// Sondeo desde Node: waitForFunction con predicado asíncrono resuelve al
// instante porque una promesa siempre es «verdadera».
let media = null;
for (let i = 0; i < 400 && media == null; i++) {
  media = await page.evaluate(async (marca) => {
    const me = await (await fetch("/api/v1/me")).json();
    const items = await (await fetch(`/api/v1/media?org=${me.orgs[0].id}`)).json();
    const p = items.find((m) => m.filename === `casa-${marca}.jpg`);
    if (p == null || p.status !== "ready" || !p.derivatives.some((d) => d.kind === "tiles")) return null;
    return { id: p.id, kind: p.kind, w: p.width, h: p.height, manifest: p.derivatives.find((d) => d.kind === "tiles").manifest };
  }, marca);
  if (media == null) await page.waitForTimeout(300);
}
if (media == null) { console.log("EL MEDIO NO LLEGÓ A ESTAR LISTO"); process.exit(1); }
const { preview, ...manifiesto } = media.manifest;
console.log("MEDIO:", media.id, media.kind, `${media.w}x${media.h}`);
console.log("MANIFIESTO:", JSON.stringify(manifiesto), "· previsualización:", preview == null ? "NO" : `${Math.round(preview.length / 1024)} kB`);

// ¿Existen de verdad las teselas en el almacenamiento?
const sondas = await page.evaluate(async (id) => {
  const out = {};
  for (const p of ["0/f/0/0", "1/f/0/0", "1/f/1/1", "0/u/0/0", "0/d/0/0"]) {
    const r = await fetch(`/api/v1/media/${id}/tiles/${p}.webp`);
    out[p] = r.status;
  }
  return out;
}, media.id);
console.log("TESELAS:", JSON.stringify(sondas));

// Escena con esa foto y vista previa del editor
const projectId = await page.evaluate(async (mediaId) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("u3c="))?.slice(4) ?? "";
  const h = { "content-type": "application/json", "x-csrf-token": csrf };
  const me = await (await fetch("/api/v1/me")).json();
  const p = await (await fetch("/api/v1/projects", { method: "POST", headers: h, body: JSON.stringify({ orgId: me.orgs[0].id, title: "Casa prefabricada" }) })).json();
  await fetch(`/api/v1/projects/${p.id}/scenes`, { method: "POST", headers: h, body: JSON.stringify({ title: "Salón", mediaId }) });
  return p.id;
}, media.id);

const peticiones = [];
page.on("request", (r) => { if (r.url().includes("/tiles/")) peticiones.push(r.url().replace(BASE, "")); });
await page.goto(`${BASE}/studio/p/${projectId}`);
await page.waitForSelector(".ull360-viewer canvas", { timeout: 40000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: "/tmp/repro-editor.png" });
console.log("PETICIONES DE TESELA:", peticiones.length, peticiones.slice(0, 4));
console.log("FALLOS:", [...new Set(fallos)].slice(0, 10));
await b.close();
