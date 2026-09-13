/**
 * Todas las rutas del sitio, en todos los idiomas, para `[...path].astro`
 * (que elige la plantilla), `sitemap-web.xml.ts` (que emite el hreflang) y
 * el RSS del blog.
 *
 * Tres clases de ruta:
 *  - «pagina»: las páginas fijas (portada, formación, universidades, aula,
 *    WordPress, privacidad, índice de herramientas, las tres herramientas y
 *    el índice del blog). Sus slugs salen traducidos de cada JSON de i18n.
 *  - «post»: una entrada del blog en su idioma. Las traducciones de un mismo
 *    artículo se agrupan por `translationOf` para el hreflang.
 *  - «autor»: la página de cada firma, en todos los idiomas.
 *
 * El español va en la raíz sin prefijo; el resto, con prefijo de idioma.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { alternates, authorPath, blogPostPath, LANGS, pagePath, type Lang, type PageKey } from "../i18n";

export interface Alternativa {
  lang: Lang;
  path: string;
}

interface RutaBase {
  lang: Lang;
  /** Ruta absoluta desde la raíz, con barra final («/en/blog/»). */
  path: string;
  /** La misma página en los demás idiomas (incluida esta), para el hreflang. */
  alternates: Alternativa[];
}

export interface RutaPagina extends RutaBase {
  kind: "pagina";
  key: PageKey;
}

export interface RutaPost extends RutaBase {
  kind: "post";
  entry: CollectionEntry<"blog">;
  /** Última modificación (para el sitemap): `actualizado` o, si no, `fecha`. */
  lastmod: Date;
}

export interface RutaAutor extends RutaBase {
  kind: "autor";
  entry: CollectionEntry<"autores">;
}

export type Ruta = RutaPagina | RutaPost | RutaAutor;

/** Claves de las páginas fijas, en el orden en que salen en el sitemap. */
export const PAGE_KEYS: PageKey[] = [
  "home",
  "formacion",
  "universidades",
  "aula",
  "wordpress",
  "privacidad",
  "herramientas",
  "visor",
  "planeta",
  "cubemap",
  "blog",
];

/**
 * Parámetro `[...path]` de Astro a partir de la ruta: sin barras en los
 * extremos, y `undefined` para la raíz (así `/` sale como `index.html`).
 */
export function toParam(path: string): string | undefined {
  const limpio = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return limpio === "" ? undefined : limpio;
}

/**
 * Entradas del blog que se publican, de la más nueva a la más antigua. Los
 * borradores solo aparecen en el servidor de desarrollo.
 */
export async function publishedPosts(): Promise<CollectionEntry<"blog">[]> {
  const posts = await getCollection("blog", (entry) => import.meta.env.DEV || !entry.data.borrador);
  return posts.sort((a, b) => b.data.fecha.getTime() - a.data.fecha.getTime());
}

/** Slug del artículo original: agrupa un artículo con sus traducciones. */
function grupoDe(entry: CollectionEntry<"blog">): string {
  return entry.data.translationOf ?? entry.data.slug;
}

export async function allRoutes(): Promise<Ruta[]> {
  const rutas: Ruta[] = [];

  // Páginas fijas: cada clave en cada idioma, con el slug traducido.
  for (const key of PAGE_KEYS) {
    const alts = alternates(key);
    for (const lang of LANGS) {
      rutas.push({ kind: "pagina", key, lang, path: pagePath(lang, key), alternates: alts });
    }
  }

  // Entradas del blog, agrupadas con sus traducciones.
  const posts = await publishedPosts();
  const grupos = new Map<string, CollectionEntry<"blog">[]>();
  for (const post of posts) {
    const grupo = grupoDe(post);
    grupos.set(grupo, [...(grupos.get(grupo) ?? []), post]);
  }
  for (const post of posts) {
    const hermanos = grupos.get(grupoDe(post)) ?? [post];
    const alts = LANGS.flatMap((lang) => {
      const version = hermanos.find((h) => h.data.lang === lang);
      return version == null ? [] : [{ lang, path: blogPostPath(lang, version.data.slug) }];
    });
    rutas.push({
      kind: "post",
      lang: post.data.lang,
      path: blogPostPath(post.data.lang, post.data.slug),
      entry: post,
      alternates: alts,
      lastmod: post.data.actualizado ?? post.data.fecha,
    });
  }

  // Autores: una página por firma y por idioma.
  const autores = await getCollection("autores");
  for (const autor of autores) {
    const alts = LANGS.map((lang) => ({ lang, path: authorPath(lang, autor.id) }));
    for (const lang of LANGS) {
      rutas.push({ kind: "autor", lang, path: authorPath(lang, autor.id), entry: autor, alternates: alts });
    }
  }

  return rutas;
}
