import { Hono } from "hono";
import { and, count, desc, eq, gt, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { publications } from "@andarama/db";
import type { Tour } from "@andarama/schema";
import type { AppEnv, Db } from "../lib/context.js";
import { notFound } from "../lib/errors.js";
import {
  countryName,
  galleryIndexUrl,
  renderGalleryIndex,
  renderGalleryTour,
  type GalleryChrome,
  type GalleryItem,
} from "../lib/gallery-html.js";
import type { PublicationPointer } from "./publish.js";

/**
 * Galería pública de recorridos (§ SEO, hallazgo 3 del estudio): cada tour
 * que su autor marca al publicar tiene una ficha propia en /explorar/{slug}/
 * con el nombre del lugar, y un índice con filtros por país. Sin sesión.
 *
 * A diferencia de /t/{slug}, aquí sí se consulta la base de datos: es donde
 * viven los textos de la ficha. Se cachea en KV un minuto por «generación»
 * (publicar la cambia) y se manda `cache-control` corto al borde.
 */

const PAGE_SIZE = 24;
const CACHE_TTL = 60;

type PublicationRow = typeof publications.$inferSelect;

/** Solo lo público, en la galería, aprobado por un administrador y dentro de su ventana de publicación. */
function visibleNow(now: number): SQL {
  return and(
    eq(publications.inGallery, true),
    eq(publications.galleryApproved, true),
    eq(publications.visibility, "public"),
    or(isNull(publications.expireAt), gt(publications.expireAt, now)),
    or(isNull(publications.publishAt), lte(publications.publishAt, now)),
  )!;
}

function toItem(row: PublicationRow, base: string, lang: string): GalleryItem {
  const placeCountry = row.placeCountry ?? "";
  return {
    slug: row.slug,
    title: row.galleryTitle ?? row.slug,
    description: row.galleryDescription ?? "",
    credits: row.galleryCredits,
    placeName: row.placeName ?? "",
    placeCountry,
    countryName: countryName(placeCountry, lang),
    lat: row.placeLat,
    lng: row.placeLng,
    lang: row.galleryLang ?? "es",
    posterUrl: `${base}/t/${row.slug}/share.jpg`,
    pageUrl: `${base}/explorar/${row.slug}/`,
    tourUrl: `${base}/t/${row.slug}`,
    publishedAt: row.publishedAt,
  };
}

interface ListQuery {
  page: number;
  country: string | null;
  lang: string | null;
}

interface ListResult {
  items: GalleryItem[];
  page: number;
  pages: number;
  total: number;
  countries: { code: string; count: number }[];
}

async function listGallery(db: Db, base: string, q: ListQuery, chromeLang: string): Promise<ListResult> {
  const now = Date.now();
  const where = and(
    visibleNow(now),
    q.country != null ? eq(publications.placeCountry, q.country) : undefined,
    q.lang != null ? eq(publications.galleryLang, q.lang) : undefined,
  )!;
  const [{ n: total } = { n: 0 }] = await db.select({ n: count() }).from(publications).where(where);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, q.page), pages);
  const rows = await db
    .select()
    .from(publications)
    .where(where)
    .orderBy(desc(publications.publishedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  // Los países se cuentan sobre el filtro de idioma, no sobre el de país:
  // los chips deben ofrecer los otros países, no solo el elegido
  const countries = await db
    .select({ code: publications.placeCountry, count: count() })
    .from(publications)
    .where(and(visibleNow(now), q.lang != null ? eq(publications.galleryLang, q.lang) : undefined)!)
    .groupBy(publications.placeCountry)
    .orderBy(desc(count()), publications.placeCountry);
  return {
    items: rows.map((r) => toItem(r, base, chromeLang)),
    page,
    pages,
    total,
    countries: countries.filter((c): c is { code: string; count: number } => c.code != null),
  };
}

async function findGalleryItem(db: Db, base: string, slug: string, chromeLang: string): Promise<GalleryItem | null> {
  const row = (await db
    .select()
    .from(publications)
    .where(and(eq(publications.slug, slug), visibleNow(Date.now())))
    .limit(1))[0];
  return row != null ? toItem(row, base, chromeLang) : null;
}

/** Hasta tres recorridos más, primero los del mismo país. */
async function relatedItems(db: Db, base: string, item: GalleryItem, chromeLang: string): Promise<GalleryItem[]> {
  const rows = await db
    .select()
    .from(publications)
    .where(and(visibleNow(Date.now()), ne(publications.slug, item.slug)))
    .orderBy(sql`case when ${publications.placeCountry} = ${item.placeCountry} then 0 else 1 end`, desc(publications.publishedAt))
    .limit(3);
  return rows.map((r) => toItem(r, base, chromeLang));
}

/** Autor declarado en el tour publicado, leído del artefacto congelado. */
async function tourAuthor(c: { get(k: "runtime"): AppEnv["Variables"]["runtime"] }, slug: string): Promise<string | null> {
  const runtime = c.get("runtime");
  try {
    const cur = await runtime.storage.getBytes(`pub/${slug}/current.json`);
    if (cur == null) return null;
    const pointer = JSON.parse(new TextDecoder().decode(cur)) as PublicationPointer;
    const bytes = await runtime.storage.getBytes(`pub/${slug}/${pointer.version}/tour.json`);
    if (bytes == null) return null;
    const tour = JSON.parse(new TextDecoder().decode(bytes)) as Tour;
    return typeof tour.meta.author === "string" && tour.meta.author.trim() !== "" ? tour.meta.author.trim() : null;
  } catch {
    return null;
  }
}

function parseQuery(c: { req: { query(k: string): string | undefined } }): ListQuery {
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const country = (c.req.query("country") ?? "").trim().toUpperCase();
  const lang = (c.req.query("lang") ?? "").trim().toLowerCase();
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    lang: /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(lang) ? lang : null,
  };
}

