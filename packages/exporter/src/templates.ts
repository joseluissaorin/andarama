import type { Tour } from "@andarama/schema";
import { resolveL10n } from "@andarama/schema";

/** Plantillas HTML de los paquetes exportados y del servido /t/{slug}. */

export interface IndexHtmlOptions {
  title: string;
  description?: string;
  lang: string;
  /** Ruta del bundle del visor relativa al index. */
  viewerPath?: string;
  tourJsonPath?: string;
  ogImage?: string;
  canonicalUrl?: string;
  analyticsEndpoint?: string | null;
  formEndpoint?: string | null;
  turnstileSiteKey?: string | null;
  kiosk?: boolean;
  serviceWorker?: boolean;
  /** HTML pre-renderizado del modo accesible (SEO) dentro de <noscript>. */
  accessibleHtml?: string;
  /** Nonce CSP (servido en plataforma). */
  nonce?: string;
  /** Config inline extra (single-file: tour embebido). */
  inlineConfig?: string;
  /** Script del visor inline (single-file). */
  inlineViewerJs?: string;
  /** Metadatos de compartición ya resueltos al idioma que toca. */
  social?: {
    title?: string;
    description?: string;
    image?: string;
    imageAlt?: string;
    type?: string;
    siteName?: string;
    twitterCard?: string;
    twitterSite?: string;
    twitterCreator?: string;
    locale?: string;
    noindex?: boolean;
  };
  /** Adaptador SCORM. */
  scorm?: boolean;
}

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Etiquetas de compartición. Se generan aquí y no en cada llamador para que el
 * tour publicado y el paquete exportado se vean igual al pegarlos en un chat.
 */
export function renderSocialTags(opts: IndexHtmlOptions): string {
  const social = opts.social ?? {};
  const title = social.title ?? opts.title;
  // Un tour sin descripción propia pegado en un chat salía como un enlace
  // pelado; esta frase al menos dice qué es y se puede sustituir en Ajustes.
  const description =
    social.description ?? (opts.description != null && opts.description !== "" ? opts.description : `Un recorrido 360 por «${title}». Arrastra para mirar y anda de una escena a otra.`);
  const image = social.image ?? opts.ogImage;
  const card = social.twitterCard ?? (image != null ? "summary_large_image" : "summary");
  const lines = [
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:type" content="${esc(social.type ?? "website")}">`,
    description !== "" ? `<meta property="og:description" content="${esc(description)}">` : "",
    `<meta name="description" content="${esc(description)}">`,
    image != null ? `<meta property="og:image" content="${esc(image)}">` : "",
    image != null ? `<meta property="og:image:alt" content="${esc(social.imageAlt ?? title)}">` : "",
    `<meta property="og:site_name" content="${esc(social.siteName ?? "andarama")}">`,
    social.locale != null ? `<meta property="og:locale" content="${esc(social.locale)}">` : "",
    opts.canonicalUrl != null ? `<meta property="og:url" content="${esc(opts.canonicalUrl)}">` : "",
    opts.canonicalUrl != null ? `<link rel="canonical" href="${esc(opts.canonicalUrl)}">` : "",
    `<meta name="twitter:card" content="${esc(card)}">`,
    social.twitterSite != null ? `<meta name="twitter:site" content="${esc(social.twitterSite)}">` : "",
    social.twitterCreator != null ? `<meta name="twitter:creator" content="${esc(social.twitterCreator)}">` : "",
    social.noindex === true ? `<meta name="robots" content="noindex, nofollow">` : "",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function renderIndexHtml(opts: IndexHtmlOptions): string {
  const nonceAttr = opts.nonce != null ? ` nonce="${opts.nonce}"` : "";
  const config: Record<string, unknown> = {
    tourUrl: opts.inlineConfig == null ? (opts.tourJsonPath ?? "tour.json") : undefined,
    analyticsEndpoint: opts.analyticsEndpoint ?? null,
    formEndpoint: opts.formEndpoint ?? null,
    turnstileSiteKey: opts.turnstileSiteKey ?? null,
    kiosk: opts.kiosk === true ? true : undefined,
  };
  const configJs =
    opts.inlineConfig != null
      ? `window.Andarama_CONFIG = ${opts.inlineConfig};`
      : `window.Andarama_CONFIG = ${JSON.stringify(config)};`;

  return `<!doctype html>
<html lang="${esc(opts.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(opts.title)}</title>
${renderSocialTags(opts)}
<style${nonceAttr}>html,body{margin:0;height:100%;background:#0b1020;}#andarama{position:fixed;inset:0;}</style>
${opts.serviceWorker === true ? `<link rel="manifest" href="manifest.webmanifest">` : ""}
</head>
<body>
<div id="andarama"></div>
${opts.accessibleHtml != null ? `<noscript>${opts.accessibleHtml}</noscript>` : ""}
<script${nonceAttr}>${configJs}</script>
${
  opts.inlineViewerJs != null
    ? // El bundle inline es IIFE, no un módulo: type="module" impondría reglas
      // de CORS que file:// no cumple.
      `<script${nonceAttr}>${opts.inlineViewerJs}</script>`
    : `<script type="module" src="${esc(opts.viewerPath ?? "viewer/viewer.js")}"${nonceAttr}></script>`
}
${opts.scorm === true ? `<script src="scorm-adapter.js"${nonceAttr}></script>` : ""}
${
  opts.serviceWorker === true
    ? `<script${nonceAttr}>if("serviceWorker" in navigator){addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));}</script>`
    : ""
}
</body>
</html>`;
}

