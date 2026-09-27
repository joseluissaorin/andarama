/**
 * Idiomas de la interfaz de Andarama (Studio y visor): los 32 de las apps
 * móviles. Aquí viven el nombre de cada idioma en su propia lengua, la
 * dirección de escritura y la correspondencia entre lo que dice el navegador
 * (o un tour) y el código con el que se guardan los diccionarios.
 */

export const UI_LANGS = [
  "ar",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fi",
  "fil",
  "fr",
  "he",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "ms",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sv",
  "th",
  "tr",
  "uk",
  "vi",
  "zh-Hans",
  "zh-Hant",
] as const;

export type UiLang = (typeof UI_LANGS)[number];

/** Nombre de cada idioma escrito en ese mismo idioma (para los selectores). */
export const LANG_NAMES: Record<UiLang, string> = {
  ar: "العربية",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  en: "English",
  es: "Español",
  fi: "Suomi",
  fil: "Filipino",
  fr: "Français",
  he: "עברית",
  hr: "Hrvatski",
  hu: "Magyar",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  ms: "Bahasa Melayu",
  nl: "Nederlands",
  no: "Norsk",
  pl: "Polski",
  pt: "Português",
  ro: "Română",
  ru: "Русский",
  sk: "Slovenčina",
  sv: "Svenska",
  th: "ไทย",
  tr: "Türkçe",
  uk: "Українська",
  vi: "Tiếng Việt",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

/** Idiomas que se escriben de derecha a izquierda. */
export const RTL_LANGS: ReadonlySet<string> = new Set(["ar", "he"]);

/** Sinónimos y códigos antiguos que el navegador o un tour pueden traer. */
const ALIAS: Record<string, UiLang> = {
  tl: "fil",
  nb: "no",
  nn: "no",
  iw: "he",
  in: "id",
  zh: "zh-Hans",
};

/**
 * Lleva un código BCP 47 cualquiera («pt-BR», «zh-TW», «nb-NO», «ZH_HANS») al
 * código de diccionario de Andarama, o undefined si no hay diccionario.
 */
export function normalizeUiLang(code: string | null | undefined): UiLang | undefined {
  if (code == null || code === "") return undefined;
  const partes = code.replace(/_/g, "-").split("-");
  const base = partes[0]!.toLowerCase();
  const resto = partes.slice(1).map((p) => p.toLowerCase());
  if (base === "zh") {
    // Chino: la escritura decide. Taiwán, Hong Kong y Macao usan la tradicional.
    const tradicional = resto.some((p) => p === "hant" || p === "tw" || p === "hk" || p === "mo");
    return tradicional ? "zh-Hant" : "zh-Hans";
  }
  const alias = ALIAS[base];
  if (alias != null) return alias;
  return (UI_LANGS as readonly string[]).includes(base) ? (base as UiLang) : undefined;
}

/**
 * Elige el primer idioma de una lista de candidatos (por ejemplo
 * navigator.languages) que tenga diccionario. Undefined si ninguno lo tiene.
 */
export function matchUiLang(candidates: readonly (string | null | undefined)[]): UiLang | undefined {
  for (const c of candidates) {
    const lang = normalizeUiLang(c);
    if (lang != null) return lang;
  }
  return undefined;
}

/**
 * Nombre de un idioma en su propia lengua. Para los 31 de la interfaz sale de
 * la tabla; para cualquier otro código (un tour puede llevar los que quiera)
 * se le pregunta al navegador y, si tampoco lo sabe, se muestra el código.
 */
export function langNativeName(code: string): string {
  const ui = normalizeUiLang(code);
  if (ui != null) return LANG_NAMES[ui];
  try {
    // fallback "none": si el navegador no conoce el código devuelve undefined
    // en vez de devolverlo maquillado («Xx (YY)»).
    const nombre = new Intl.DisplayNames([code], { type: "language", fallback: "none" }).of(code);
    if (nombre != null && nombre.toLowerCase() !== code.toLowerCase()) return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  } catch {
    // Código raro o navegador sin Intl.DisplayNames: se cae al código.
  }
  return code.toUpperCase();
}

/** Dirección de escritura de un idioma (para el atributo dir). */
export function langDir(code: string): "rtl" | "ltr" {
  const ui = normalizeUiLang(code);
  return ui != null && RTL_LANGS.has(ui) ? "rtl" : "ltr";
}
