/**
 * La ficha de la galería pública (andarama.com/explorar/): validación en el
 * diálogo de publicar y prerrelleno de las coordenadas a partir del tour.
 * Los límites son los mismos que impone la API (`gallerySchema`).
 */

import type { EditorSnapshot } from "../stores";

export const GALLERY_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 300, max: 600 },
  credits: { max: 1000 },
  place: { min: 2, max: 120 },
} as const;

/** Lo que el diálogo tiene en sus campos (texto tal cual, sin recortar). */
export interface GalleryForm {
  enabled: boolean;
  title: string;
  description: string;
  credits: string;
  placeName: string;
  placeCountry: string;
  lat: string;
  lng: string;
  lang: string;
}

export interface GalleryInfo {
  enabled: boolean;
  title: string | null;
  description: string | null;
  credits: string | null;
  placeName: string | null;
  placeCountry: string | null;
  lat: number | null;
  lng: number | null;
  lang: string | null;
}

export type GalleryError = "title" | "description_short" | "description_long" | "place" | "country" | "coords";

/** Errores del formulario; vacío si se puede mandar. Apagado, nunca hay errores. */
export function validateGallery(f: GalleryForm): GalleryError[] {
  if (!f.enabled) return [];
  const errores: GalleryError[] = [];
  const titulo = f.title.trim().length;
  if (titulo < GALLERY_LIMITS.title.min || titulo > GALLERY_LIMITS.title.max) errores.push("title");
  const descripcion = f.description.trim().length;
  if (descripcion < GALLERY_LIMITS.description.min) errores.push("description_short");
  else if (descripcion > GALLERY_LIMITS.description.max) errores.push("description_long");
  const lugar = f.placeName.trim().length;
  if (lugar < GALLERY_LIMITS.place.min || lugar > GALLERY_LIMITS.place.max) errores.push("place");
  if (!/^[A-Z]{2}$/.test(f.placeCountry)) errores.push("country");
  if (parseCoords(f.lat, f.lng) === "invalid") errores.push("coords");
  return errores;
}

/**
 * Coordenadas del formulario: las dos vacías es «sin coordenadas»; una sola,
 * o fuera de rango, es un error.
 */
export function parseCoords(lat: string, lng: string): { lat: number; lng: number } | null | "invalid" {
  const a = lat.trim();
  const b = lng.trim();
  if (a === "" && b === "") return null;
  if (a === "" || b === "") return "invalid";
  const la = Number(a.replace(",", "."));
  const lo = Number(b.replace(",", "."));
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return "invalid";
  return { lat: la, lng: lo };
}

/** El cuerpo que se manda a la API al publicar. */
export function galleryPayload(f: GalleryForm): Record<string, unknown> {
  if (!f.enabled) return { enabled: false };
  const coords = parseCoords(f.lat, f.lng);
  return {
    enabled: true,
    title: f.title.trim(),
    description: f.description.trim(),
    credits: f.credits.trim(),
    placeName: f.placeName.trim(),
    placeCountry: f.placeCountry,
    lang: f.lang,
    ...(coords != null && coords !== "invalid" ? { lat: coords.lat, lng: coords.lng } : {}),
  };
}

/**
 * Coordenadas que ya conoce el tour: el centro del mapa de sus ajustes o, si
 * no, la primera escena colocada sobre el mapa.
 */
export function coordsFromSnapshot(snapshot: EditorSnapshot | null): { lat: number; lng: number } | null {
  if (snapshot == null) return null;
  const geo = snapshot.settings.geoMap as { center?: { lat?: unknown; lng?: unknown } } | undefined;
  const centro = geo?.center;
  if (typeof centro?.lat === "number" && typeof centro?.lng === "number") return { lat: centro.lat, lng: centro.lng };
  for (const escena of snapshot.scenes) {
    if (escena.mapJson == null) continue;
    try {
      const mapa = JSON.parse(escena.mapJson) as { lat?: unknown; lng?: unknown };
      if (typeof mapa.lat === "number" && typeof mapa.lng === "number") return { lat: mapa.lat, lng: mapa.lng };
    } catch {
      // un mapa mal formado no impide publicar
    }
  }
  return null;
}

/** Estado inicial del formulario: lo guardado, y si no, lo que el tour ya sabe. */
export function initialGalleryForm(
  saved: GalleryInfo | null | undefined,
  snapshot: EditorSnapshot | null,
  projectTitle: string,
  defaultLang: string,
): GalleryForm {
  const coords = saved?.lat != null && saved.lng != null ? { lat: saved.lat, lng: saved.lng } : coordsFromSnapshot(snapshot);
  return {
    enabled: saved?.enabled === true,
    title: saved?.title ?? projectTitle,
    description: saved?.description ?? "",
    credits: saved?.credits ?? "",
    placeName: saved?.placeName ?? "",
    placeCountry: saved?.placeCountry ?? "",
    lat: coords != null ? String(coords.lat) : "",
    lng: coords != null ? String(coords.lng) : "",
    lang: saved?.lang ?? defaultLang,
  };
}

/**
 * Códigos ISO 3166-1 alfa-2 de los países y territorios; el nombre lo pone el
 * navegador en el idioma del editor (`Intl.DisplayNames`).
 */
export const COUNTRY_CODES: readonly string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE",
  "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD",
  "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
  "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
  "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
  "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
  "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI",
  "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK",
  "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
];

/** Países con su nombre en el idioma dado, ordenados alfabéticamente. */
export function countryOptions(lang: string): { code: string; name: string }[] {
  let nombres: Intl.DisplayNames | null = null;
  try {
    nombres = new Intl.DisplayNames([lang, "en"], { type: "region" });
  } catch {
    nombres = null;
  }
  const collator = new Intl.Collator(lang);
  return COUNTRY_CODES.map((code) => ({ code, name: nombres?.of(code) ?? code })).sort((a, b) => collator.compare(a.name, b.name));
}