/** Lee de la caché por generación o calcula y guarda. */
async function cached(c: { get(k: "runtime"): AppEnv["Variables"]["runtime"] }, key: string, build: () => Promise<string>): Promise<string> {
  const kv = c.get("runtime").kv;
  const gen = (await kv.get("gallery:gen")) ?? "0";
  const fullKey = `gallery:${gen}:${key}`;
  const hit = await kv.get(fullKey);
  if (hit != null) return hit;
  const value = await build();
  await kv.put(fullKey, value, { ttlSeconds: CACHE_TTL });
  return value;
}

function chromeOf(c: { get(k: "config"): AppEnv["Variables"]["config"] }): GalleryChrome {
  const config = c.get("config");
  const base = config.publicUrl.replace(/\/$/, "");
  // En la instancia alojada el Studio vive en su subdominio; en el self-host, en /studio
  const studioUrl = config.clerk != null ? `https://app.${new URL(config.publicUrl).host}/?utm_source=galeria&utm_medium=ficha&utm_campaign=crea-el-tuyo` : `${base}/studio/`;
  return { base, studioUrl };
}

const CACHE_HEADER = `public, max-age=${CACHE_TTL}, s-maxage=300`;

// ---------------------------------------------------------------------------
// API JSON: /api/v1/gallery
// ---------------------------------------------------------------------------

export function galleryApiRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const q = parseQuery(c);
    const base = c.get("config").publicUrl.replace(/\/$/, "");
    const body = await cached(c, `api:${q.lang ?? ""}:${q.country ?? ""}:${q.page}`, async () => {
      const res = await listGallery(c.get("db"), base, q, q.lang ?? "es");
      return JSON.stringify({ ...res, pageSize: PAGE_SIZE });
    });
    return c.body(body, 200, { "content-type": "application/json; charset=utf-8", "cache-control": CACHE_HEADER });
  });

  r.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const base = c.get("config").publicUrl.replace(/\/$/, "");
    const body = await cached(c, `api:item:${slug}`, async () => {
      const item = await findGalleryItem(c.get("db"), base, slug, "es");
      if (item == null) return "null";
      const author = await tourAuthor(c, slug);
      return JSON.stringify({ ...item, author });
    });
    if (body === "null") throw notFound("Ese recorrido no está en la galería");
    return c.body(body, 200, { "content-type": "application/json; charset=utf-8", "cache-control": CACHE_HEADER });
  });

  return r;
}

// ---------------------------------------------------------------------------
// Páginas HTML: /explorar/ y /explorar/{slug}/
// ---------------------------------------------------------------------------

export function galleryPageRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  // Las URL canónicas llevan barra final, como el resto del sitio
  r.get("/explorar", (c) => c.redirect(`/explorar/${new URL(c.req.url).search}`, 301));
  r.get("/explorar/:slug", (c) => c.redirect(`/explorar/${c.req.param("slug")}/`, 301));

  r.get("/explorar/", async (c) => {
    const q = parseQuery(c);
    const chrome = chromeOf(c);
    const html = await cached(c, `html:${q.lang ?? ""}:${q.country ?? ""}:${q.page}`, async () => {
      const res = await listGallery(c.get("db"), chrome.base, q, q.lang ?? "es");
      return renderGalleryIndex({
        chrome,
        lang: q.lang ?? "es",
        items: res.items,
        page: res.page,
        pages: res.pages,
        total: res.total,
        country: q.country,
        langFilter: q.lang,
        countries: res.countries,
      });
    });
    const res = await c.html(html);
    res.headers.set("cache-control", CACHE_HEADER);
    return res;
  });

  r.get("/explorar/:slug/", async (c) => {
    const slug = c.req.param("slug");
    const chrome = chromeOf(c);
    const html = await cached(c, `html:item:${slug}`, async () => {
      const item = await findGalleryItem(c.get("db"), chrome.base, slug, "es");
      if (item == null) return "";
      const [author, related] = await Promise.all([tourAuthor(c, slug), relatedItems(c.get("db"), chrome.base, item, item.lang)]);
      return renderGalleryTour({ chrome, item, author, related });
    });
    if (html === "") return galleryNotFound(c);
    const res = await c.html(html);
    res.headers.set("cache-control", CACHE_HEADER);
    return res;
  });

  return r;
}

function galleryNotFound(c: { html(html: string, status: 404): Response | Promise<Response>; get(k: "config"): AppEnv["Variables"]["config"] }): Response | Promise<Response> {
  const base = c.get("config").publicUrl.replace(/\/$/, "");
  return c.html(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recorrido no encontrado | andarama</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><link rel="stylesheet" href="/landing/estilo.css"><link rel="stylesheet" href="/landing/sitio.css"></head><body><main class="pagina"><div class="pagina__cabeza"><h1>Este recorrido no está en la galería</h1><p class="lead">Puede que su autor lo haya retirado, que haya caducado o que la dirección no sea correcta.</p><div class="acciones"><a class="btn" href="${galleryIndexUrl(base, {})}">Explorar la galería</a></div></div></main></body></html>`,
    404,
  );
}