/** HTML semantico del modo accesible, pre-renderizado para SEO/indexacion. */
export function renderAccessibleHtml(tour: Tour, lang: string, baseUrl = ""): string {
  const t = (v: Parameters<typeof resolveL10n>[0]): string => resolveL10n(v, lang, tour.meta.defaultLang);
  const abs = (u: string): string =>
    /^(https?:|data:)/.test(u) ? u : `${baseUrl.replace(/\/$/, "")}/${u.replace(/^\//, "")}`;
  const scenes = tour.scenes.filter((s) => s.hidden !== true);
  const parts: string[] = [];
  parts.push(`<main><h1>${esc(t(tour.meta.title))}</h1>`);
  if (tour.meta.description != null) parts.push(`<p>${esc(t(tour.meta.description))}</p>`);
  for (const scene of scenes) {
    parts.push(`<section><h2>${esc(t(scene.title))}</h2>`);
    const alt = t(scene.altText);
    const thumb = scene.thumbnail ?? (scene.source as { preview?: string }).preview;
    if (thumb != null && !thumb.startsWith("data:")) {
      parts.push(`<img src="${esc(abs(thumb))}" alt="${esc(alt)}" loading="lazy">`);
    } else if (alt !== "") {
      parts.push(`<p>${esc(alt)}</p>`);
    }
    if (scene.description != null) parts.push(`<p>${esc(t(scene.description))}</p>`);
    const items: string[] = [];
    for (const hs of scene.hotspots) {
      if (hs.type === "text") items.push(`<li>${esc(t(hs.body)).slice(0, 800)}</li>`);
      else if (hs.type === "link") items.push(`<li><a href="${esc(hs.url)}" rel="noopener">${esc(t(hs.label) || hs.url)}</a></li>`);
      else if (hs.type === "tooltip") items.push(`<li>${esc(t(hs.text))}</li>`);
      else {
        const label = t(hs.label) || t(hs.altText);
        if (label !== "") items.push(`<li>${esc(label)}</li>`);
      }
    }
    if (items.length > 0) parts.push(`<ul>${items.join("")}</ul>`);
    parts.push("</section>");
  }
  parts.push("</main>");
  return parts.join("\n");
}

