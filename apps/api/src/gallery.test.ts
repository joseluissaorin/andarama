import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import {
  createArgon2Hasher,
  createFsStorage,
  createInProcessQueue,
  createSmtpEmail,
  createSqliteDb,
  createSqliteKv,
  createSqlAnalytics,
  migrateSqlite,
} from "@andarama/adapters/node";
import type { PlatformRuntime } from "@andarama/adapters";
import { createApp } from "./app.js";
import type { AppEnv } from "./lib/context.js";
import { chromeLang, truncate } from "./lib/gallery-html.js";

/**
 * Galería pública (/explorar/): publicar con ficha, listado y ficha por la
 * API, páginas HTML con JSON-LD, 404 de lo que no está listado y sitemap.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../packages/db/migrations");

let app: Hono<AppEnv>;
let cookies = "";
let csrf = "";

async function call(path: string, opts: { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  let body: string | undefined;
  if (opts.body != null) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.auth !== false && cookies !== "") {
    headers.cookie = cookies;
    if ((opts.method ?? "GET") !== "GET") headers["x-csrf-token"] = csrf;
  }
  const res = await app.request(`http://localhost${path}`, { method: opts.method ?? "GET", headers, body });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    if (pair == null) continue;
    const [name] = pair.split("=");
    const jar = new Map(cookies.split("; ").filter(Boolean).map((c) => [c.split("=")[0]!, c]));
    jar.set(name!, pair);
    cookies = [...jar.values()].join("; ");
    if (name === "u3c") csrf = pair.split("=")[1] ?? "";
  }
  return res;
}

/** Un proyecto con dos escenas enlazadas, listo para publicar. */
async function crearProyecto(orgId: string, title: string): Promise<string> {
  const res = await call("/api/v1/projects", { method: "POST", body: { orgId, title, defaultLang: "es" } });
  const { id } = (await res.json()) as { id: string };
  const a = (await (
    await call(`/api/v1/projects/${id}/scenes`, { method: "POST", body: { title: "Nave", sourceJson: { kind: "equirect", url: "media:falso" } } })
  ).json()) as { id: string };
  const b = (await (
    await call(`/api/v1/projects/${id}/scenes`, { method: "POST", body: { title: "Claustro", sourceJson: { kind: "equirect", url: "media:falso" } } })
  ).json()) as { id: string };
  for (const s of [a, b]) {
    await call(`/api/v1/projects/${id}/scenes/${s.id}`, { method: "PATCH", body: { meta: { altText: `Vista de ${s.id}` } } });
  }
  await call(`/api/v1/projects/${id}/scenes/${a.id}/hotspots`, {
    method: "POST",
    body: { type: "navigation", position: { yaw: 0, pitch: 0 }, content: { target: b.id, label: "Al claustro", altText: "Al claustro" } },
  });
  await call(`/api/v1/projects/${id}/scenes/${b.id}/hotspots`, {
    method: "POST",
    body: { type: "navigation", position: { yaw: 0, pitch: 0 }, content: { target: a.id, label: "A la nave", altText: "A la nave" } },
  });
  return id;
}

/** Descripción de la longitud que pide la galería (300 a 600 caracteres). */
const DESCRIPCION =
  "La catedral de La Laguna, en Tenerife, guarda tras su fachada neoclásica una nave gótica del siglo XVI con bóvedas de crucería, " +
  "un púlpito de mármol de Carrara y un retablo mayor barroco. Este recorrido virtual 360 entra por la puerta principal, cruza " +
  "la nave central y se detiene en el claustro, donde la luz canaria cae sobre la piedra volcánica. Cada escena lleva su texto " +
  "y sus enlaces a la siguiente, para pasearla con el ratón, con el dedo o con unas gafas de realidad virtual.";

const JSON_LD = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
function jsonLdDe(html: string): Record<string, unknown>[] {
  return [...html.matchAll(JSON_LD)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);
}

