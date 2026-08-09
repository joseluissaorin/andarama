/**
 * Compone el directorio de assets desplegable (dist-root/):
 *   /studio/*  - SPA del Studio (Vite build)
 *   /viewer/*  - bundle standalone del visor (viewer-ui)
 * Lo consumen Workers Assets (Cloudflare) y el estatico de Node (self-host).
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = join(root, "dist-root");

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "studio"), { recursive: true });
await cp(join(root, "dist"), join(out, "studio"), { recursive: true });
await cp(resolve(root, "../../packages/viewer-ui/dist/bundle"), join(out, "viewer"), { recursive: true });
console.log(`Assets listos en ${out}`);
