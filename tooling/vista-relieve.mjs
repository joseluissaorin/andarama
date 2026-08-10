/**
 * Comprobación visual del lenguaje de relieve: entra al Studio local, recorre
 * los tableros y el editor, y deja capturas en /tmp/relieve.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const EMAIL = process.env.EMAIL ?? "e2e@andarama.test";
const PASSWORD = process.env.PASSWORD ?? "password-e2e-123";
const PREFIJO = process.env.PREFIJO ?? "/studio";
const OUT = process.env.OUT ?? "/tmp/relieve";
mkdirSync(OUT, { recursive: true });

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-ES" });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("[consola]", m.text());
});

async function entrar() {
  await page.goto(`${BASE}${PREFIJO}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((u) => /\/(studio\/)?$/.test(new URL(u).pathname), { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

if (!(await entrar())) {
  await page.goto(`${BASE}${PREFIJO}/register`);
  await page.fill("#name", "Usuario relieve");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => /\/(studio\/)?$/.test(new URL(u).pathname), { timeout: 15000 });
}

await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/1-proyectos.png` });

// Un proyecto para poder abrir el editor
const proyectos = await page.evaluate(async () => {
  const me = await (await fetch("/api/v1/me", { credentials: "include" })).json();
  const org = me.orgs?.[0]?.id;
  if (org == null) return [];
  const r = await fetch(`/api/v1/projects?org=${org}`, { credentials: "include" });
  return r.ok ? await r.json() : [];
});
let projectId = proyectos[0]?.id ?? null;
if (projectId == null) {
  await page.getByRole("button", { name: /Nuevo tour|New tour/i }).first().click();
  await page.fill("#np-title", "Tour de relieve");
  await page.getByRole("button", { name: /Crear|Create|Guardar|Save/i }).last().click();
  await page.waitForURL(/\/p\//, { timeout: 15000 });
  projectId = page.url().split("/p/")[1].split(/[?#]/)[0];
}
console.log("proyecto:", projectId);

await page.goto(`${BASE}${PREFIJO}/media`);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/2-medios.png` });

await page.goto(`${BASE}${PREFIJO}/account`);
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/3-cuenta.png` });

await page.goto(`${BASE}${PREFIJO}/org`);
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/4-organizacion.png` });

if (projectId != null) {
  await page.goto(`${BASE}${PREFIJO}/p/${projectId}`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/5-editor-escenas.png` });
  // El cameo no espera dos minutos: se fuerza para ver que camina
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.className = "anda-cameo";
    d.style.setProperty("--anda-cameo-dur", "4s");
    d.innerHTML = '<span style="display:block"><img src="" width="44" height="44" class="anda-brinca"></span>';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(1500);
  const x = await page.evaluate(() => {
    const el = document.querySelector(".anda-cameo");
    return el == null ? null : el.getBoundingClientRect().x;
  });
  console.log("cameo x tras 1,5 s:", x);
  await page.evaluate(() => document.querySelector(".anda-cameo")?.remove());

  const pestGrafo = page.getByRole("button", { name: /Grafo|Mapa del tour/i }).first();
  if ((await pestGrafo.count()) > 0) {
    await pestGrafo.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/6-editor-grafo.png` });
  }
  const pestAjustes = page.getByRole("button", { name: /^Ajustes$/i }).first();
  if ((await pestAjustes.count()) > 0) {
    await pestAjustes.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/7-editor-ajustes.png` });
  }
}


// --- Una escena de verdad: panel de propiedades y paleta de hotspots ---
await page.goto(`${BASE}${PREFIJO}/media`);
await page.waitForSelector('input[type="file"]', { state: "attached" });
const yaHayPano = await page.getByText("pano-relieve.jpg").count();
if (yaHayPano === 0) {
  await page.evaluate(async () => {
    const W = 3000, H = 1500;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "hsl(35, 80%, 70%)");
    grad.addColorStop(1, "hsl(20, 45%, 28%)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff8ec";
    ctx.font = "bold 140px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("relieve", W / 2, H / 2);
    const blob = await new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.85));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "pano-relieve.jpg", { type: "image/jpeg" }));
    const input = document.querySelector('input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(6000);
}

await page.goto(`${BASE}${PREFIJO}/p/${projectId}`);
await page.waitForTimeout(2500);
if ((await page.locator('button[aria-label="Añadir escena"]').count()) > 0) {
  const hayEscena = await page.locator(".anda-ficha").count();
  if (hayEscena === 0) {
    await page.locator('button[aria-label="Añadir escena"]').click();
    await page.fill("#ns-title", "Escena de relieve");
    const dlg = page.locator('[role="dialog"]', { hasText: "Añadir escena" });
    await dlg.getByRole("button", { name: "Elegir de la biblioteca" }).click();
    const picker = page.locator('[role="dialog"]', { hasText: "Elegir de la biblioteca" }).last();
    await picker.getByRole("button", { name: /pano-relieve\.jpg/ }).click();
    await dlg.getByRole("button", { name: "Crear", exact: true }).click();
    await page.waitForTimeout(6000);
  }
}
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/8-editor-escena.png` });
const panel = page.locator("aside").last();
if ((await panel.count()) > 0) await panel.screenshot({ path: `${OUT}/10-propiedades.png` });

const botonPaleta = page.getByRole("button", { name: /añadir hotspot/i }).first();
if ((await botonPaleta.count()) > 0) {
  await botonPaleta.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/9-paleta.png` });
  await page.keyboard.press("Escape");
}

await navegador.close();
console.log("capturas en", OUT);
