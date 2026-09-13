# Estado de `@andarama/web` (el sitio público de andarama.com)

Última actualización: 13 de septiembre de 2026. Sin commit: todo está en el árbol de trabajo.

## Qué es

Sitio Astro 5 estático con i18n por ruta que sustituye a la landing a mano de `apps/landing`
(que sigue intacta en disco como copia de seguridad). Sale compilado a `apps/web/dist` y
`apps/studio/scripts/collect-assets.mjs` lo copia a `dist-root/landing`; el worker antepone
`/landing` a cualquier ruta desconocida del apex, así que las URL finales son limpias
(`/`, `/en/`, `/blog/...`, `/herramientas/...`, `/_astro/...`) y `base` es `/`.

## Hecho

- **Paquete**: `apps/web/package.json`, `astro.config.mjs` (site, `trailingSlash: always`,
  `i18n` con los idiomas leídos del directorio `src/i18n`), `tsconfig.json`.
- **i18n** (`src/i18n/`): `es.json` (fuente), `en.json` (a mano), `pt/fr/de/it/ja.json`
  (traducidos por agentes, misma estructura). Motor en `src/i18n/index.ts`: descubre los
  ficheros con `import.meta.glob`, `t()` con caída al español, slugs traducidos por idioma
  (`slugs` en cada JSON), `pagePath()`, `alternates()`, `dir()` (RTL preparado: `ar`, `he`,
  `fa`, `ur` o `meta.dir` en el JSON). **Añadir un idioma = añadir `src/i18n/xx.json`.**
- **Portada** (`src/components/Portada.astro`): porta fielmente `apps/landing/index.html`
  sección a sección (mismo orden, mismo `estilo.css` copiado a `src/styles/estilo.css` con
  las fuentes en `/fonts/`, mismo tour de ejemplo `/t/recorrido-real`). Imágenes por
  `astro:assets` (`<Picture>` AVIF/WebP con `srcset`, fallback JPG, `loading="lazy"`).
- **Precios** (`src/components/Precios.astro` + `src/data/planes.ts`): siete tarjetas a
  partir de `apps/api/src/lib/plans.ts` (importado por ruta relativa: una sola fuente de
  verdad). Aula se anuncia a 39 €/año por docente; el resto en dólares. Línea «Prueba de 14
  días sin tarjeta» y nota de dólares y uso razonable.
- **Páginas nuevas** en 7 idiomas: formación, universidades (formulario → `mailto:` con
  asunto y cuerpo preparados), aula, wordpress, privacidad. Plantillas en `src/plantillas/`.
- **JSON-LD** (`src/data/jsonld.ts`): `Organization`, `SoftwareApplication` con `offers` por
  plan, `FAQPage` (portada y herramientas), `BreadcrumbList` en todas las interiores,
  `Article` y `Person` en el blog, `WebApplication` en las herramientas.
- **SEO**: `hreflang` completo con `x-default` al español, canónica, `og:locale` y
  `og:locale:alternate`, títulos y descripciones únicos por idioma, `sitemap-web.xml` con
  `xhtml:link`. En la API, `/sitemap.xml` es ahora un índice → `/sitemap-web.xml` +
  `/sitemap-tours.xml` (solo se tocó el bloque del sitemap de `tours.ts`).
- **Blog** (`src/content.config.ts`): colección `blog` (Markdown con `lang`, `slug`,
  `cluster`, `translationOf`, `plantilla`, `competidor(es)`), colección `competidores`
  (18 YAML con precios; `verificado: false` donde hay dudas) y `autores`. Plantillas
  «Andarama vs X» (`VsTabla.astro`, tabla desde YAML) y «Alternativas a X»
  (`Alternativas.astro`), que se insertan tras la entradilla según el frontmatter. Dos
  artículos en español (`content/blog/es/`), página de autor, índice por idioma y RSS
  (`/blog/rss.xml`, `/en/blog/rss.xml`…).
- **Herramientas** (`src/tools/*.ts`, islas en TypeScript sin framework):
  - visor 360 online: monta `@andarama/viewer-ui` (carga perezosa) con la foto como
    `blob:`; pantalla completa y botón de RV del propio visor; aviso si no hay WebXR.
  - pequeño planeta: `renderLittlePlanet` de `@andarama/tiler` (movida allí desde el Studio,
    generalizada con `maxSourceWidth`, `yaw`, `radius`, `background`), giro, apertura,
    fondo y tamaño (512–4096), descarga PNG.
  - equirectangular ↔ cubemap: Canvas 2D con `faceDirection`/`directionToEquirect` del
    tiler, seis PNG sueltos o ZIP (`src/tools/zip.ts`, ZIP «store» sin dependencias) y el
    camino inverso (seis caras → equirect).
  - Cada una: H1 con la palabra clave del estudio por idioma, 300–500 palabras, FAQ con
    JSON-LD, caja final «¿Quieres convertirlo en un recorrido?» → app.andarama.com.
