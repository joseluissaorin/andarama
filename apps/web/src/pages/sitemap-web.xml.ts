/**
 * Sitemap del sitio (todas las páginas en todos los idiomas) con las
 * alternativas hreflang de cada URL. El worker lo enlaza desde el índice
 * `/sitemap.xml` junto al sitemap de los tours publicados.
 */
import type { APIRoute } from "astro";
import { allRoutes } from "../data/rutas";
import { absolute, DEFAULT_LANG, hreflangOf } from "../i18n";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async () => {
  const rutas = await allRoutes();
  const hoy = new Date().toISOString().slice(0, 10);
  const urls = rutas
    .map((r) => {
      const lastmod = r.kind === "post" ? r.lastmod.toISOString().slice(0, 10) : hoy;
      const links = [
        ...r.alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${hreflangOf(a.lang)}" href="${esc(absolute(a.path))}" />`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(absolute((r.alternates.find((a) => a.lang === DEFAULT_LANG) ?? r.alternates[0]!).path))}" />`,
      ].join("\n");
      const priority = r.kind === "pagina" && r.key === "home" ? "1.0" : r.kind === "post" ? "0.7" : "0.8";
      return `  <url>\n    <loc>${esc(absolute(r.path))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n${links}\n  </url>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
