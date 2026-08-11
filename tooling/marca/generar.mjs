/**
 * Imágenes de marca del repositorio.
 *
 * Convierte las plantillas de `tooling/marca/*.html` en los PNG que enseña el
 * README y la tarjeta social de GitHub. Se generan, no se guardan a mano: así
 * cualquiera puede rehacerlas si cambia el logotipo o el eslogan.
 *
 *   node tooling/marca/generar.mjs
 *
 * Las fuentes (Baloo 2 y Space Mono, ambas OFL) y la criatura se incrustan en
 * el HTML antes de renderizar, porque un `file://` no siempre puede cargarlas.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "../..");
const salida = resolve(raiz, ".github/assets");
mkdirSync(salida, { recursive: true });

const dataUri = (ruta) => `data:font/woff2;base64,${readFileSync(resolve(raiz, ruta)).toString("base64")}`;
const baloo = dataUri("apps/studio/public/fonts/Baloo2-Variable.woff2");
const mono = dataUri("apps/studio/public/fonts/SpaceMono-Regular.woff2");
// La criatura sin el cuadro naranja: el sello se compone en la plantilla
const criatura = readFileSync(resolve(raiz, "apps/studio/src/brand/anda-criatura.svg"), "utf8")
  .replace(/<\?xml[^>]*\?>/, "")
  .trim();

// La escala la manda el destino: la portada se ve a unos 1000 px en GitHub y
// con 1,25x va sobrada; la tarjeta social tiene que medir 1280x640 exactos.
const piezas = [
  { plantilla: "portada.html", png: "portada.png", ancho: 1280, alto: 480, escala: 1.25 },
  { plantilla: "social.html", png: "social.png", ancho: 1280, alto: 640, escala: 1 },
];

const navegador = await chromium.launch();
for (const pieza of piezas) {
  const html = readFileSync(resolve(aqui, pieza.plantilla), "utf8")
    .replaceAll("{{FUENTE_BALOO}}", baloo)
    .replaceAll("{{FUENTE_MONO}}", mono)
    .replaceAll("{{CRIATURA}}", criatura);
  const pagina = await navegador.newPage({
    viewport: { width: pieza.ancho, height: pieza.alto },
    deviceScaleFactor: pieza.escala,
  });
  await pagina.setContent(html, { waitUntil: "load" });
  await pagina.evaluate(() => document.fonts.ready);
  const png = await pagina.screenshot({ type: "png" });
  writeFileSync(resolve(salida, pieza.png), png);
  console.log(`${pieza.png}: ${pieza.ancho}x${pieza.alto} @${pieza.escala}x`);
  await pagina.close();
}
await navegador.close();
