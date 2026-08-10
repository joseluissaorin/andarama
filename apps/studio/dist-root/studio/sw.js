/**
 * Service worker del Studio.
 *
 * Hace que la aplicación se pueda instalar y que abra al instante aunque la red
 * vaya mal, sin mentir nunca sobre los datos: **la API no se cachea jamás**. Un
 * editor que enseña escenas de hace dos horas porque las sacó de una caché es
 * peor que un editor que dice que no hay red.
 *
 * La lista de ficheros y la versión las escribe `scripts/collect-assets.mjs` al
 * componer el directorio desplegable, que es quien sabe los nombres con hash.
 */

const VERSION = "aa521fe7acae";
const PRECACHE = [
  "/studio/",
  "/studio/index.html",
  "/studio/manifest.webmanifest",
  "/studio/assets/index-D1IUvFSg.css",
  "/studio/assets/index-Dg7q4-3Z.js",
  "/studio/fonts/Baloo2-Variable.woff2",
  "/studio/fonts/SpaceMono-Bold.woff2",
  "/studio/fonts/SpaceMono-Regular.woff2",
  "/studio/icons/icon-192.png",
  "/studio/icons/icon-512.png",
  "/studio/icons/apple-touch-icon.png",
  "/studio/logo-andarama.svg"
];
const CACHE = `anda-studio-${VERSION}`;
const SHELL = "/studio/index.html";

self.addEventListener("install", (event) => {
  // Sin skipWaiting: la versión nueva espera a que se cierren las pestañas
  // abiertas o a que el usuario acepte. Cambiar el código debajo de una sesión
  // de edición en marcha es la forma más tonta de perder trabajo.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Uno a uno: si un fichero falla, no se cae la instalación entera
      Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => undefined))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("anda-studio-") && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "skipWaiting") void self.skipWaiting();
});

/** Lo que nunca se toca: API, tiempo real, tours publicados y medios. */
function isOffLimits(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/rt/") ||
    url.pathname.startsWith("/ingest") ||
    url.pathname.startsWith("/t/")
  );
}

/* En app.andarama.com el Studio vive en la raíz y el ámbito del registro es
   "/"; en workers.dev y el self-host, "/studio/". El propio ámbito dice en
   qué mundo estamos, y con él se decide qué navegaciones son nuestras. */
const RAIZ = !new URL(self.registration.scope).pathname.startsWith("/studio");

function esNavegacionPropia(url) {
  if (!RAIZ) return url.pathname.startsWith("/studio");
  // En la raíz, todo es Studio salvo las otras secciones del mismo host
  return !url.pathname.startsWith("/docs") && !url.pathname.startsWith("/viewer") && !url.pathname.startsWith("/landing");
}

/** Inmutable: nombre con hash o icono de la marca. */
function isImmutable(url) {
  return url.pathname.startsWith("/studio/assets/") || url.pathname.startsWith("/studio/icons/") || url.pathname.startsWith("/studio/fonts/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isOffLimits(url)) return;

  // Navegación: primero la red, y si no hay, el armazón guardado
  if (request.mode === "navigate") {
    if (!esNavegacionPropia(url)) return;
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match(SHELL);
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (!url.pathname.startsWith("/studio/")) return;

  if (isImmutable(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached != null) return cached;
        const response = await fetch(request);
        if (response.ok) void caches.open(CACHE).then((c) => c.put(request, response.clone()));
        return response;
      })(),
    );
    return;
  }

  // El resto del armazón: se sirve lo guardado y se refresca por detrás
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) void caches.open(CACHE).then((c) => c.put(request, response.clone()));
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    })(),
  );
});
