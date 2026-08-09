import type { L10n } from "./types.js";

/**
 * Resuelve una cadena localizable al idioma pedido, con fallback:
 * idioma exacto -> idioma base (es-MX -> es) -> idioma por defecto -> primera clave.
 */
export function resolveL10n(value: L10n | undefined, lang: string, defaultLang: string): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value[lang] != null) return value[lang];
  const base = lang.split("-")[0]!;
  if (value[base] != null) return value[base];
  if (value[defaultLang] != null) return value[defaultLang];
  const first = Object.keys(value)[0];
  return first != null ? (value[first] ?? "") : "";
}

/** Establece el valor de un idioma en una cadena localizable (inmutable). */
export function setL10n(value: L10n | undefined, lang: string, text: string, defaultLang: string): L10n {
  if (value == null) return { [lang]: text };
  if (typeof value === "string") {
    return lang === defaultLang ? text : { [defaultLang]: value, [lang]: text };
  }
  return { ...value, [lang]: text };
}

/** Lista los idiomas presentes en una cadena localizable. */
export function l10nLangs(value: L10n | undefined, defaultLang: string): string[] {
  if (value == null) return [];
  if (typeof value === "string") return [defaultLang];
  return Object.keys(value);
}

/**
 * Recorre un objeto arbitrario aplicando fn a cada campo L10n conocido.
 * Utilizado por la vista de traduccion y por el calculo de completitud.
 */
export interface L10nEntry {
  /** Ruta legible, p. ej. "scenes.entrada.title" */
  path: string;
  entity: string;
  entityId: string;
  field: string;
  value: L10n;
}

const SCENE_L10N_FIELDS = ["title", "description", "altText", "category"] as const;
const HOTSPOT_L10N_FIELDS = [
  "label",
  "altText",
  "tooltip",
  "body",
  "title",
  "caption",
  "text",
  "question",
  "feedbackCorrect",
  "feedbackWrong",
  "successMessage",
  "submitLabel",
  "transcript",
] as const;

export function collectL10nEntries(tour: {
  meta: { title: L10n; description?: L10n };
  scenes: {
    id: string;
    hotspots: { id: string; [k: string]: unknown }[];
    [k: string]: unknown;
  }[];
}): L10nEntry[] {
  const out: L10nEntry[] = [];
  out.push({ path: "meta.title", entity: "tour", entityId: "meta", field: "title", value: tour.meta.title });
  if (tour.meta.description != null) {
    out.push({
      path: "meta.description",
      entity: "tour",
      entityId: "meta",
      field: "description",
      value: tour.meta.description,
    });
  }
  for (const scene of tour.scenes) {
    for (const field of SCENE_L10N_FIELDS) {
      const v = (scene as Record<string, unknown>)[field];
      if (v != null && (typeof v === "string" || typeof v === "object")) {
        out.push({
          path: `scenes.${scene.id}.${field}`,
          entity: "scene",
          entityId: scene.id,
          field,
          value: v as L10n,
        });
      }
    }
    for (const hs of scene.hotspots) {
      for (const field of HOTSPOT_L10N_FIELDS) {
        const v = (hs as Record<string, unknown>)[field];
        if (v != null && (typeof v === "string" || typeof v === "object") && !Array.isArray(v)) {
          out.push({
            path: `scenes.${scene.id}.hotspots.${hs.id}.${field}`,
            entity: "hotspot",
            entityId: hs.id,
            field,
            value: v as L10n,
          });
        }
      }
    }
  }
  return out;
}

/** Porcentaje de completitud de traduccion de un idioma [0,100]. */
export function translationCompleteness(entries: L10nEntry[], lang: string): number {
  if (entries.length === 0) return 100;
  let done = 0;
  for (const e of entries) {
    if (typeof e.value === "object" && e.value[lang] != null && e.value[lang] !== "") done++;
  }
  return Math.round((done / entries.length) * 100);
}
