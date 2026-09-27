import { Hono } from "hono";
import { ZodError } from "zod";
import type { PlatformRuntime } from "@andarama/adapters";
import type { AppConfig, AppEnv, Db } from "./lib/context.js";
import { ApiError, badRequest, problem, serverError } from "./lib/errors.js";
import { checkCsrf, resolveAuth } from "./lib/session.js";
import { newToken } from "./lib/util.js";
import { authRoutes } from "./routes/auth.js";
import { orgRoutes } from "./routes/orgs.js";
import { projectRoutes } from "./routes/projects.js";
import { contentRoutes } from "./routes/content.js";
import { directUploadRoutes, mediaRoutes } from "./routes/media.js";
import { translationRoutes } from "./routes/translations.js";
import { commentRoutes } from "./routes/comments.js";
import { publishRoutes } from "./routes/publish.js";
import { tourRoutes } from "./routes/tours.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { formRoutes } from "./routes/forms.js";
import { ltiRoutes } from "./routes/lti.js";
import { adminRoutes } from "./routes/admin.js";
import { tokenRoutes } from "./routes/tokens.js";
import { liveRoutes } from "./routes/live.js";
import { aiRoutes } from "./routes/ai.js";
import { billingRoutes } from "./routes/billing.js";
import { clerkWebhookRoutes } from "./routes/clerk-webhooks.js";
import { conversionsRoutes, demoPublicRoutes } from "./routes/demo.js";
import { trialEmailRoutes } from "./routes/trial-emails.js";
import { galleryApiRoutes, galleryPageRoutes } from "./routes/gallery.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { createClerkVerifier, type ClerkVerifier } from "./lib/clerk.js";
import { effectivePlan, planCapabilities, planName } from "./lib/plans.js";
import { attributionSchema, hasAttribution } from "./lib/attribution.js";
import { openApiSpec } from "./openapi.js";

export interface CreateAppOptions {
  runtime: PlatformRuntime;
  config: AppConfig;
  /** Crea una sala de visita en vivo (DO en Cloudflare, ws en Node). */
  createLiveRoom?: () => Promise<{ code: string; guideKey: string }>;
  /** Binding de Workers AI (opcional; sugerencia de alt-text §2.11). */
  getAi?: () => { run(model: string, input: Record<string, unknown>): Promise<unknown> } | null;
  /** Verificador de tokens de Clerk (las pruebas inyectan uno falso). */
  clerkVerifier?: ClerkVerifier | null;
}

/**
 * Aplicacion Hono identica en Cloudflare Workers y Node (§5.1: el dominio
 * nunca importa APIs de plataforma; todo llega via PlatformRuntime).
 */
/**
 * ¿Permite la CSP que otro origen enmarque la página? Con `frame-ancestors`
 * distinto de `'self'` (o `'none'`), X-Frame-Options sobra y contradice.
 */
export function framingOpenedByCsp(csp: string | null): boolean {
  if (csp == null) return false;
  const m = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(csp);
  if (m == null) return false;
  const sources = m[1]!.trim().split(/\s+/).filter((s) => s !== "'self'" && s !== "'none'");
  return sources.length > 0;
}

