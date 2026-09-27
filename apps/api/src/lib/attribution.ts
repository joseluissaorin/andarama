import { z } from "zod";
import { isPlanSlug, PLANS } from "./plans.js";

/**
 * Atribución publicitaria de las altas en la instancia alojada.
 *
 * El Studio guarda en el primer toque los identificadores de clic (gclid de
 * Google Ads, msclkid de Microsoft Ads) y las utm_* con las que llegó la
 * persona, y los manda una sola vez al crearse la cuenta. Aquí se validan y
 * se guardan tal cual en `users.attribution_json`; nunca llevan datos
 * personales. La exportación CSV sirve para subir las conversiones (alta y
 * primer pago) a Google Ads y Microsoft Ads a mano, hasta que exista la
 * subida automática.
 */

const campo = z.string().trim().min(1).max(200);

export const attributionSchema = z
  .object({
    gclid: campo.optional(),
    /** Clic de un anuncio de Google hacia una app de iOS (web → app). */
    gbraid: campo.optional(),
    /** Clic en una app de iOS hacia la web. */
    wbraid: campo.optional(),
    msclkid: campo.optional(),
    utm_source: campo.optional(),
    utm_medium: campo.optional(),
    utm_campaign: campo.optional(),
    utm_term: campo.optional(),
    utm_content: campo.optional(),
    /** Ruta de la web pública (andarama.com) por la que entró, si vino de allí. */
    landing_web: z.string().trim().max(500).optional(),
    /**
     * Respuesta al aviso de anuncios de la web: true si dejó contárselo a
     * Google (solo entonces viajan gclid, gbraid y wbraid desde la web).
     */
    consent: z.boolean().optional(),
    /** Página por la que entró (sin query), para saber qué landing convirtió. */
    landing: z.string().trim().max(500).optional(),
    /** Referente del primer toque (solo el host). */
    referrer: z.string().trim().max(200).optional(),
    /** Cuándo se produjo el primer toque (epoch ms), según el navegador. */
    touchedAt: z.number().int().positive().optional(),
  })
  .strict();

export type Attribution = z.infer<typeof attributionSchema>;

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

/** ¿Trae algo que merezca guardarse? Sin identificador ni utm no hay atribución. */
export function hasAttribution(a: Attribution): boolean {
  return ATTRIBUTION_KEYS.some((k) => a[k] != null && a[k] !== "");
}

export interface AttributionRow {
  userId: string;
  email: string;
  plan: string | null;
  planOverride: string | null;
  createdAt: number;
  planUpdatedAt: number | null;
  attributedAt: number | null;
  attribution: Attribution | null;
}

/** Fecha con zona horaria explícita, tal como la piden las subidas de conversiones. */
function fecha(ms: number | null): string {
  if (ms == null) return "";
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
}

