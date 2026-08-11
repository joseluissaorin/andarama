/**
 * Capturas del README.
 *
 * Recorre una instancia real (la de referencia o la propia) y guarda las
 * pantallas que enseña la portada del repositorio. Se generan con el mismo
 * criterio que el resto de la marca: papel, nada de cromo del sistema y el
 * tour de demostración con fotos de verdad.
 *
 *   BASE=https://app.andarama.com TOUR=https://andarama.com/t/recorrido-real \
 *   PROYECTO="Recorrido real" EMAIL=... PASSWORD=... node tooling/marca/capturas.mjs
 *
 * Con la instancia local: BASE=http://localhost:5173/studio (Vite) o el puerto
 * del self-host. Las credenciales nunca se guardan aquí.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const salida = resolve(raiz, ".github/assets");
mkdirSync(salida, { recursive: true });

const BASE = (process.env.BASE ?? "https://app.andarama.com").replace(/\/$/, "");
const TOUR = process.env.TOUR ?? "https://andarama.com/t/campus-de-guajara";
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const navegador = await chromium.launch();
// Sin retina: una captura de 1440 px se ve nítida en el README y pesa la
// cuarta parte, que también es una forma de respetar a quien clona.
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-ES" });
const page = await ctx.newPage();

async function esperar(ms) {
  await page.waitForTimeout(ms);
}

if (EMAIL != null && PASSWORD != null) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await esperar(3500);
  // Se recorta el pie de la barra lateral: ahí va el correo de quien entra
  await page.screenshot({
    path: resolve(salida, "studio-proyectos.png"),
    clip: { x: 0, y: 0, width: 1440, height: 790 },
  });
  console.log("studio-proyectos.png");

  // El editor del primer tour con escenas
  const proyectos = await page.evaluate(async () => {
    const me = await (await fetch("/api/v1/me", { credentials: "include" })).json();
    const r = await fetch(`/api/v1/projects?org=${me.orgs[0].id}`, { credentials: "include" });
    return r.ok ? await r.json() : [];
  });
  const buscado = process.env.PROYECTO;
  const elegido =
    (buscado != null ? proyectos.find((p) => p.title.toLowerCase().includes(buscado.toLowerCase())) : null) ??
    proyectos.find((p) => p.status === "published") ??
    proyectos[0];
  if (elegido != null) {
    await page.goto(`${BASE}/p/${elegido.id}`);
    await page.waitForSelector(".anda-viewer canvas", { timeout: 60_000 });
    await esperar(9000);
    // El muelle de medios plegado: en la portada interesa el panorama
    const plegar = page.locator('section button[aria-label="Cerrar"]').last();
    if ((await plegar.count()) > 0) {
      await plegar.click();
      await esperar(1500);
    }
    await page.screenshot({ path: resolve(salida, "studio-editor.jpg"), type: "jpeg", quality: 88 });
    console.log("studio-editor.jpg");

    await page.goto(`${BASE}/p/${elegido.id}?tab=graph`);
    await esperar(7000);
    // Encajar la vista: un grafo en una esquina no enseña nada
    const encajar = page.getByRole("button", { name: "Encuadrar todo" }).first();
    if ((await encajar.count()) > 0) {
      await encajar.click();
      await esperar(1800);
    }
    await page.screenshot({ path: resolve(salida, "studio-grafo.png") });
    console.log("studio-grafo.png");
  }
} else {
  console.log("sin credenciales: solo se captura el visor público");
}

// El visor público: el producto final, sin cromo de editor
await page.goto(TOUR);
await esperar(11_000);
await page.screenshot({ path: resolve(salida, "visor.jpg"), type: "jpeg", quality: 88 });
console.log("visor.jpg");

await navegador.close();
