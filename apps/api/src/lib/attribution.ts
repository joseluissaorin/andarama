import { z } from "zod";

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
    msclkid: campo.optional(),
    utm_source: campo.optional(),
    utm_medium: campo.optional(),
    utm_campaign: campo.optional(),
    utm_term: campo.optional(),
    /** Página por la que entró (sin query), para saber qué landing convirtió. */
    landing: z.string().trim().max(500).optional(),
    /** Referente del primer toque (solo el host). */
    referrer: z.string().trim().max(200).optional(),
    /** Cuándo se produjo el primer toque (epoch ms), según el navegador. */
    touchedAt: z.number().int().positive().optional(),
  })
  .strict();

export type Attribution = z.infer<typeof attributionSchema>;

export const ATTRIBUTION_KEYS = ["gclid", "msclkid", "utm_source", "utm_medium", "utm_campaign", "utm_term"] as const;

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
      ]
        .map(celda)
        .join(","),
    );
  }
  return `${lineas.join("\r\n")}\r\n`;
}
