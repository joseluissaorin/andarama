#!/usr/bin/env node
/**
 * Empaqueta el plugin de WordPress (`packages/wordpress-plugin/andarama-360`)
 * en `dist/descargas/andarama-360.zip`, para que /wordpress/ ofrezca la
 * instalación manual mientras el plugin espera su aprobación en
 * wordpress.org. Respeta `.distignore` (como `wp dist-archive`) y deja la
 * carpeta `andarama-360/` en la raíz del ZIP, que es lo que espera
 * «Subir plugin».
 *
 * ZIP sin compresión («store»), sin dependencias: CRC-32 y cabeceras a mano.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const origen = resolve(here, "../../../packages/wordpress-plugin/andarama-360");
const destino = resolve(here, "../dist/descargas/andarama-360.zip");
const RAIZ = "andarama-360";

/** Patrones de `.distignore`: nombres exactos o comodines simples («*.po~»). */
async function ignorados() {
  const texto = await readFile(join(origen, ".distignore"), "utf8").catch(() => "");
  const patrones = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
  const regex = patrones.map((p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`));
  return (ruta) => regex.some((r) => r.test(ruta) || r.test(ruta.split("/").pop()));
}

async function ficheros(dir, ignorar) {
  const out = [];
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = join(dir, e.name);
    const rel = relative(origen, abs).split(sep).join("/");
    if (ignorar(rel) || e.name === ".DS_Store") continue;
    if (e.isDirectory()) out.push(...(await ficheros(abs, ignorar)));
    else if (e.isFile()) out.push({ abs, rel });
  }
  return out;
}

const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en formato MS-DOS. */
function dos(fecha) {
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2);
  const dia = ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  return { hora, dia };
}

async function main() {
  const ignorar = await ignorados();
  const lista = await ficheros(origen, ignorar);
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const f of lista) {
    const datos = await readFile(f.abs);
    const nombre = Buffer.from(`${RAIZ}/${f.rel}`, "utf8");
    const { hora, dia } = dos((await stat(f.abs)).mtime);
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombre, datos);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(dia, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(offset, 42);
    centrales.push(central, nombre);
    offset += local.length + nombre.length + datos.length;
  }
  const tamCentral = centrales.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(lista.length, 8);
  fin.writeUInt16LE(lista.length, 10);
  fin.writeUInt32LE(tamCentral, 12);
  fin.writeUInt32LE(offset, 16);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, Buffer.concat([...locales, ...centrales, fin]));
  console.log(`[plugin-wp] ${lista.length} ficheros → ${relative(process.cwd(), destino)}`);
}

main().catch((err) => {
  console.error("[plugin-wp] no se pudo empaquetar el plugin:", err);
  process.exit(1);
});
