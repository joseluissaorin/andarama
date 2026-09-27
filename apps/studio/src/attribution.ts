/**
 * Atribución publicitaria: de dónde vino quien acaba dándose de alta.
 *
 * Al cargar el Studio se leen `gclid` (Google Ads), `msclkid` (Microsoft
 * Ads) y las `utm_*` de la URL (y del referente, si la landing las traía) y
 * se guardan noventa días en localStorage. El primer toque gana: una visita
 * posterior con otros parámetros no lo pisa. Al crearse la cuenta, el Studio
 * los manda una vez a `POST /api/v1/me/attribution` y los borra. Nunca se
 * guardan datos personales; solo en la instancia alojada tiene sentido.
 *
 * La web pública (andarama.com) añade a sus enlaces hacia el Studio lo que
 * guardó en su sesión: `gclid`, `gbraid`, `wbraid` y las utm solo si la
 * persona aceptó su aviso de anuncios (`consent=1`), o solo las utm si no
 * (`consent=0`), más la ruta por la que entró en la web (`landing_web`). Con
 * `consent=0` el Studio descarta cualquier identificador de clic que llegue.
 */

export const CLICK_KEYS = ["gclid", "gbraid", "wbraid", "msclkid"] as const;
export const ATTRIBUTION_KEYS = [
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

/** Lo que se saca de una URL: los parámetros, la ruta de la web y el consentimiento. */
export interface UrlAttribution extends Partial<Record<AttributionKey, string>> {
  landing_web?: string;
  consent?: boolean;
}

export interface Attribution extends UrlAttribution {
  /** Ruta (sin query) por la que entró. */
  landing?: string;
  /** Solo el host del referente. */
  referrer?: string;
  /** Epoch ms del primer toque. */
  touchedAt: number;
}

export const ATTRIBUTION_STORAGE_KEY = "andarama:atribucion";
export const ATTRIBUTION_TTL_MS = 90 * 24 * 3600 * 1000;

/** Lo que hace falta del navegador, inyectable para las pruebas. */
export interface AttributionEnv {
  href: string;
  referrer: string;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  now?: () => number;
}

/** Saca los parámetros de atribución de una URL; vacío si no trae ninguno. */
export function attributionFromUrl(url: string): UrlAttribution {
  const out: UrlAttribution = {};
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return out;
  }
  const consent = params.get("consent");
  if (consent === "1" || consent === "0") out.consent = consent === "1";
  for (const key of ATTRIBUTION_KEYS) {
    // Quien dijo que no en la web no deja identificador de clic, venga como venga
    if (out.consent === false && (CLICK_KEYS as readonly string[]).includes(key)) continue;
    const value = params.get(key)?.trim();
    if (value != null && value !== "") out[key] = value.slice(0, 200);
  }
  if (!ATTRIBUTION_KEYS.some((k) => out[k] != null)) return {};
  const landingWeb = params.get("landing_web")?.trim();
  if (landingWeb != null && landingWeb.startsWith("/")) out.landing_web = landingWeb.slice(0, 500);
  return out;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

function leer(env: AttributionEnv): Attribution | null {
  try {
    const raw = env.storage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (raw == null) return null;
    const data = JSON.parse(raw) as Attribution;
    if (typeof data.touchedAt !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Captura la atribución de esta carga. Devuelve lo que queda guardado
 * (lo nuevo si no había nada vigente; lo anterior si sigue dentro de plazo).
 */
export function captureAttribution(env: AttributionEnv): Attribution | null {
  const now = env.now?.() ?? Date.now();
  const previa = leer(env);
  if (previa != null && now - previa.touchedAt < ATTRIBUTION_TTL_MS) return previa;
  if (previa != null) env.storage.removeItem(ATTRIBUTION_STORAGE_KEY);

  // La URL del Studio manda; si viene limpio desde la landing, los
  // parámetros del referente (la landing conserva la query al enlazar)
  const propios = attributionFromUrl(env.href);
  const delReferente = attributionFromUrl(env.referrer);
  const campos = Object.keys(propios).length > 0 ? propios : delReferente;
  if (Object.keys(campos).length === 0) return null;

  let landing: string | undefined;
  try {
    landing = new URL(env.href).pathname;
  } catch {
    landing = undefined;
  }
  const nueva: Attribution = {
    ...campos,
    landing,
    referrer: hostOf(env.referrer),
    touchedAt: now,
  };
  try {
    env.storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(nueva));
  } catch {
    // almacenamiento lleno o bloqueado: se sigue sin guardar
  }
  return nueva;
}

/** La atribución vigente, si la hay y no ha caducado. */
export function pendingAttribution(env: Pick<AttributionEnv, "storage" | "now">): Attribution | null {
  const data = leer({ href: "", referrer: "", storage: env.storage, now: env.now });
  if (data == null) return null;
  const now = env.now?.() ?? Date.now();
  if (now - data.touchedAt >= ATTRIBUTION_TTL_MS) {
    env.storage.removeItem(ATTRIBUTION_STORAGE_KEY);
    return null;
  }
  return data;
}

export function clearAttribution(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    // nada que borrar
  }
}

/** Captura desde el navegador real. */
export function captureAttributionFromBrowser(): Attribution | null {
  if (typeof window === "undefined") return null;
  return captureAttribution({ href: location.href, referrer: document.referrer, storage: localStorage });
}