beforeAll(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "anda-galeria-"));
  const { db, sqlite } = await createSqliteDb(":memory:");
  await migrateSqlite(sqlite, migrationsDir);
  const runtime: PlatformRuntime = {
    platform: "node",
    publicUrl: "http://localhost",
    db,
    kv: createSqliteKv(sqlite),
    storage: createFsStorage({ rootDir: join(dataDir, "storage"), hmacSecret: "test-secret", publicUrl: "http://localhost" }),
    queue: createInProcessQueue(),
    analytics: createSqlAnalytics(db),
    passwords: createArgon2Hasher(),
    email: createSmtpEmail({ from: "test@localhost" }),
    deferred: (p) => {
      void p.catch(() => {});
    },
  };
  app = createApp({
    runtime,
    config: { publicUrl: "http://localhost", secret: "test-secret", emailFrom: "test@localhost", maxUploadBytes: 1024 * 1024 * 100 },
  });
  await call("/api/v1/auth/register", {
    method: "POST",
    body: { email: "galeria@test.ull", name: "Galería", password: "password-larga-1", orgName: "ULL Galería" },
  });
});

let orgId = "";
let catedralId = "";
let escondidoId = "";

describe("galería pública", () => {
  it("empieza vacía y responde sin sesión", async () => {
    const me = (await (await call("/api/v1/me")).json()) as { orgs: { id: string }[] };
    orgId = me.orgs[0]!.id;
    const res = await call("/api/v1/gallery", { auth: false });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age");
    const body = (await res.json()) as { items: unknown[]; total: number; pages: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.pages).toBe(1);
    const html = await call("/explorar/", { auth: false });
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("Todavía no hay recorridos");
  });

  it("rechaza una ficha incompleta o de un tour que no es público", async () => {
    catedralId = await crearProyecto(orgId, "Catedral de La Laguna");
    const incompleta = await call(`/api/v1/projects/${catedralId}/publish`, {
      method: "POST",
      body: { slug: "catedral-la-laguna", visibility: "public", gallery: { enabled: true, title: "Catedral de La Laguna" } },
    });
    expect(incompleta.status).toBe(400);
    const corta = await call(`/api/v1/projects/${catedralId}/publish`, {
      method: "POST",
      body: {
        slug: "catedral-la-laguna",
        visibility: "public",
        gallery: { enabled: true, title: "Catedral de La Laguna", description: "Muy corta", placeName: "La Laguna", placeCountry: "ES" },
      },
    });
    expect(corta.status).toBe(400);
    const noPublica = await call(`/api/v1/projects/${catedralId}/publish`, {
      method: "POST",
      body: {
        slug: "catedral-la-laguna",
        visibility: "unlisted",
        gallery: { enabled: true, title: "Catedral de La Laguna", description: DESCRIPCION, placeName: "La Laguna", placeCountry: "ES" },
      },
    });
    expect(noPublica.status).toBe(400);
    expect(await noPublica.text()).toContain("público");
  });

  it("publica con ficha y la lista", async () => {
    const res = await call(`/api/v1/projects/${catedralId}/publish`, {
      method: "POST",
      body: {
        slug: "catedral-la-laguna",
        visibility: "public",
        gallery: {
          enabled: true,
          title: "Catedral de La Laguna: recorrido virtual 360",
          description: DESCRIPCION,
          credits: "Fotografías de Ejemplo Autor, CC BY-SA 4.0, https://commons.wikimedia.org/",
          placeName: "San Cristóbal de La Laguna",
          placeCountry: "es",
          lat: 28.4874,
          lng: -16.3159,
          lang: "es",
        },
      },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { galleryUrl: string | null; gallery: { enabled: boolean; placeCountry: string } };
    expect(body.galleryUrl).toBe("http://localhost/explorar/catedral-la-laguna/");
    expect(body.gallery.enabled).toBe(true);
    // El país se normaliza a mayúsculas
    expect(body.gallery.placeCountry).toBe("ES");

    // Un segundo tour publicado sin ficha no aparece
    escondidoId = await crearProyecto(orgId, "Tour sin ficha");
    const otro = await call(`/api/v1/projects/${escondidoId}/publish`, { method: "POST", body: { slug: "tour-sin-ficha", visibility: "public" } });
    expect(otro.status).toBe(201);

    const lista = (await (await call("/api/v1/gallery", { auth: false })).json()) as {
      items: { slug: string; title: string; posterUrl: string; pageUrl: string; countryName: string; lat: number }[];
      total: number;
      countries: { code: string; count: number }[];
    };
    expect(lista.total).toBe(1);
    expect(lista.items[0]!.slug).toBe("catedral-la-laguna");
    expect(lista.items[0]!.posterUrl).toBe("http://localhost/t/catedral-la-laguna/share.jpg");
    expect(lista.items[0]!.pageUrl).toBe("http://localhost/explorar/catedral-la-laguna/");
    expect(lista.items[0]!.countryName).toBe("España");
    expect(lista.items[0]!.lat).toBe(28.4874);
    expect(lista.countries).toEqual([{ code: "ES", count: 1 }]);

    // Filtros: país que no existe -> vacío; idioma que sí -> uno
    const vacio = (await (await call("/api/v1/gallery?country=FR", { auth: false })).json()) as { total: number };
    expect(vacio.total).toBe(0);
    const porIdioma = (await (await call("/api/v1/gallery?lang=es", { auth: false })).json()) as { total: number };
    expect(porIdioma.total).toBe(1);

    // La ficha por la API lleva sus textos; la de un slug no listado es 404
    const ficha = await call("/api/v1/gallery/catedral-la-laguna", { auth: false });
    expect(ficha.status).toBe(200);
    const detalle = (await ficha.json()) as { title: string; description: string; credits: string };
    expect(detalle.title).toContain("Catedral");
    expect(detalle.description).toBe(DESCRIPCION);
    expect(detalle.credits).toContain("CC BY-SA");
    expect((await call("/api/v1/gallery/tour-sin-ficha", { auth: false })).status).toBe(404);
    expect((await call("/api/v1/gallery/no-existe", { auth: false })).status).toBe(404);

    // El detalle del proyecto devuelve la ficha para rellenar el diálogo
    const proyecto = (await (await call(`/api/v1/projects/${catedralId}`)).json()) as { publication: { gallery: { enabled: boolean; lat: number } } };
    expect(proyecto.publication.gallery.enabled).toBe(true);
    expect(proyecto.publication.gallery.lat).toBe(28.4874);
  });

  it("sirve el índice HTML con tarjetas y filtros", async () => {
    const res = await call("/explorar/", { auth: false });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("<title>Explora recorridos virtuales 360 | andarama</title>");
    expect(html).toContain('href="http://localhost/explorar/catedral-la-laguna/"');
    expect(html).toContain("San Cristóbal de La Laguna · España");
    expect(html).toContain('/landing/estilo.css');
    // El filtro por país es una URL propia, con su título
    expect(html).toContain('href="http://localhost/explorar/?country=ES"');
    const porPais = await (await call("/explorar/?country=ES", { auth: false })).text();
    expect(porPais).toContain("<title>Recorridos virtuales 360 en España | andarama</title>");
    expect(porPais).toContain('<link rel="canonical" href="http://localhost/explorar/?country=ES">');
    // Sin barra final se redirige a la canónica
    const sinBarra = await call("/explorar", { auth: false });
    expect(sinBarra.status).toBe(301);
    expect(sinBarra.headers.get("location")).toBe("/explorar/");
    // El índice en inglés viste el cromo en inglés
    const en = await (await call("/explorar/?lang=en", { auth: false })).text();
    expect(en).toContain('<html lang="en">');
    expect(en).toContain("Explore 360 virtual tours");
  });

  it("sirve la ficha HTML con visor, JSON-LD válido y metadatos sociales", async () => {
    const res = await call("/explorar/catedral-la-laguna/", { auth: false });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Catedral de La Laguna: recorrido virtual 360</h1>");
    expect(html).toContain("Recorrido virtual 360 en San Cristóbal de La Laguna, España");
    expect(html).toContain('<iframe src="http://localhost/t/catedral-la-laguna"');
    expect(html).toContain('allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"');
    expect(html).toContain("Abrir a pantalla completa");
    expect(html).toContain("Hecho con Andarama");
    expect(html).toContain("Crea el tuyo");
    expect(html).toContain("Atribuciones");
    expect(html).toContain('<a href="https://commons.wikimedia.org/"');
    expect(html).toContain('<link rel="canonical" href="http://localhost/explorar/catedral-la-laguna/">');
    expect(html).toContain('<meta property="og:image" content="http://localhost/t/catedral-la-laguna/share.jpg">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta property="og:locale" content="es_ES">');

    const bloques = jsonLdDe(html);
    expect(bloques.length).toBe(3);
    const lugar = bloques.find((b) => b["@type"] === "TouristAttraction")!;
    expect(lugar).toBeDefined();
    expect(lugar.name).toBe("Catedral de La Laguna: recorrido virtual 360");
    expect((lugar.geo as { latitude: number; longitude: number }).latitude).toBe(28.4874);
    expect((lugar.address as { addressCountry: string }).addressCountry).toBe("ES");
    const migas = bloques.find((b) => b["@type"] === "BreadcrumbList")!;
    expect((migas.itemListElement as { name: string }[]).map((i) => i.name)).toEqual(["Inicio", "Explorar", "Catedral de La Laguna: recorrido virtual 360"]);
    const imagen = bloques.find((b) => b["@type"] === "ImageObject")!;
    expect(imagen.contentUrl).toBe("http://localhost/t/catedral-la-laguna/share.jpg");

    // Sin barra final: redirección a la canónica
    const sinBarra = await call("/explorar/catedral-la-laguna", { auth: false });
    expect(sinBarra.status).toBe(301);
    expect(sinBarra.headers.get("location")).toBe("/explorar/catedral-la-laguna/");
  });

  it("un tour publicado pero fuera de la galería da 404 en la ficha", async () => {
    const res = await call("/explorar/tour-sin-ficha/", { auth: false });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("no está en la galería");
    expect((await call("/explorar/no-existe/", { auth: false })).status).toBe(404);
  });

  it("el sitemap lleva las fichas con su portada y robots permite /explorar/", async () => {
    const xml = await (await call("/sitemap-tours.xml", { auth: false })).text();
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain("<loc>http://localhost/explorar/</loc>");
    expect(xml).toContain("<loc>http://localhost/explorar/catedral-la-laguna/</loc>");
    expect(xml).toContain("<image:loc>http://localhost/t/catedral-la-laguna/share.jpg</image:loc>");
    expect(xml).toContain("<image:title>Catedral de La Laguna: recorrido virtual 360</image:title>");
    expect(xml).toContain("<loc>http://localhost/t/tour-sin-ficha</loc>");
    expect(xml).not.toContain("/explorar/tour-sin-ficha/");
    const robots = await (await call("/robots.txt", { auth: false })).text();
    expect(robots).toContain("Allow: /explorar/");
  });

  it("republicar sin decir nada conserva la ficha; cambiar la visibilidad la apaga", async () => {
    await call(`/api/v1/projects/${catedralId}/publish`, { method: "POST", body: { visibility: "public" } });
    let lista = (await (await call("/api/v1/gallery", { auth: false })).json()) as { total: number };
    expect(lista.total).toBe(1);
    // Pasar a «no listado» la saca sola de la galería
    await call(`/api/v1/projects/${catedralId}/publish`, { method: "POST", body: { visibility: "unlisted" } });
    lista = (await (await call("/api/v1/gallery", { auth: false })).json()) as { total: number };
    expect(lista.total).toBe(0);
    expect((await call("/explorar/catedral-la-laguna/", { auth: false })).status).toBe(404);
    // Volver a público con la ficha encendida la recupera con sus textos
    const res = await call(`/api/v1/projects/${catedralId}/publish`, { method: "POST", body: { visibility: "public", gallery: { enabled: true } } });
    expect(res.status).toBe(201);
    const ficha = (await (await call("/api/v1/gallery/catedral-la-laguna", { auth: false })).json()) as { description: string };
    expect(ficha.description).toBe(DESCRIPCION);
    // Despublicar la retira del todo
    await call(`/api/v1/projects/${catedralId}/unpublish`, { method: "POST", body: {} });
    expect((await call("/api/v1/gallery/catedral-la-laguna", { auth: false })).status).toBe(404);
  });
});

describe("plantillas de la galería", () => {
  it("elige el idioma del cromo con caída a inglés y español", () => {
    expect(chromeLang("es")).toBe("es");
    expect(chromeLang("pt-BR")).toBe("pt");
    expect(chromeLang("ja")).toBe("en");
    expect(chromeLang(null)).toBe("es");
  });

  it("recorta la descripción sin partir palabras", () => {
    expect(truncate("corta")).toBe("corta");
    const larga = truncate(DESCRIPCION, 100);
    expect(larga.length).toBeLessThanOrEqual(101);
    expect(larga.endsWith("…")).toBe(true);
    expect(larga).not.toMatch(/\s…$/);
  });
});
