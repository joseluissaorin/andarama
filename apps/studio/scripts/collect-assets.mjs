/**
 * Compone el directorio de assets desplegable (dist-root/):
 *   /studio/*  - SPA del Studio (Vite build)
 *   /viewer/*  - bundle standalone del visor (viewer-ui)
 * Lo consumen Workers Assets (Cloudflare) y el estatico de Node (self-host).
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = join(root, "dist-root");

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "studio"), { recursive: true });
await cp(join(root, "dist"), join(out, "studio"), { recursive: true });
await cp(resolve(root, "../../packages/viewer-ui/dist/bundle"), join(out, "viewer"), { recursive: true });
// Documentacion (si esta construida)
try {
  await cp(resolve(root, "../docs/dist"), join(out, "docs"), { recursive: true });
} catch {
  console.warn("apps/docs sin construir; se omite /docs");
}
// Cabeceras de cache (Workers Assets): entradas estables revalidan, chunks
// con hash son inmutables. Evita servir bundles antiguos tras un deploy.
await writeFile(
  join(out, "_headers"),
  `/viewer/viewer.js
  Cache-Control: no-cache
/viewer/files.json
  Cache-Control: no-cache
/viewer/leaflet.css
  Cache-Control: no-cache
/viewer/chunks/*
  Cache-Control: public, max-age=31536000, immutable
/studio/assets/*
  Cache-Control: public, max-age=31536000, immutable
/studio/index.html
  Cache-Control: no-cache
/docs/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`,
);
console.log(`Assets listos en ${out}`);