function celda(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * CSV con una fila por usuario. Las columnas de Google Ads y Microsoft Ads
 * llevan el nombre que esperan sus plantillas de subida (`Google Click ID`,
 * `Conversion Time`, `Microsoft Click Id`), para copiar y pegar.
 */
export function attributionCsv(rows: AttributionRow[]): string {
  const cabecera = [
    "usuario",
    "email",
    "plan",
    "plan_concedido",
    "fecha_alta",
    "fecha_primer_pago",
    "Google Click ID",
    "Microsoft Click Id",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "landing",
    "referrer",
    "fecha_primer_toque",
    "fecha_atribucion",
    "GBRAID",
    "WBRAID",
    "utm_content",
    "landing_web",
    "consentimiento_anuncios",
  ];
  const lineas = [cabecera.join(",")];
  for (const r of rows) {
    const a = r.attribution ?? {};
    // El primer pago solo cuenta si hay plan de pago: sin plan, la fecha de
    // plan_updated_at es la del alta o la de una baja, no un cobro
    const pago = r.plan != null || r.planOverride != null ? r.planUpdatedAt : null;
    lineas.push(
      [
        r.userId,
        r.email,
        r.plan ?? "",
        r.planOverride ?? "",
        fecha(r.createdAt),
        fecha(pago),
        a.gclid ?? "",
        a.msclkid ?? "",
        a.utm_source ?? "",
        a.utm_medium ?? "",
        a.utm_campaign ?? "",
        a.utm_term ?? "",
        a.landing ?? "",
        a.referrer ?? "",
        fecha(a.touchedAt ?? null),
        fecha(r.attributedAt),
        a.gbraid ?? "",
        a.wbraid ?? "",
        a.utm_content ?? "",
        a.landing_web ?? "",
        a.consent == null ? "" : a.consent ? "si" : "no",
      ]
        .map(celda)
        .join(","),
    );
  }
  return `${lineas.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// Conversiones para Google Ads (Data Manager, importación de clics)
// ---------------------------------------------------------------------------

/** Nombres de las acciones de conversión, tal como se crean en Google Ads. */
export const CONVERSION_NAMES = {
  trial: "Prueba iniciada",
  demo: "Solicitud de demo",
  payment: "Pago",
} as const;

/** Valores fijos de las conversiones que no son un cobro (plan de Ads, §3.7). */
export const CONVERSION_VALUES = {
  trial: { value: 10, currency: "EUR" },
  demo: { value: 60, currency: "EUR" },
} as const;

/** Cada subida reimporta los últimos noventa días: los errores se corrigen solos. */
export const CONVERSION_WINDOW_MS = 90 * 24 * 3600 * 1000;

export interface ClickId {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
}

export interface Conversion {
  name: string;
  /** Epoch ms. */
  time: number;
  value: number;
  currency: string;
  click: ClickId;
  /** Si la persona aceptó el aviso de anuncios (ad_user_data y ad_personalization). */
  consent: boolean;
}

export interface DemoConversionRow {
  createdAt: number;
  adConsent: boolean;
  attribution: Attribution | null;
}

/**
 * El identificador de clic de una atribución: Google pide exactamente uno
 * por fila, y el gclid manda sobre gbraid y wbraid.
 */
export function clickIdOf(a: Attribution | null | undefined): ClickId | null {
  if (a == null) return null;
  if (a.gclid != null && a.gclid !== "") return { gclid: a.gclid };
  if (a.gbraid != null && a.gbraid !== "") return { gbraid: a.gbraid };
  if (a.wbraid != null && a.wbraid !== "") return { wbraid: a.wbraid };
  return null;
}

/**
 * Las conversiones de los últimos noventa días:
 *  - «Prueba iniciada»: el alta de quien llegó con un identificador de clic
 *    (si el clic es posterior al alta, no la causó y no cuenta).
 *  - «Pago»: el plan de pago que dice Clerk (no los concedidos a mano ni por
 *    cupón), con su precio en dólares y la fecha del último cambio de plan.
 *  - «Solicitud de demo»: los formularios de la web con identificador de clic.
 * El consentimiento sale de la respuesta al aviso de la web; sin respuesta
 * (atribuciones antiguas o clics directos al Studio), se declara denegado.
 */
export function collectConversions(input: { users: AttributionRow[]; demos: DemoConversionRow[]; now?: number }): Conversion[] {
  const now = input.now ?? Date.now();
  const desde = now - CONVERSION_WINDOW_MS;
  const dentro = (t: number | null | undefined): t is number => t != null && t >= desde && t <= now;
  const out: Conversion[] = [];
  for (const u of input.users) {
    const a = u.attribution;
    const click = clickIdOf(a);
    if (a == null || click == null) continue;
    const consent = a.consent === true;
    const clicAntesDelAlta = a.touchedAt == null || a.touchedAt <= u.createdAt;
    if (clicAntesDelAlta && dentro(u.createdAt)) {
      out.push({ name: CONVERSION_NAMES.trial, time: u.createdAt, ...CONVERSION_VALUES.trial, click, consent });
    }
    const pago = u.planUpdatedAt;
    if (isPlanSlug(u.plan) && dentro(pago) && (a.touchedAt == null || a.touchedAt <= pago)) {
      out.push({ name: CONVERSION_NAMES.payment, time: pago, value: PLANS[u.plan].amountCents / 100, currency: "USD", click, consent });
    }
  }
  for (const d of input.demos) {
    const click = clickIdOf(d.attribution);
    if (click == null || !dentro(d.createdAt)) continue;
    out.push({ name: CONVERSION_NAMES.demo, time: d.createdAt, ...CONVERSION_VALUES.demo, click, consent: d.adConsent });
  }
  return out.sort((x, y) => x.time - y.time);
}

/**
 * CSV de importación de conversiones de clics de Google Ads: una columna por
 * tipo de identificador (una sola llena por fila), nombre, fecha con zona,
 * valor, moneda y las dos columnas de consentimiento (GRANTED solo para
 * quien aceptó el aviso de anuncios).
 */
export function conversionsCsv(list: Conversion[]): string {
  const cabecera = [
    "Google Click ID",
    "GBRAID",
    "WBRAID",
    "Conversion Name",
    "Conversion Time",
    "Conversion Value",
    "Conversion Currency",
    "Ad User Data",
    "Ad Personalization",
  ];
  const lineas = [cabecera.join(",")];
  for (const c of list) {
    const consentimiento = c.consent ? "GRANTED" : "DENIED";
    lineas.push(
      [c.click.gclid ?? "", c.click.gbraid ?? "", c.click.wbraid ?? "", c.name, fecha(c.time), String(c.value), c.currency, consentimiento, consentimiento]
        .map(celda)
        .join(","),
    );
  }
  return `${lineas.join("\r\n")}\r\n`;
}
