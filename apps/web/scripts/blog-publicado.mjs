/**
 * Qué artículos del blog están publicados, leído directamente de los
 * Markdown (para `astro.config.mjs` y `comprobar-blog.mjs`, que no pasan por
 * las colecciones de Astro). La regla es la de `src/data/publicacion.ts`:
 * sale lo que no es borrador y tiene `fecha` de hoy o anterior.
 *
 * Y un plugin de remark que quita el enlace (dejando el texto) a los
 * artículos que aún no se han publicado: un artículo de hoy puede enlazar a
 * uno programado para dentro de dos semanas sin que la web publique un 404.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function campo(fm, nombre) {
  const m = fm.match(new RegExp(`^${nombre}:\\s*(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["'](.*)["']$/, "$1") : null;
}

/** Todos los artículos: `{ lang, slug, publicado }`. */
export function articulos(dirBlog, ahora = new Date()) {
  const out = [];
  if (!existsSync(dirBlog)) return out;
  for (const lang of readdirSync(dirBlog)) {
    const dir = join(dirBlog, lang);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
      const src = readFileSync(join(dir, f), "utf8");
      const fm = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      const slug = campo(fm, "slug") ?? f.replace(/\.md$/, "");
      const fecha = new Date(campo(fm, "fecha") ?? "2999-01-01");
      const borrador = campo(fm, "borrador") === "true";
      out.push({ lang: campo(fm, "lang") ?? lang, slug, publicado: !borrador && fecha.getTime() <= ahora.getTime() });
    }
  }
  return out;
}

/** Slugs sin publicar (de cualquier idioma). */
export function slugsSinPublicar(dirBlog, ahora = new Date()) {
  return new Set(articulos(dirBlog, ahora).filter((a) => !a.publicado).map((a) => a.slug));
}

/** ¿Apunta esta URL interna a un artículo sin publicar? («/blog/x/», «/en/blog/x/#y»). */
export function esEnlaceSinPublicar(url, sinPublicar) {
  const m = /^(?:\/[a-z]{2}(?:-[A-Za-z]{2})?)?\/blog\/([^/#?]+)\/?(?:[#?].*)?$/.exec(url);
  return m != null && sinPublicar.has(m[1]);
}

/** Plugin de remark: desenlaza los enlaces a artículos sin publicar. */
export function remarkEnlacesPublicados({ dirBlog, activo = true } = {}) {
  return () => {
    if (!activo) return () => {};
    const sinPublicar = slugsSinPublicar(dirBlog);
    const recorrer = (nodo) => {
      if (!Array.isArray(nodo.children)) return;
      for (let i = 0; i < nodo.children.length; i++) {
        const hijo = nodo.children[i];
        if (hijo.type === "link" && typeof hijo.url === "string" && esEnlaceSinPublicar(hijo.url, sinPublicar)) {
          nodo.children.splice(i, 1, ...(hijo.children ?? []));
          i--;
          continue;
        }
        recorrer(hijo);
      }
    };
    return (tree) => recorrer(tree);
  };
}