export function renderWebManifest(tour: Tour, lang: string): string {
  const title = resolveL10n(tour.meta.title, lang, tour.meta.defaultLang);
  return JSON.stringify(
    {
      name: title,
      short_name: title.slice(0, 24),
      start_url: "./index.html",
      display: "fullscreen",
      background_color: "#0b1020",
      theme_color: "#0b1020",
      description: resolveL10n(tour.meta.description, lang, tour.meta.defaultLang),
      icons: [],
    },
    null,
    2,
  );
}

/** Service worker de precache para uso offline (museos/kioscos sin red). */
export function renderServiceWorker(files: string[], version: string): string {
  return `// Andarama service worker (precache offline)
const CACHE = "anda-${version}";
const FILES = ${JSON.stringify(files)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit ?? fetch(e.request)));
});
`;
}

/**
 * Configuración de Apache para hosting compartido básico: tipos MIME de los
 * formatos modernos (algunos paneles antiguos no los conocen y los sirven como
 * texto plano, lo que rompe las tiles) y caché razonable. En Nginx o en un
 * hosting que ya sirva bien estos tipos, el fichero simplemente se ignora.
 */
export function renderHtaccess(): string {
  return `# Andarama: tour exportado. Fichero opcional para servidores Apache.
AddType image/webp .webp
AddType image/avif .avif
AddType application/manifest+json .webmanifest
AddType application/json .json
AddType text/javascript .js
AddType video/mp4 .mp4
AddType video/webm .webm
AddType audio/mpeg .mp3
AddType text/vtt .vtt
AddType model/gltf-binary .glb
AddType model/gltf+json .gltf

<IfModule mod_headers.c>
  # Las tiles y los medios llevan hash en la ruta de version: caché larga.
  <FilesMatch "\\.(webp|avif|jpg|jpeg|png|mp4|webm|mp3|glb)$">
    Header set Cache-Control "public, max-age=31536000"
  </FilesMatch>
  <FilesMatch "\\.(html|json)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/javascript application/json image/svg+xml
</IfModule>
`;
}

/** Instrucciones de publicación que acompañan al paquete exportado. */
export function renderReadme(title: string): string {
  return `# ${title}

Tour virtual 360 autocontenido, generado con Andarama.

## Cómo publicarlo

Sube **todo el contenido de esta carpeta** (incluido \`index.html\` y las
carpetas \`viewer/\` y \`a/\`) a cualquier alojamiento de ficheros estáticos:
hosting compartido con cPanel, Apache o Nginx, GitHub Pages, Netlify, un
bucket de almacenamiento o el aula virtual. No hace falta PHP, ni base de
datos, ni Node.js.

Funciona igual dentro de un subdirectorio (\`https://midominio.es/tours/mi-tour/\`):
todas las rutas del paquete son relativas.

**Hace falta servirlo, no abrirlo.** Este paquete no funciona haciendo doble clic
en \`index.html\` (\`file://\`): el navegador bloquea por seguridad la carga de los
módulos y de los panoramas desde el sistema de ficheros. Para verlo en local sin
subirlo a ningún sitio, basta con levantar un servidor en la carpeta:

\`\`\`
python3 -m http.server 8000
\`\`\`

y abrir \`http://localhost:8000\`. Si necesitas un fichero que se pueda abrir con
doble clic, exporta el tour en modo **HTML único** (solo para tours con escenas
equirectangulares, sin teselar).

## Modo VR con gafas

El modo inmersivo (Meta Quest, Pico y visores compatibles, con manos o mandos)
usa WebXR, y **WebXR solo funciona sobre HTTPS**. Es un requisito del
navegador, no de Andarama:

- Sirve el tour por \`https://\` (hoy casi todos los alojamientos ofrecen
  certificado gratuito con Let's Encrypt; en cPanel suele llamarse «SSL/TLS»).
- Si lo embebes en un iframe, añade
  \`allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"\`.

## Ficheros

- \`index.html\`: punto de entrada.
- \`viewer/\`: motor del visor.
- \`a/\`: panoramas, tiles y demás medios.
- \`tour.json\`: definición del tour.
- \`.htaccess\`: tipos MIME para Apache (opcional; se puede borrar).
`;
}
