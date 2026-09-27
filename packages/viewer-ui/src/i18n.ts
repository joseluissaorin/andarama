import { matchUiLang, normalizeUiLang, type UiLang } from "@andarama/schema";
import es from "./i18n/es.json" with { type: "json" };
import en from "./i18n/en.json" with { type: "json" };

/**
 * Cadenas de la interfaz del visor. Español e inglés van en el bundle;
 * los otros 30 idiomas se cargan por import dinámico solo cuando hacen
 * falta (ensureUiLang). Idiomas fuera de la lista se pueden registrar con
 * registerUiLang() (ficheros JSON con las mismas claves que es.json).
 */
type Tabla = Record<string, string>;

const LANGS: Record<string, Tabla> = { es, en };

// Un import dinámico por idioma: esbuild y Vite hacen de cada JSON un trozo
// aparte que solo viaja cuando el visitante lo necesita.
const CARGADORES: Record<string, () => Promise<{ default: Tabla }>> = {
  ar: () => import("./i18n/ar.json", { with: { type: "json" } }),
  cs: () => import("./i18n/cs.json", { with: { type: "json" } }),
  da: () => import("./i18n/da.json", { with: { type: "json" } }),
  de: () => import("./i18n/de.json", { with: { type: "json" } }),
  el: () => import("./i18n/el.json", { with: { type: "json" } }),
  fi: () => import("./i18n/fi.json", { with: { type: "json" } }),
  fil: () => import("./i18n/fil.json", { with: { type: "json" } }),
  fr: () => import("./i18n/fr.json", { with: { type: "json" } }),
  he: () => import("./i18n/he.json", { with: { type: "json" } }),
  hr: () => import("./i18n/hr.json", { with: { type: "json" } }),
  hu: () => import("./i18n/hu.json", { with: { type: "json" } }),
  id: () => import("./i18n/id.json", { with: { type: "json" } }),
  it: () => import("./i18n/it.json", { with: { type: "json" } }),
  ja: () => import("./i18n/ja.json", { with: { type: "json" } }),
  ko: () => import("./i18n/ko.json", { with: { type: "json" } }),
  ms: () => import("./i18n/ms.json", { with: { type: "json" } }),
  nl: () => import("./i18n/nl.json", { with: { type: "json" } }),
  no: () => import("./i18n/no.json", { with: { type: "json" } }),
  pl: () => import("./i18n/pl.json", { with: { type: "json" } }),
  pt: () => import("./i18n/pt.json", { with: { type: "json" } }),
  ro: () => import("./i18n/ro.json", { with: { type: "json" } }),
  ru: () => import("./i18n/ru.json", { with: { type: "json" } }),
  sk: () => import("./i18n/sk.json", { with: { type: "json" } }),
  sv: () => import("./i18n/sv.json", { with: { type: "json" } }),
  th: () => import("./i18n/th.json", { with: { type: "json" } }),
  tr: () => import("./i18n/tr.json", { with: { type: "json" } }),
  uk: () => import("./i18n/uk.json", { with: { type: "json" } }),
  vi: () => import("./i18n/vi.json", { with: { type: "json" } }),
  "zh-Hans": () => import("./i18n/zh-Hans.json", { with: { type: "json" } }),
  "zh-Hant": () => import("./i18n/zh-Hant.json", { with: { type: "json" } }),
};

const enCurso = new Map<string, Promise<void>>();

export function registerUiLang(code: string, strings: Tabla): void {
  LANGS[code] = { ...es, ...strings };
}

/** Idiomas con diccionario ya en memoria. */
export function availableUiLangs(): string[] {
  return Object.keys(LANGS);
}

/** Idiomas que el visor sabe hablar (cargados o cargables). */
export function supportedUiLangs(): string[] {
  return [...new Set([...Object.keys(LANGS), ...Object.keys(CARGADORES)])];
}

/**
 * Idioma de interfaz que corresponde a un idioma de tour: el del tour si
 * hay diccionario para él; si no, el del navegador; si no, inglés.
 */
export function resolveUiLang(lang: string | null | undefined): string {
  if (lang != null && LANGS[lang] != null) return lang;
  const ui = normalizeUiLang(lang);
  if (ui != null && (LANGS[ui] != null || CARGADORES[ui] != null)) return ui;
  const navegador = typeof navigator !== "undefined" ? matchUiLang(navigator.languages ?? [navigator.language]) : undefined;
  return navegador ?? "en";
}

/**
 * Deja cargado el diccionario que corresponde a un idioma de tour y devuelve
 * el código efectivo. Si el fichero no llega (sin red), el traductor caerá a
 * inglés y español sin romper nada.
 */
export async function ensureUiLang(lang: string | null | undefined): Promise<string> {
  const code = resolveUiLang(lang);
  if (LANGS[code] != null) return code;
  const cargar = CARGADORES[code as UiLang];
  if (cargar == null) return code;
  let pendiente = enCurso.get(code);
  if (pendiente == null) {
    pendiente = cargar()
      .then((m) => {
        LANGS[code] = m.default;
      })
      .catch(() => {
        // Sin diccionario: se queda con la caída a inglés/español.
      })
      .finally(() => enCurso.delete(code));
    enCurso.set(code, pendiente);
  }
  await pendiente;
  return code;
}

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function createTranslator(lang: string): Translator {
  const code = resolveUiLang(lang);
  const table = LANGS[code] ?? LANGS.en!;
  return (key, vars) => {
    let out = table[key] ?? LANGS.en![key] ?? LANGS.es![key] ?? key;
    if (vars != null) {
      for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    }
    return out;
  };
}
