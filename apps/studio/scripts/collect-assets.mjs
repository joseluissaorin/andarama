/**
 * Compone el directorio de assets desplegable (dist-root/):
 *   /studio/*  - SPA del Studio (Vite build)
 *   /viewer/*  - bundle standalone del visor (viewer-ui)
 * Lo consumen Workers Assets (Cloudflare) y el estatico de Node (self-host).
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
// La landing de andarama.com (estatica, sin build)
await cp(resolve(root, "../landing"), join(out, "landing"), { recursive: true });
// Service worker: aquí es donde se saben los nombres con hash de esta
// compilación, así que es aquí donde se escribe la lista de precarga y la
// versión. Solo entra el armazón —el JavaScript principal, los estilos, el
// tipo de letra y los iconos—; los trozos que se cargan bajo demanda se
// guardan según se usan.
const studioDir = join(out, "studio");
const assets = await readdir(join(studioDir, "assets"));
const shell = [
  "/studio/",
  "/studio/index.html",
  "/studio/manifest.webmanifest",
  ...assets.filter((f) => /^index-.*\.(js|css)$/.test(f)).map((f) => `/studio/assets/${f}`),
  // Los tipos de letra van en public/, no empaquetados: sin ellos la app abre
  // sin red pero con otra letra, que canta muchísimo.
  ...(await readdir(join(studioDir, "fonts")).catch(() => [])).filter((f) => f.endsWith(".woff2")).map((f) => `/studio/fonts/${f}`),
  "/studio/icons/icon-192.png",
  "/studio/icons/icon-512.png",
  "/studio/icons/apple-touch-icon.png",
  "/studio/logo-andarama.svg",
];
const swPath = join(studioDir, "sw.js");
const swSource = await readFile(swPath, "utf8");
const version = createHash("sha256").update(shell.join("|")).digest("hex").slice(0, 12);
await writeFile(swPath, swSource.replace("__VERSION__", version).replaceAll("__PRECACHE__", JSON.stringify(shell, null, 2)));

// Manifiesto gemelo para app.andarama.com, donde el Studio vive en la raiz:
// el mismo fichero con id, start_url, scope y atajos reescritos a "/". Lo
// sirve el worker cuando el host es el subdominio de la app.
const manifest = JSON.parse(await readFile(join(studioDir, "manifest.webmanifest"), "utf8"));
const sinPrefijo = (u) => (u === "/studio/" ? "/" : u.replace(/^\/studio\//, "/"));
manifest.id = "/";
manifest.start_url = "/";
manifest.scope = "/";
if (Array.isArray(manifest.shortcuts)) {
  manifest.shortcuts = manifest.shortcuts.map((s) => ({ ...s, url: sinPrefijo(s.url) }));
}
await writeFile(join(studioDir, "manifest-root.webmanifest"), JSON.stringify(manifest, null, 2));

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
/studio/sw.js
  Cache-Control: no-cache
  Content-Type: text/javascript; charset=utf-8
  Service-Worker-Allowed: /
/studio/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json; charset=utf-8
/studio/manifest-root.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json; charset=utf-8
/studio/icons/*
  Cache-Control: public, max-age=604800
/docs/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/landing/index.html
  Cache-Control: no-cache
/landing/estilo.css
  Cache-Control: no-cache
`,
);
console.log(`Assets listos en ${out}`);