- **Plausible**: fragmento `pa-ZLxtY4tx_lIZ2BzrNpR-v` en el `<head>` de todas las páginas;
  `plausible('herramienta', {props:{nombre}})` al usar cada herramienta;
  `plausible('cta_registro')` en todos los botones hacia el Studio (`data-cta="registro"`,
  delegado en `Base.astro`); `contacto_universidades` al enviar el formulario.
- **Integración**: `collect-assets.mjs` copia `apps/web/dist` (con aviso y caída a
  `apps/landing` si no está construido) y añade cabeceras de caché para `/landing/_astro/*`
  y `/landing/fonts/*`; `package.json` raíz (`build`) y `deploy/cloudflare/bootstrap.mjs`
  construyen `@andarama/web` antes del Studio; `worker.ts` redirige `/landing/...` del apex
  a la URL limpia y limpia el prefijo de las redirecciones de barra final de Workers
  Assets; `wrangler.jsonc` añade `/landing`, `/landing/*` y `/sitemap-tours.xml` a
  `run_worker_first`.
- **littlePlanet**: ahora en `packages/tiler/src/littlePlanet.ts` (+ test movido);
  `apps/studio/src/media/littlePlanet.ts` queda como reexportación, sin tocar los seis
  ficheros del Studio que lo importan.

## Verificaciones

- `pnpm --filter @andarama/web build`: 86 páginas (7 idiomas), `sitemap-web.xml`, 7 RSS.
- `pnpm build` completo y `pnpm --filter @andarama/studio build`:
  `dist-root/landing/index.html` sale del sitio nuevo (título «andarama | ¡anda! tours 360
  open source», `/landing/en/`, `/landing/herramientas/...`).
- Tests: `@andarama/tiler` (20, incluidos los 5 del little planet) y `@andarama/studio`
  (124) en verde; `pnpm --filter @andarama/api typecheck` y `pnpm lint` limpios.
- Prueba de humo real de las tres herramientas en Chromium
  (`node apps/web/scripts/comprobar-herramientas.mjs` contra `astro preview`): visor
  montado, planeta dibujado (centro opaco, esquina transparente), seis caras del cubo con la
  orientación esperada y ZIP descargado. Sin errores de consola.
- Lighthouse 13 móvil (Chrome, `astro preview`): portada **100 / 96 / 96 / 100**
  (rendimiento, accesibilidad, buenas prácticas, SEO; LCP 1,4 s, CLS 0); visor 360 100/96/100/100;
  artículo Kuula 100/96/100/100; formación 100/100/100/100; cubemap en japonés 100/96/100/100.
  Los 96 de accesibilidad venían del contraste (crema sobre naranja y `--tinta-suave`):
  corregidos en el último build (tinta sobre naranja en la caja del nombre y en las cajas
  CTA; `--tinta-suave` de `#85764f` a `#6f6140`). El 96 de buenas prácticas en la portada es
  el iframe del tour de ejemplo, que en `preview` da 404 (no existe fuera del worker).

## Pendiente / revisión humana

- **Textos traducidos** (pt, fr, de, it, ja): generados por agentes con reglas estrictas,
  JSON validado, pero merecen una lectura humana, sobre todo el juego de palabras del
  nombre, las FAQ y los `cuerpo` largos de las herramientas. Los nombres de plan se dejaron
  sin traducir (Andar, Aula, Paseo…); solo «En tu casa» se traduce.
- **Competidores**: 11 fichas llevan `verificado: false` (Matterport, Pano2VR, krpano,
  Theasys, Klapty, WPVR, Uptale, CenarioVR, Genially, Orbix360, Marzipano) y
  `analitica_sin_cookies` es `null` en todas. En las tablas salen con asterisco.
- **Artículos**: solo hay versión en español; las traducciones se añaden con
  `translationOf: <slug-es>` en el frontmatter (el hreflang y el índice salen solos).
- **WordPress**: el enlace a wordpress.org apunta a `/plugins/andarama-360/` con
  `rel="nofollow"` hasta que el plugin esté aprobado.
- **Formulario de universidades**: `mailto:` de momento; pasar a un endpoint cuando haya
  correo saliente en la API.
- **Visor con RV**: comprobado solo en escritorio; el botón de gafas depende de WebXR y hay
  que probarlo en unas Quest.
- **Little planet «túnel»** (cielo en el centro): no implementado; se menciona en la FAQ.
- **Idiomas futuros**: basta con añadir `src/i18n/xx.json` (misma estructura que `es.json`);
  para `ar` y `he` el `dir="rtl"` ya sale solo. Conviene también añadir `bio`/`rol` en
  `content/autores/jose-luis-saorin.yaml` y `descripcion` en los YAML de competidores
  (si faltan, caen al español).
- Tras desplegar: comprobar con `curl` `https://andarama.com/en/`, `/sitemap.xml`,
  `/sitemap-web.xml` y que `/landing/en/` redirige a `/en/`.
