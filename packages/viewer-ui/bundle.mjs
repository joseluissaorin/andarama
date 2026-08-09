/**
 * Genera el bundle standalone del visor (dist/bundle/):
 *  - viewer.js         entrada ESM (motor + skin) con code splitting
 *  - chunks/*.js       leaflet, hls.js, pdfjs, model-viewer (carga perezosa)
 *  - leaflet.css       hoja de estilos de Leaflet
 *  - pdf.worker.min.mjs worker de PDF.js
 * Lo consumen el servido de tours publicados (/t/{slug}) y el exportador.
 */
import { build } from "esbuild";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = join(here, "dist/bundle");
const require = createRequire(import.meta.url);

await mkdir(outdir, { recursive: true });

const result = await build({
  entryPoints: [join(here, "src/main.ts")],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir,
  entryNames: "viewer",
  chunkNames: "chunks/[name]-[hash]",
  minify: true,
  sourcemap: true,
  target: ["es2020"],
  metafile: true,
  logLevel: "warning",
  define: { "process.env.NODE_ENV": '"production"' },
});

// Assets adicionales autocontenidos
const leafletCss = require.resolve("leaflet/dist/leaflet.css");
await copyFile(leafletCss, join(outdir, "leaflet.css"));
try {
  const pdfWorker = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
  await copyFile(pdfWorker, join(outdir, "pdf.worker.min.mjs"));
} catch {
  console.warn("pdfjs-dist worker no encontrado; el visor PDF usara el fallback nativo");
}

await writeFile(join(outdir, "meta.json"), JSON.stringify(result.metafile));

// Presupuesto de rendimiento (§4.1): runtime base < 250 KB gzip.
const mainJs = await readFile(join(outdir, "viewer.js"));
const gzipKb = gzipSync(mainJs).length / 1024;
const rawKb = (await stat(join(outdir, "viewer.js"))).size / 1024;
console.log(`viewer.js: ${rawKb.toFixed(0)} KB (${gzipKb.toFixed(0)} KB gzip)`);
if (gzipKb > 250) {
  console.error(`PRESUPUESTO EXCEDIDO: viewer.js pesa ${gzipKb.toFixed(0)} KB gzip (limite 250 KB)`);
  process.exit(1);
}
