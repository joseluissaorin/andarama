import { create } from "zustand";

/** i18n del Studio (es/en de serie; contribuible por JSON §3.5). */

import es from "./i18n/es.json";
import en from "./i18n/en.json";

const TABLES: Record<string, Record<string, string>> = { es, en };

interface I18nState {
  lang: string;
  setLang: (lang: string) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: localStorage.getItem("andarama:studio-lang") ?? (navigator.language.startsWith("en") ? "en" : "es"),
  setLang: (lang) => {
    localStorage.setItem("andarama:studio-lang", lang);
    set({ lang });
  },
}));

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const lang = useI18nStore((s) => s.lang);
  return (key, vars) => {
    let out = TABLES[lang]?.[key] ?? TABLES.es![key] ?? key;
    if (vars != null) {
      for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    }
    return out;
  };
}
