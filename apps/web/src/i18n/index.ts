/**
 * Motor de idiomas del sitio.
 *
 * Cada idioma es un fichero `src/i18n/{lang}.json` con la misma forma que
 * `es.json`. Se descubren solos con `import.meta.glob`, así que añadir un
 * idioma es añadir un fichero (y `astro.config.mjs` lee el mismo directorio
 * para la configuración `i18n`). El español vive en la raíz (`/`); los demás
 * llevan prefijo (`/en/`). Las claves que falten en un idioma caen al español
 * para que una traducción a medias no rompa el build.
 */
import es from "./es.json";

export type Strings = typeof es;
export type Lang = string;

const modules = import.meta.glob<{ default: Strings }>("./*.json", { eager: true });

/** Todos los idiomas disponibles, español primero y el resto por código. */
export const STRINGS: Record<Lang, Strings> = Object.fromEntries(
  Object.entries(modules)
    .map(([path, mod]) => [path.replace(/^\.\//, "").replace(/\.json$/, ""), mod.default] as const)
    .sort(([a], [b]) => (a === "es" ? -1 : b === "es" ? 1 : a.localeCompare(b))),
);

export const DEFAULT_LANG: Lang = "es";
export const LANGS: Lang[] = Object.keys(STRINGS);

/** Idiomas que se escriben de derecha a izquierda (para `dir` en <html>). */
export const RTL = new Set(["ar", "he", "fa", "ur"]);

export function strings(lang: Lang): Strings {
  return STRINGS[lang] ?? STRINGS[DEFAULT_LANG]!;
}

export function dir(lang: Lang): "ltr" | "rtl" {
  const declared = (strings(lang).meta as { dir?: string }).dir;
  if (declared === "rtl" || declared === "ltr") return declared;
  return RTL.has(lang.split("-")[0]!) ? "rtl" : "ltr";
}

function deepGet(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

/**
 * Cadena por ruta con puntos («home.portada.subtitulo»). Si el idioma no la
 * tiene, se devuelve la española; si tampoco, la propia ruta, que canta en
 * pantalla y se ve enseguida.
 */
export function t(lang: Lang, path: string, vars?: Record<string, string | number>): string {
  let value = deepGet(strings(lang), path);
  if (value == null) value = deepGet(STRINGS[DEFAULT_LANG], path);
  if (typeof value !== "string") return path;
  if (vars == null) return value;
  return value.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] != null ? String(vars[k]) : m));
}

/** Un objeto o lista entera por ruta, con la misma caída al español. */
export function tv<T = unknown>(lang: Lang, path: string): T {
  const value = deepGet(strings(lang), path);
  if (value != null) return value as T;
  return deepGet(STRINGS[DEFAULT_LANG], path) as T;
}

/** Prefijo de ruta del idioma: vacío para el español, «/en» para el resto. */
export function prefix(lang: Lang): string {
  return lang === DEFAULT_LANG ? "" : `/${lang}`;
}

export type PageKey =
  | "home"
  | "formacion"
  | "universidades"
  | "museos"
  | "aula"
  | "wordpress"
  | "privacidad"
  | "precios"
  | "inmobiliaria"
  | "seguridad"
  | "accesibilidad"
  | "codigoAbierto"
  | "contratacion"
  | "avisoLegal"
  | "condiciones"
  | "herramientas"
  | "visor"
  | "planeta"
  | "cubemap"
  | "blog";

/** Slug traducido de una página (por idioma, con caída al español). */
export function slug(lang: Lang, key: Exclude<PageKey, "home"> | "autor"): string {
  return t(lang, `slugs.${key}`);
}

/**
 * Ruta absoluta desde la raíz de una página del sitio, con barra final.
 * Las herramientas cuelgan del índice de herramientas; el blog, de su índice.
 */
export function pagePath(lang: Lang, key: PageKey): string {
  const p = prefix(lang);
  switch (key) {
    case "home":
      return `${p}/`;
    case "visor":
    case "planeta":
    case "cubemap":
      return `${p}/${slug(lang, "herramientas")}/${slug(lang, key)}/`;
    default:
      return `${p}/${slug(lang, key)}/`;
  }
}

export function blogPostPath(lang: Lang, postSlug: string): string {
  return `${prefix(lang)}/${slug(lang, "blog")}/${postSlug}/`;
}

export function authorPath(lang: Lang, authorSlug: string): string {
  return `${prefix(lang)}/${slug(lang, "blog")}/${slug(lang, "autor")}/${authorSlug}/`;
}

export function rssPath(lang: Lang): string {
  return `${prefix(lang)}/${slug(lang, "blog")}/rss.xml`;
}

/** Alternativas hreflang de una página: la misma clave en todos los idiomas. */
export function alternates(key: PageKey): { lang: Lang; path: string }[] {
  return LANGS.map((lang) => ({ lang, path: pagePath(lang, key) }));
}

export const SITE = "https://andarama.com";

export function absolute(path: string): string {
  return `${SITE}${path}`;
}

/** Código hreflang (p. ej. «pt-BR» si el JSON lo declara; si no, el propio código). */
export function hreflangOf(lang: Lang): string {
  return (strings(lang).meta as { hreflang?: string }).hreflang ?? lang;
}

export function ogLocaleOf(lang: Lang): string {
  return (strings(lang).meta as { ogLocale?: string }).ogLocale ?? lang;
}

export function langName(lang: Lang): string {
  return (strings(lang).meta as { name?: string }).name ?? lang;
}

/** Idiomas con prefijo (todos menos el español), para las rutas `[lang]/...`. */
export function prefixedLangs(): Lang[] {
  return LANGS.filter((l) => l !== DEFAULT_LANG);
}
