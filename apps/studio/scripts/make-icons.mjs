#!/usr/bin/env node
/**
 * Genera los iconos PNG de la aplicación instalable a partir de la marca SVG.
 *
 *   node scripts/make-icons.mjs
 *
 * Se ejecuta a mano y el resultado se versiona: el logotipo cambia una vez al
 * año y no merece la pena atar la construcción del Studio a sharp.
 *
 * Salen tres cosas distintas, que no son la misma imagen a distintos tamaños:
 *   - `icon-*.png`     — el icono tal cual, con sus esquinas redondeadas.
 *   - `maskable-*.png` — para Android, que recorta el icono con la forma que
 *     tenga el sistema: el símbolo va reducido dentro de la zona segura y el
 *     fondo llega hasta el borde.
 *   - `apple-touch-icon.png` — iOS lo redondea él, así que va cuadrado y opaco.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/tiler/package.json"));
const sharp = require("sharp");

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = join(root, "public", "icons");
await mkdir(out, { recursive: true });

const svg = await readFile(join(root, "public", "logo-andarama.svg"));
const svgMaskable = await readFile(join(root, "public", "logo-andarama-maskable.svg"));
/** Naranja de la marca Andarama, el mismo del icono. */
const NARANJA = { r: 0xff, g: 0x8a, b: 0x00, alpha: 1 };

/** Icono normal: la marca ocupa todo el lienzo. */
async function icono(size) {
  const png = await sharp(svg, { density: Math.ceil((size / 64) * 72) })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await writeFile(join(out, `icon-${size}.png`), png);
}

/** Enmascarable: fondo a sangre y símbolo dentro de la zona segura. */
async function enmascarable(size) {
  const png = await sharp(svgMaskable, { density: Math.ceil((size / 64) * 72) }).resize(size, size, { fit: "cover" }).png().toBuffer();
  await writeFile(join(out, `maskable-${size}.png`), png);
}

/** iOS: cuadrado y opaco; el redondeo lo pone el sistema. */
async function apple(size) {
  const marca = await sharp(svg, { density: Math.ceil((size / 64) * 72) }).resize(size, size, { fit: "contain" }).png().toBuffer();
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: NARANJA } })
    .composite([{ input: marca, gravity: "centre" }])
    .flatten({ background: NARANJA })
    .png()
    .toBuffer();
  await writeFile(join(out, "apple-touch-icon.png"), png);
}

for (const size of [64, 128, 192, 256, 512]) await icono(size);
for (const size of [192, 512]) await enmascarable(size);
await apple(180);
console.log(`Iconos generados en ${out}`);
