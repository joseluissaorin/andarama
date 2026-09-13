import { defineConfig } from "astro/config";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El sitio público de andarama.com. Sale compilado a `dist/` y el script
 * `collect-assets` del Studio lo copia a `dist-root/landing`; el worker
 * antepone `/landing` a cualquier ruta del apex que no conozca, así que los
 * enlaces se emiten absolutos desde la raíz (`/en/`, `/_astro/...`) y
 * `base` se queda en `/`.
 *
 * Los idiomas se descubren por los ficheros de `src/i18n/*.json`: añadir un
 * idioma es añadir un fichero.
 */
const here = dirname(fileURLToPath(import.meta.url));
const locales = readdirSync(join(here, "src/i18n"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

export default defineConfig({
  site: "https://andarama.com",
  base: "/",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "auto" },
  compressHTML: true,
  i18n: {
    defaultLocale: "es",
    locales,
    routing: { prefixDefaultLocale: false, redirectToDefaultLocale: false },
  },
  image: { service: { entrypoint: "astro/assets/services/sharp" } },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