export function createApp(opts: CreateAppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const clerkVerifier =
    opts.clerkVerifier !== undefined
      ? opts.clerkVerifier
      : opts.config.clerk != null
        ? createClerkVerifier(opts.config.clerk, opts.config.publicUrl)
        : null;

  app.use("*", async (c, next) => {
    c.set("runtime", opts.runtime);
    c.set("db", opts.runtime.db as Db);
    c.set("config", opts.config);
    c.set("clerkVerifier", clerkVerifier);
    c.set("cspNonce", newToken(12));
    await next();
    // Cabeceras de seguridad completas (§4.2)
    const csp = c.res.headers.get("content-security-policy");
    if (csp == null && (c.res.headers.get("content-type") ?? "").includes("text/html")) {
      // Solo la instancia alojada mide con Plausible; el self-host no habla con nadie
      const plausible = opts.config.clerk != null ? " https://plausible.io" : "";
      c.res.headers.set(
        "content-security-policy",
        [
          "default-src 'self'",
          `script-src 'self' 'nonce-${c.get("cspNonce")}' https://challenges.cloudflare.com${plausible}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://tile.openstreetmap.org",
          "media-src 'self' blob: data:",
          `connect-src 'self' https://tile.openstreetmap.org${plausible}`,
          // La vista previa del Studio incrusta lo mismo que el tour publicado:
          // vídeos, webs externas y los códigos de inserción servidos aquí.
          "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://challenges.cloudflare.com https:",
          "worker-src 'self' blob:",
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      );
    }
    c.res.headers.set("x-content-type-options", "nosniff");
    c.res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
    c.res.headers.set("x-frame-options", c.res.headers.get("x-frame-options") ?? "SAMEORIGIN");
    // Si la CSP abre el enmarcado (tour publicado, páginas LTI), X-Frame-Options
    // no puede decir lo contrario: el tour incrustado en Moodle llevaba
    // «SAMEORIGIN» junto a «frame-ancestors *» y dependía de que el navegador
    // diera prioridad a la CSP.
    if (framingOpenedByCsp(c.res.headers.get("content-security-policy"))) c.res.headers.delete("x-frame-options");
    if (new URL(opts.config.publicUrl).protocol === "https:") {
      c.res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    c.res.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) return problem(c, err);
    // Un cuerpo que no pasa la validación es culpa del cliente, no del servidor
    if (err instanceof ZodError) {
      return problem(c, badRequest("El cuerpo de la petición no es válido", { issues: err.issues }));
    }
    console.error("[api] error no controlado:", err);
    const debug = (c.env as Record<string, unknown> | undefined)?.DEBUG_ERRORS === "1";
    return problem(c, serverError(debug && err instanceof Error ? `${err.name}: ${err.message}` : undefined));
  });

  // Subida directa pass-through (firmada HMAC; sin sesion ni CSRF)
  app.route("/", directUploadRoutes());

  // Autenticacion + CSRF en /api
  app.use("/api/*", async (c, next) => {
    c.set("auth", await resolveAuth(c));
    checkCsrf(c);
    await next();
  });

  const api = new Hono<AppEnv>();
  api.route("/auth", authRoutes());
  api.route("/orgs", orgRoutes());
  api.route("/projects", projectRoutes());
  api.route("/projects", contentRoutes());
  api.route("/projects", translationRoutes());
  api.route("/projects", commentRoutes());
  api.route("/projects", publishRoutes());
  api.route("/media", mediaRoutes());
  api.route("/lti", ltiRoutes());
  // Antes que /admin: admite el secreto CONVERSIONS_TOKEN sin sesión
  api.route("/", conversionsRoutes());
  api.route("/admin", adminRoutes());
  api.route("/tokens", tokenRoutes());
  api.route("/live", liveRoutes(opts.createLiveRoom ?? null));
  api.route("/ai", aiRoutes(opts.getAi ?? (() => null)));
  api.route("/billing", billingRoutes());
  api.route("/me/onboarding", onboardingRoutes());
  api.route("/webhooks", clerkWebhookRoutes());
  // Galería pública: listado y ficha, sin sesión
  api.route("/gallery", galleryApiRoutes());
  api.route("/", analyticsRoutes());
  api.route("/", formRoutes());
  api.route("/", demoPublicRoutes());
  api.route("/", trialEmailRoutes());
  api.get("/openapi.json", (c) => c.json(openApiSpec(c.get("config").publicUrl)));
  api.get("/health", (c) => c.json({ ok: true, platform: opts.runtime.platform }));
  /** Lo que el Studio necesita saber antes de tener sesión: qué puerta usa la instancia. */
  api.get("/config", (c) => {
    const config = c.get("config");
    return c.json({
      auth: config.clerk != null ? "clerk" : "local",
      clerkPublishableKey: config.clerk?.publishableKey ?? null,
      sso: config.oidc != null,
      platform: opts.runtime.platform,
    });
  });
  api.get("/me", async (c) => {
    const auth = c.get("auth");
    if (auth == null) return c.json({ user: null });
    const db = c.get("db");
    const { orgMembers, orgs } = await import("@andarama/db");
    const { eq } = await import("drizzle-orm");
    const memberships = await db
      .select({ org: orgs, role: orgMembers.role })
      .from(orgMembers)
      .innerJoin(orgs, eq(orgMembers.orgId, orgs.id))
      .where(eq(orgMembers.userId, auth.user.id));
    return c.json({
      user: {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        roleGlobal: auth.user.roleGlobal,
        emailVerified: auth.user.emailVerified,
        totpEnabled: auth.user.totpSecret != null,
        ssoLinked: auth.user.idpSubject != null,
        prefs: JSON.parse(auth.user.prefsJson ?? "{}") as Record<string, unknown>,
        clerkLinked: auth.user.clerkId != null,
        createdAt: auth.user.createdAt,
      },
      orgs: memberships.map((m) => ({ id: m.org.id, name: m.org.name, slug: m.org.slug, role: m.role, ownerId: m.org.ownerId })),
      billing: (() => {
        if (c.get("config").clerk == null) {
          return { mode: "local" as const, plan: null, planName: null, capabilities: null, trialEndsAt: null, attributionPending: false };
        }
        const plan = effectivePlan(auth.user);
        return {
          mode: "clerk" as const,
          plan,
          planName: planName(plan),
          planFromClerk: auth.user.plan,
          capabilities: planCapabilities(plan),
          trialEndsAt: auth.user.trialEndsAt ?? null,
          // El Studio manda la atribución una sola vez, cuando aún no consta
          attributionPending: auth.user.attributionJson == null,
        };
      })(),
    });
  });

  /**
   * Atribución publicitaria del alta (instancia alojada): gclid, msclkid y
   * utm_* del primer toque, tal como los guardó el Studio. Se escribe una
   * sola vez; después se ignora sin error. Nunca lleva datos personales.
   */
  api.post("/me/attribution", async (c) => {
    const auth = c.get("auth");
    if (auth == null) return c.json({ error: "Sin sesión" }, 401);
    if (c.get("config").clerk == null) return c.json({ ok: false, reason: "local" });
    const body = attributionSchema.parse(await c.req.json());
    if (auth.user.attributionJson != null) return c.json({ ok: false, reason: "already" });
    if (!hasAttribution(body)) return c.json({ ok: false, reason: "empty" });
    const db = c.get("db");
    const { users } = await import("@andarama/db");
    const { and, eq, isNull } = await import("drizzle-orm");
    await db
      .update(users)
      .set({ attributionJson: JSON.stringify(body), attributedAt: Date.now(), updatedAt: Date.now() })
      .where(and(eq(users.id, auth.user.id), isNull(users.attributionJson)));
    return c.json({ ok: true });
  });

  /** Preferencias personales: idioma del editor y valores por defecto propios. */
  api.put("/me/prefs", async (c) => {
    const auth = c.get("auth");
    if (auth == null) return c.json({ error: "Sin sesión" }, 401);
    const db = c.get("db");
    const { users } = await import("@andarama/db");
    const { eq } = await import("drizzle-orm");
    const body = (await c.req.json()) as Record<string, unknown>;
    // Se mezcla con lo que ya había: cambiar el idioma no borra el resto.
    let previas: Record<string, unknown> = {};
    try {
      previas = JSON.parse(auth.user.prefsJson ?? "{}") as Record<string, unknown>;
    } catch {
      previas = {};
    }
    const prefs = {
      ...previas,
      ...(typeof body.editorLang === "string" ? { editorLang: body.editorLang } : {}),
      ...(typeof body.defaultLang === "string" ? { defaultLang: body.defaultLang } : {}),
      ...(typeof body.entryMode === "string" ? { entryMode: body.entryMode } : {}),
    };
    await db.update(users).set({ prefsJson: JSON.stringify(prefs), updatedAt: Date.now() }).where(eq(users.id, auth.user.id));
    return c.json({ ok: true, prefs });
  });

  app.route("/api/v1", api);

  // Visor publicado, ingest de analitica y sitemap (sin sesion)
  app.route("/", tourRoutes());
  // Galería pública en HTML (/explorar/), servida por el worker en el apex
  app.route("/", galleryPageRoutes());

  return app;
}
