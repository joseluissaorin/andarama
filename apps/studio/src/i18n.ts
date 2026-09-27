import { create } from "zustand";
import { RTL_LANGS, matchUiLang, normalizeUiLang, type UiLang } from "@andarama/schema";

/**
 * i18n del Studio. Español e inglés van en el paquete inicial; los otros 30
 * diccionarios (los mismos idiomas que las apps móviles) se cargan por import
 * dinámico solo cuando se eligen, así que el bundle no crece con ellos.
 */

import es from "./i18n/es.json";
import en from "./i18n/en.json";

type Tabla = Record<string, string>;

const TABLAS: Record<string, Tabla> = { es, en };

// Vite convierte cada JSON del glob en un trozo aparte que se pide bajo demanda.
const CARGADORES = import.meta.glob<Tabla>("./i18n/*.json", { import: "default" });

const CLAVE_LOCAL = "andarama:studio-lang";

/**
 * Idiomas que el subconjunto latino de Baloo 2 que servimos no cubre (ni
 * Latin Extended-A, ni griego, cirílico, árabe, hebreo, tailandés o CJK). En
 * ellos la interfaz usa la fuente del sistema para no mezclar dos voces.
 */
export const SYSTEM_FONT_LANGS: ReadonlySet<string> = new Set([
  "ar", "cs", "el", "he", "hr", "hu", "ja", "ko", "pl", "ro", "ru", "sk", "th", "tr", "uk", "vi", "zh-Hans", "zh-Hant",
]);

/** Idioma con el que arranca: el elegido en este navegador; si no, el del navegador; si no, inglés. */
function idiomaInicial(): UiLang {
  const guardado = normalizeUiLang(localStorage.getItem(CLAVE_LOCAL));
  if (guardado != null) return guardado;
  const candidatos = navigator.languages != null && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return matchUiLang(candidatos) ?? "en";
}

/** Atributos del documento: lang para lectores y tipografía, dir para árabe y hebreo. */
function aplicarDocumento(lang: UiLang): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
}

/** Carga (una sola vez) el diccionario de un idioma. Sin red, se queda con la caída a inglés/español. */
export async function loadLang(lang: UiLang): Promise<void> {
  if (TABLAS[lang] != null) return;
  const cargar = CARGADORES[`./i18n/${lang}.json`];
  if (cargar == null) return;
  try {
    TABLAS[lang] = await cargar();
  } catch {
    // El trozo no llegó (sin conexión): la interfaz sigue en inglés hasta el próximo cambio.
  }
}

interface I18nState {
  lang: UiLang;
  /** Sube cada vez que llega un diccionario, para que los componentes vuelvan a pintar. */
  version: number;
  setLang: (lang: string) => Promise<void>;
}

export const useI18nStore = create<I18nState>((set) => {
  const inicial = idiomaInicial();
  aplicarDocumento(inicial);
  if (TABLAS[inicial] == null) void loadLang(inicial).then(() => set((s) => ({ version: s.version + 1 })));
  return {
    lang: inicial,
    version: 0,
    setLang: async (code) => {
      const lang = normalizeUiLang(code) ?? "en";
      localStorage.setItem(CLAVE_LOCAL, lang);
      await loadLang(lang);
      aplicarDocumento(lang);
      set((s) => ({ lang, version: s.version + 1 }));
    },
  };
});

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const lang = useI18nStore((s) => s.lang);
  // Suscripción a la versión: cuando llega el diccionario, se vuelve a traducir.
  useI18nStore((s) => s.version);
  return (key, vars) => {
    let out = TABLAS[lang]?.[key] ?? TABLAS.en![key] ?? TABLAS.es![key] ?? key;
    if (vars != null) {
      for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    }
    return out;
  };
}
