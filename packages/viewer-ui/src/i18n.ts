import es from "./i18n/es.json" with { type: "json" };
import en from "./i18n/en.json" with { type: "json" };

/**
 * Cadenas de la interfaz del visor. es/en de serie; idiomas adicionales
 * contribuibles registrandolos con registerUiLang() (ficheros JSON con las
 * mismas claves que es.json).
 */
const LANGS: Record<string, Record<string, string>> = { es, en };

export function registerUiLang(code: string, strings: Record<string, string>): void {
  LANGS[code] = { ...es, ...strings };
}

export function availableUiLangs(): string[] {
  return Object.keys(LANGS);
}

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function createTranslator(lang: string): Translator {
  const base = lang.split("-")[0]!;
  const table = LANGS[lang] ?? LANGS[base] ?? LANGS.es!;
  return (key, vars) => {
    let out = table[key] ?? LANGS.es![key] ?? key;
    if (vars != null) {
      for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    }
    return out;
  };
}
