import type { Tour } from "@ull360/schema";
import { resolveL10n } from "@ull360/schema";

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
  /** Adaptador SCORM. */
  scorm?: boolean;
}

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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
      ? `window.ULL360_CONFIG = ${opts.inlineConfig};`
      : `window.ULL360_CONFIG = ${JSON.stringify(config)};`;

  return `<!doctype html>
<html lang="${esc(opts.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(opts.title)}</title>
${opts.description != null ? `<meta name="description" content="${esc(opts.description)}">` : ""}
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:type" content="website">
${opts.description != null ? `<meta property="og:description" content="${esc(opts.description)}">` : ""}
${opts.ogImage != null ? `<meta property="og:image" content="${esc(opts.ogImage)}">` : ""}
${opts.canonicalUrl != null ? `<link rel="canonical" href="${esc(opts.canonicalUrl)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<style${nonceAttr}>html,body{margin:0;height:100%;background:#0b1020;}#ull360{position:fixed;inset:0;}</style>
${opts.serviceWorker === true ? `<link rel="manifest" href="manifest.webmanifest">` : ""}
</head>
<body>
<div id="ull360"></div>
${opts.accessibleHtml != null ? `<noscript>${opts.accessibleHtml}</noscript>` : ""}
<script${nonceAttr}>${configJs}</script>
${
  opts.inlineViewerJs != null
    ? `<script type="module"${nonceAttr}>${opts.inlineViewerJs}</script>`
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
  return `// ULL360 service worker (precache offline)
const CACHE = "ull360-${version}";
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
