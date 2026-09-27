/**
 * Atribución de anuncios en la web pública, con consentimiento (D3).
 *
 * Quien llega sin parámetros de anuncio no ve nada: no hay banner general
 * porque no hay cookies. Quien llega con `gclid`, `gbraid`, `wbraid` o
 * alguna `utm_*` ve un aviso mínimo: «¿Nos dejas contárselo a Google?».
 *
 *  - Con «Sí» se guardan en `sessionStorage` los identificadores de clic, las
 *    utm y la ruta de aterrizaje, con `consent: true`.
 *  - Con «No» solo las utm (que no identifican a nadie) y la ruta, con
 *    `consent: false`; el identificador de clic se descarta.
 *
 * Lo guardado se añade a todos los enlaces hacia app.andarama.com (el Studio
 * lo recoge al darse de alta, `apps/studio/src/attribution.ts`) y viaja con
 * el formulario de demo. Nada sale hacia Google desde el navegador: la
 * conversión la sube el servidor, y solo con `consent: true`.
 *
 * Funciones puras y un par de envoltorios del navegador, para poder probar
 * la lógica sin DOM.
 */

export const CLAVES_CLIC = ["gclid", "gbraid", "wbraid"] as const;
export const CLAVES_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export type ClaveClic = (typeof CLAVES_CLIC)[number];
export type ClaveUtm = (typeof CLAVES_UTM)[number];

/** Dónde se guarda (solo durante la sesión de la pestaña). */
export const CLAVE_ALMACEN = "andarama:atribucion";
export const CLAVE_DECISION = "andarama:anuncio-consentimiento";

/** El host del Studio: los enlaces hacia él llevan la atribución. */
export const HOST_APP = "app.andarama.com";

export type Decision = "si" | "no";

export interface ParametrosAnuncio {
  clic: Partial<Record<ClaveClic, string>>;
  utm: Partial<Record<ClaveUtm, string>>;
}

export interface AtribucionWeb extends Partial<Record<ClaveClic | ClaveUtm, string>> {
  /** Ruta de la web por la que entró (sin query). */
  landing_web?: string;
  /** Si aceptó el aviso; ausente mientras no ha contestado. */
  consent?: boolean;
}

function limpio(v: string | null): string | undefined {
  const s = v?.trim();
  return s == null || s === "" ? undefined : s.slice(0, 200);
}

/** Los parámetros de anuncio de una query («?gclid=…&utm_source=…»). */
export function parametrosDeUrl(search: string): ParametrosAnuncio {
  const q = new URLSearchParams(search);
  const clic: ParametrosAnuncio["clic"] = {};
  const utm: ParametrosAnuncio["utm"] = {};
  for (const k of CLAVES_CLIC) {
    const v = limpio(q.get(k));
    if (v != null) clic[k] = v;
  }
  for (const k of CLAVES_UTM) {
    const v = limpio(q.get(k));
    if (v != null) utm[k] = v;
  }
  return { clic, utm };
}

/** ¿Trae la URL algo de anuncio o de campaña? Solo entonces se pregunta. */
export function traeAnuncio(p: ParametrosAnuncio): boolean {
  return Object.keys(p.clic).length > 0 || Object.keys(p.utm).length > 0;
}

/**
 * Lo que se guarda según la decisión. Sin decisión (`null`), lo mismo que
 * con «No» pero sin marcar el consentimiento: mientras no contesta, los
 * enlaces solo llevan las utm.
 */
export function construir(p: ParametrosAnuncio, decision: Decision | null, landing: string): AtribucionWeb {
  const base: AtribucionWeb = { ...p.utm, landing_web: landing.slice(0, 500) };
  if (decision === "si") return { ...p.clic, ...base, consent: true };
  if (decision === "no") return { ...base, consent: false };
  return base;
}

/** Los parámetros que viajan en la URL hacia el Studio. */
export function parametrosParaApp(a: AtribucionWeb): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of [...CLAVES_CLIC, ...CLAVES_UTM]) {
    const v = a[k];
    if (v != null && v !== "") out[k] = v;
  }
  if (a.landing_web != null && a.landing_web !== "") out.landing_web = a.landing_web;
  if (a.consent != null) out.consent = a.consent ? "1" : "0";
  return out;
}

/**
 * Añade los parámetros a un enlace si va al Studio. No pisa lo que el enlace
 * ya traiga (por ejemplo, `?plan=`).
 */
export function decorarHref(href: string, params: Record<string, string>): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (url.host !== HOST_APP || Object.keys(params).length === 0) return href;
  for (const [k, v] of Object.entries(params)) {
    if (!url.searchParams.has(k)) url.searchParams.set(k, v);
  }
  return url.toString();
}

/** Lee lo guardado en la sesión, si lo hay. */
export function leerAtribucion(storage: Pick<Storage, "getItem">): AtribucionWeb | null {
  try {
    const raw = storage.getItem(CLAVE_ALMACEN);
    if (raw == null) return null;
    const data = JSON.parse(raw) as unknown;
    return data != null && typeof data === "object" ? (data as AtribucionWeb) : null;
  } catch {
    return null;
  }
}

export function guardarAtribucion(storage: Pick<Storage, "setItem">, a: AtribucionWeb): void {
  try {
    storage.setItem(CLAVE_ALMACEN, JSON.stringify(a));
  } catch {
    // almacenamiento bloqueado: se sigue sin guardar
  }
}

export function leerDecision(storage: Pick<Storage, "getItem">): Decision | null {
  try {
    const v = storage.getItem(CLAVE_DECISION);
    return v === "si" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

export function guardarDecision(storage: Pick<Storage, "setItem">, d: Decision): void {
  try {
    storage.setItem(CLAVE_DECISION, d);
  } catch {
    // nada
  }
}
