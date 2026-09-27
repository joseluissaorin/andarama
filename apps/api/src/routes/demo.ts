import { Hono, type Context } from "hono";
import { z } from "zod";
import { desc, eq, gte, isNotNull } from "drizzle-orm";
import { demoRequests, users } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { dailyIpHash, newId, nowMs, parseJson } from "../lib/util.js";
import { clientIp, rateLimit, verifyTurnstile } from "../lib/helpers.js";
import { isInstanceAdmin } from "../lib/authz.js";
import {
  attributionSchema,
  clickIdOf,
  collectConversions,
  conversionsCsv,
  CONVERSION_WINDOW_MS,
  type Attribution,
} from "../lib/attribution.js";

/**
 * «Pide una demo» desde la web pública (formación, universidades, museos).
 *
 * La web (andarama.com, mismo origen) manda nombre, institución, correo,
 * mensaje y la atribución de su sesión: utm_*, ruta de aterrizaje y, solo si
 * la persona aceptó el aviso de anuncios, el identificador de clic. Se
 * guarda en `demo_requests`, cuenta como conversión «Solicitud de demo» y se
 * avisa por el correo de la instancia; si no hay correo, queda en el log y
 * en el panel de administración.
 */
export const demoRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  institution: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(4000),
  /** Trampa para robots: una persona la deja vacía. */
  website: z.string().max(200).optional(),
  lang: z.string().max(10).optional(),
  source: z.string().max(40).optional(),
  page: z.string().max(500).optional(),
  attribution: attributionSchema.optional(),
  turnstileToken: z.string().max(4000).nullable().optional(),
});

export function demoPublicRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** Lo que la web necesita para pintar el formulario (Turnstile o no). */
  r.get("/public/demo/config", (c) => c.json({ turnstileSiteKey: c.get("config").turnstileSiteKey ?? null }));

  r.post("/public/demo", async (c) => {
    const db = c.get("db");
    const runtime = c.get("runtime");
    const config = c.get("config");
    await rateLimit(runtime.kv, `demo:${clientIp(c)}`, 5, 3600);
    const body = demoRequestSchema.parse(await c.req.json());
    // Un robot rellena la trampa: se le contesta igual, pero no se guarda nada
    if (body.website != null && body.website.trim() !== "") return c.json({ ok: true }, 201);
    const turnstileOk = await verifyTurnstile(config.turnstileSecret, body.turnstileToken ?? undefined, clientIp(c));
    if (!turnstileOk) throw forbidden("Verificación anti-spam fallida");

    // Sin consentimiento no se guarda identificador de clic, venga lo que venga
    const consent = body.attribution?.consent === true;
    let attribution: Attribution | null = body.attribution ?? null;
    if (attribution != null && !consent) {
      const { gclid: _g, gbraid: _b, wbraid: _w, ...resto } = attribution;
      attribution = resto;
    }
    const id = newId();
    const createdAt = nowMs();
    await db.insert(demoRequests).values({
      id,
      name: body.name,
      institution: body.institution,
      email: body.email.toLowerCase(),
      message: body.message,
      lang: body.lang ?? null,
      source: body.source ?? null,
      page: body.page ?? null,
      attributionJson: attribution != null ? JSON.stringify(attribution) : null,
      adConsent: consent,
      ipHash: await dailyIpHash(clientIp(c), config.secret),
      createdAt,
    });

    const aviso = [
      `Nueva solicitud de demo desde ${body.page ?? body.source ?? "la web"}`,
      "",
      `Nombre: ${body.name}`,
      `Institución: ${body.institution}`,
      `Correo: ${body.email}`,
      `Idioma: ${body.lang ?? "?"}`,
      `Anuncio: ${clickIdOf(attribution) != null ? "sí (con consentimiento)" : attribution?.utm_source != null ? `utm_source=${attribution.utm_source}` : "no"}`,
      "",
      body.message,
    ].join("\n");
    if (runtime.email.configured && config.demoNotifyTo != null && config.demoNotifyTo !== "") {
      const to = config.demoNotifyTo;
      runtime.deferred(
        runtime.email
          .send({ to, subject: `Demo: ${body.institution}`, text: aviso })
          .then(() => db.update(demoRequests).set({ notifiedAt: nowMs() }).where(eq(demoRequests.id, id)))
          .catch((err: unknown) => console.error("[demo] no se pudo enviar el aviso:", err)),
      );
    } else {
      // Sin correo saliente: el aviso queda en el log y en el panel de administración
      console.log(`[demo] solicitud ${id} de «${body.institution}» (${body.source ?? "web"}); sin correo configurado, véase el panel`);
    }
    return c.json({ ok: true }, 201);
  });

  return r;
}

/** Comparación en tiempo constante (para no filtrar el token por tiempos). */
function mismoSecreto(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/**
 * ¿Puede descargar las conversiones? El secreto CONVERSIONS_TOKEN (en
 * `?token=` o en la cabecera `x-conversions-token`), o una sesión o un token
 * de API de un administrador de la instancia (el token, con el permiso
 * `admin`).
 */
function puedeLeerConversiones(c: Context<AppEnv>): boolean {
  const secreto = c.get("config").conversionsToken;
  const dado = c.req.query("token") ?? c.req.header("x-conversions-token");
  if (secreto != null && secreto !== "" && dado != null && dado !== "") {
    if (mismoSecreto(dado, secreto)) return true;
    throw unauthorized("Token de conversiones incorrecto");
  }
  const auth = c.get("auth");
  if (auth == null) throw unauthorized();
  if (!isInstanceAdmin(auth.user)) throw forbidden("Solo administradores de la instancia");
  if (auth.tokenScopes != null && !auth.tokenScopes.includes("admin")) throw forbidden('El token de API no tiene el permiso "admin"');
  return true;
}

/**
 * GET /api/v1/admin/conversions.csv: el CSV de importación de clics de Google
 * Ads (Data Manager, fuente HTTPS con programación diaria) con «Prueba
 * iniciada», «Solicitud de demo» y «Pago» de los últimos noventa días. Se
 * monta antes que el resto de /admin para admitir el secreto sin sesión.
 */
export function conversionsRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get("/admin/conversions.csv", async (c) => {
    puedeLeerConversiones(c);
    const db = c.get("db");
    const now = nowMs();
    const desde = now - CONVERSION_WINDOW_MS;
    const filasUsuarios = await db.select().from(users).where(isNotNull(users.attributionJson));
    const filasDemos = await db.select().from(demoRequests).where(gte(demoRequests.createdAt, desde)).orderBy(desc(demoRequests.createdAt));
    const lista = collectConversions({
      now,
      users: filasUsuarios.map((u) => ({
        userId: u.id,
        email: u.email,
        plan: u.plan,
        planOverride: u.planOverride,
        createdAt: u.createdAt,
        planUpdatedAt: u.planUpdatedAt,
        attributedAt: u.attributedAt,
        attribution: parseJson<Attribution | null>(u.attributionJson ?? "null", null),
      })),
      demos: filasDemos.map((d) => ({
        createdAt: d.createdAt,
        adConsent: d.adConsent,
        attribution: d.attributionJson != null ? parseJson<Attribution | null>(d.attributionJson, null) : null,
      })),
    });
    return new Response(conversionsCsv(lista), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `inline; filename="conversiones-${new Date(now).toISOString().slice(0, 10)}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  });
  return r;
}
