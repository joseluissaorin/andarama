import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { eq, isNull, and } from "drizzle-orm";
import { publications } from "@ull360/db";
import { renderAccessibleHtml, renderIndexHtml } from "@ull360/exporter";
import type { Tour } from "@ull360/schema";
import { resolveL10n } from "@ull360/schema";
import type { AppEnv } from "../lib/context.js";
import { notFound } from "../lib/errors.js";
import { parseJson, sha256Hex } from "../lib/util.js";
import { resolveAssetKey, guessContentType } from "./projects.js";
import type { PublicationPointer } from "./publish.js";

/**
 * Servido de tours publicados (/t/{slug}): todo desde el almacenamiento y
 * cache de borde/KV; la base de datos no participa (§4.3). Protecciones:
 * publico, no listado, contrasena, organizacion, dominios de embebido.
 */

/** Web component embebible: <script src=".../embed.js"></script> + <ull360-tour slug="..."> */
const EMBED_JS = `(() => {
  const scriptOrigin = (() => { try { return new URL(document.currentScript.src).origin; } catch { return ""; } })();
  class Ull360Tour extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot != null) return;
      const slug = this.getAttribute("slug");
      const src = this.getAttribute("src") ?? (slug != null ? scriptOrigin + "/t/" + encodeURIComponent(slug) : null);
      if (src == null) return;
      const rawAspect = this.getAttribute("aspect") ?? "16/9";
      const aspect = /^\\d{1,3}\\s*\\/\\s*\\d{1,3}$/.test(rawAspect) ? rawAspect : "16/9";
      const root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:block;width:100%}iframe{width:100%;aspect-ratio:" + aspect + ";border:0;border-radius:12px;display:block;background:#0b1020}";
      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.allow = "fullscreen; gyroscope; accelerometer; xr-spatial-tracking";
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      iframe.title = this.getAttribute("title") ?? "Tour virtual 360";
      root.append(style, iframe);
    }
  }
  if (customElements.get("ull360-tour") == null) customElements.define("ull360-tour", Ull360Tour);
})();
`;

/** Metadatos de compartición del tour, ya resueltos al idioma servido. */
function resolveSocial(tour: Tour, lang: string, base: string): Record<string, unknown> | undefined {
  const social = tour.social;
  if (social == null) return undefined;
  const text = (value: unknown): string | undefined => {
    if (value == null) return undefined;
    const resolved = resolveL10n(value as never, lang, tour.meta.defaultLang);
    return resolved !== "" ? resolved : undefined;
  };
  const image = social.image != null ? (/^https?:/.test(social.image) ? social.image : `${base}/${social.image.replace(/^\//, "")}`) : undefined;
  return {
    title: text(social.title),
    description: text(social.description),
    image,
    imageAlt: text(social.imageAlt),
    type: social.type,
    siteName: social.siteName,
    twitterCard: social.twitterCard,
    twitterSite: social.twitterSite,
    twitterCreator: social.twitterCreator,
    locale: social.locale,
    noindex: social.noindex,
  };
}

export function tourRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/embed.js", (c) =>
    c.body(EMBED_JS, 200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    }),
  );

  const loadPointer = async (c: any, slug: string): Promise<PublicationPointer | null> => {
    const runtime = c.get("runtime");
    const cached = await runtime.kv.get(`pub:${slug}`);
    if (cached != null) {
      return cached === "null" ? null : (JSON.parse(cached) as PublicationPointer);
    }
    const bytes = await runtime.storage.getBytes(`pub/${slug}/current.json`);
    const pointer = bytes != null ? (JSON.parse(new TextDecoder().decode(bytes)) as PublicationPointer) : null;
    await runtime.kv.put(`pub:${slug}`, pointer != null ? JSON.stringify(pointer) : "null", { ttlSeconds: 60 });
    return pointer;
  };

  /** Comprueba proteccion. Devuelve null si OK o una Response de bloqueo. */
  const checkAccess = async (c: any, slug: string, pointer: PublicationPointer): Promise<Response | null> => {
    const now = Date.now();
    if (pointer.publishAt != null && now < pointer.publishAt) return notFoundPage(c);
    if (pointer.expireAt != null && now > pointer.expireAt) return notFoundPage(c);

    if (pointer.visibility === "password") {
      const cookie = getCookie(c, `u3p_${slug}`);
      const expected = pointer.passwordHash != null ? (await sha256Hex(pointer.passwordHash)).slice(0, 32) : "";
      if (cookie === expected) return null;
      // POST del formulario de contrasena
      if (c.req.method === "POST") {
        const form = await c.req.parseBody();
        const password = String(form.password ?? "");
        const runtime = c.get("runtime");
        if (pointer.passwordHash != null && (await runtime.passwords.verify(password, pointer.passwordHash))) {
          setCookie(c, `u3p_${slug}`, expected, { httpOnly: true, sameSite: "Lax", path: `/t/${slug}`, maxAge: 86400 });
          return c.redirect(`/t/${slug}`);
        }
        return passwordPage(c, slug, true);
      }
      return passwordPage(c, slug, false);
    }

    if (pointer.visibility === "org") {
      const { resolveAuth } = await import("../lib/session.js");
      c.set("auth", await resolveAuth(c));
      if (c.get("auth") == null) {
        return c.redirect(`/studio/login?next=${encodeURIComponent(`/t/${slug}`)}`);
      }
      return null;
    }

    if (pointer.visibility === "domains") {
      const referer = c.req.header("referer") ?? c.req.header("origin") ?? "";
      let host = "";
      try {
        host = new URL(referer).host;
      } catch {
        host = "";
      }
      const own = new URL(c.get("config").publicUrl).host;
      const allowed = [own, ...(pointer.domains ?? [])];
      const secFetchDest = c.req.header("sec-fetch-dest");
      // Solo se restringe el documento embebido; los assets heredan al venir del mismo iframe
      if (secFetchDest === "iframe" || secFetchDest === "document" || secFetchDest == null) {
        if (host !== "" && !allowed.some((d) => host === d || host.endsWith(`.${d}`))) {
          return c.text("Embebido no permitido desde este dominio", 403);
        }
      }
      return null;
    }

    return null; // public y unlisted
  };

  const frameAncestors = (pointer: PublicationPointer, _publicUrl: string): string => {
    if (pointer.visibility === "domains" && pointer.domains != null && pointer.domains.length > 0) {
      return `frame-ancestors 'self' ${pointer.domains.map((d) => `https://${d}`).join(" ")}`;
    }
    return "frame-ancestors *"; // embebible en cualquier sitio (por defecto para LMS/webs)
  };

  // Pagina del visor
  r.on(["GET", "POST"], "/t/:slug", async (c) => {
    const slug = c.req.param("slug");
    const pointer = await loadPointer(c, slug);
    if (pointer == null) return notFoundPage(c);
    const block = await checkAccess(c, slug, pointer);
    if (block != null) return block;

    const runtime = c.get("runtime");
    const tourBytes = await runtime.storage.getBytes(`pub/${slug}/${pointer.version}/tour.json`);
    if (tourBytes == null) return notFoundPage(c);
    const tour = JSON.parse(new TextDecoder().decode(tourBytes)) as Tour;
    const lang = c.req.query("lang") ?? pointer.defaultLang;
    const nonce = c.get("cspNonce");
    const html = renderIndexHtml({
      title: resolveL10n(tour.meta.title, lang, tour.meta.defaultLang),
      description: resolveL10n(tour.meta.description, lang, tour.meta.defaultLang) || undefined,
      lang,
      viewerPath: `/viewer/viewer.js`,
      tourJsonPath: `/t/${slug}/tour.json`,
      ogImage: tour.meta.ogImage != null ? `${c.get("config").publicUrl}/t/${slug}/${tour.meta.ogImage}` : undefined,
      social: resolveSocial(tour, lang, `${c.get("config").publicUrl}/t/${slug}`),
      canonicalUrl: `${c.get("config").publicUrl}/t/${slug}`,
      analyticsEndpoint: pointer.analytics ? "/ingest/e" : null,
      formEndpoint: `/api/v1/public/forms/${slug}`,
      turnstileSiteKey: c.get("config").turnstileSiteKey ?? null,
      accessibleHtml: renderAccessibleHtml(tour, lang, `/t/${slug}`),
      nonce,
    });
    const res = await c.html(html);
    res.headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
        "media-src 'self' blob: data:",
        "connect-src 'self' blob: data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
        "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://challenges.cloudflare.com https:",
        "worker-src 'self' blob:",
        frameAncestors(pointer, c.get("config").publicUrl),
        "base-uri 'self'",
      ].join("; "),
    );
    res.headers.delete("x-frame-options");
    res.headers.set("cache-control", pointer.visibility === "public" ? "public, max-age=60" : "private, no-store");
    return res;
  });

  // tour.json y assets congelados
  r.get("/t/:slug/tour.json", async (c) => {
    const slug = c.req.param("slug");
    const pointer = await loadPointer(c, slug);
    if (pointer == null) throw notFound();
    const block = await checkAccess(c, slug, pointer);
    if (block != null) return block;
    const runtime = c.get("runtime");
    const obj = await runtime.storage.get(`pub/${slug}/${pointer.version}/tour.json`);
    if (obj == null) throw notFound();
    return new Response(obj.body as unknown as BodyInit, {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
    });
  });

  r.get("/t/:slug/a/*", async (c) => {
    const slug = c.req.param("slug");
    const pointer = await loadPointer(c, slug);
    if (pointer == null) throw notFound();
    const runtime = c.get("runtime");
    const rel = `a/${c.req.path.split("/a/")[1] ?? ""}`;
    // Mapa de assets congelado (cacheado en KV)
    const mapCacheKey = `pubmap:${slug}:${pointer.version}`;
    let map = parseJson<{ assets: Record<string, string>; prefixes: Record<string, string> } | null>(
      await runtime.kv.get(mapCacheKey),
      null,
    );
    if (map == null) {
      const bytes = await runtime.storage.getBytes(`pub/${slug}/${pointer.version}/map.json`);
      if (bytes == null) throw notFound();
      map = JSON.parse(new TextDecoder().decode(bytes)) as { assets: Record<string, string>; prefixes: Record<string, string> };
      await runtime.kv.put(mapCacheKey, JSON.stringify(map), { ttlSeconds: 600 });
    }
    const key = resolveAssetKey(decodeURIComponent(rel), map);
    if (key == null) throw notFound("Asset fuera del tour");
    const obj = await runtime.storage.get(key);
    if (obj == null) throw notFound();
    return new Response(obj.body as unknown as BodyInit, {
      headers: {
        "content-type": obj.meta.contentType ?? guessContentType(key),
        // inmutable: la version esta congelada
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  });

  // ------- Analitica sin cookies -------
  r.post("/ingest/e", async (c) => {
    const runtime = c.get("runtime");
    const { rateLimit, clientIp } = await import("../lib/helpers.js");
    try {
      await rateLimit(runtime.kv, `ingest:${clientIp(c)}`, 600, 60);
    } catch {
      return c.json({ ok: true }); // silencioso: la analitica nunca rompe el visor
    }
    const body = (await c.req.json().catch(() => null)) as { events?: Record<string, unknown>[] } | null;
    if (body?.events == null || !Array.isArray(body.events)) return c.json({ ok: true });
    const country = (c.req.raw as { cf?: { country?: string } }).cf?.country;
    for (const e of body.events.slice(0, 50)) {
      const event = String(e.e ?? "");
      if (!["view", "scene", "hotspot", "duration", "quiz", "form", "share", "vr", "heartbeat"].includes(event)) continue;
      runtime.deferred(
        runtime.analytics.write({
          tourSlug: String(e.t ?? "").slice(0, 80),
          event: event as "view",
          sceneId: e.s != null ? String(e.s).slice(0, 80) : undefined,
          hotspotId: e.h != null ? String(e.h).slice(0, 80) : undefined,
          lang: e.l != null ? String(e.l).slice(0, 10) : undefined,
          device: e.d != null ? String(e.d).slice(0, 10) : undefined,
          country,
          refererHost: e.r != null ? String(e.r).slice(0, 100) : undefined,
          sessionHash: e.sid != null ? String(e.sid).slice(0, 40) : undefined,
          durationMs: typeof e.dur === "number" ? Math.min(e.dur, 3600_000) : undefined,
          yawBucket: typeof e.yb === "number" ? e.yb : undefined,
          pitchBucket: typeof e.pb === "number" ? e.pb : undefined,
        }),
      );
    }
    return c.json({ ok: true });
  });

  // ------- Sitemap y robots (SEO §2.12) -------
  r.get("/sitemap.xml", async (c) => {
    const db = c.get("db");
    const pubs = await db
      .select()
      .from(publications)
      .where(and(eq(publications.visibility, "public"), isNull(publications.expireAt)));
    const base = c.get("config").publicUrl;
    const urls = pubs
      .map((p) => `  <url><loc>${base}/t/${p.slug}</loc><lastmod>${new Date(p.publishedAt).toISOString().slice(0, 10)}</lastmod></url>`)
      .join("\n");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`, {
      headers: { "content-type": "application/xml", "cache-control": "public, max-age=3600" },
    });
  });

  r.get("/robots.txt", (c) => {
    return c.text(`User-agent: *\nAllow: /t/\nDisallow: /api/\nDisallow: /studio/\nSitemap: ${c.get("config").publicUrl}/sitemap.xml\n`);
  });

  return r;
}

function notFoundPage(c: any): Response {
  return c.html(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tour no disponible</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui;background:#0b1020;color:#e8eaf4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{text-align:center;padding:24px}h1{font-size:22px}p{color:#9aa2c2}</style></head><body><main><h1>Este tour no está disponible</h1><p>Puede que haya sido despublicado, haya expirado o la dirección no sea correcta.</p></main></body></html>`,
    404,
  );
}

function passwordPage(c: any, slug: string, wrong: boolean): Response {
  return c.html(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tour protegido</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui;background:#0b1020;color:#e8eaf4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}form{background:#1a2038;padding:32px;border-radius:14px;max-width:340px;width:100%}h1{font-size:18px;margin:0 0 14px}input{width:100%;padding:10px;border-radius:8px;border:1px solid #323a5e;background:transparent;color:inherit;box-sizing:border-box}button{margin-top:14px;width:100%;padding:11px;border:none;border-radius:8px;background:#5c68a5;color:#fff;font-size:15px;cursor:pointer}.err{color:#f87171;font-size:13px}</style></head><body><form method="post" action="/t/${slug}"><h1>Este tour está protegido</h1>${wrong ? '<p class="err">Contraseña incorrecta</p>' : ""}<label>Contraseña<input type="password" name="password" autofocus required></label><button type="submit">Entrar</button></form></body></html>`,
    wrong ? 403 : 401,
  );
}
