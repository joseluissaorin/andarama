import { Hono } from "hono";
import type { PlatformRuntime } from "@andarama/adapters";
import type { AppConfig, AppEnv, Db } from "./lib/context.js";
import { ApiError, problem, serverError } from "./lib/errors.js";
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
import { openApiSpec } from "./openapi.js";

export interface CreateAppOptions {
  runtime: PlatformRuntime;
  config: AppConfig;
  /** Crea una sala de visita en vivo (DO en Cloudflare, ws en Node). */
  createLiveRoom?: () => Promise<{ code: string; guideKey: string }>;
  /** Binding de Workers AI (opcional; sugerencia de alt-text §2.11). */
  getAi?: () => { run(model: string, input: Record<string, unknown>): Promise<unknown> } | null;
}

/**
 * Aplicacion Hono identica en Cloudflare Workers y Node (§5.1: el dominio
 * nunca importa APIs de plataforma; todo llega via PlatformRuntime).
 */
export function createApp(opts: CreateAppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("runtime", opts.runtime);
    c.set("db", opts.runtime.db as Db);
    c.set("config", opts.config);
    c.set("cspNonce", newToken(12));
    await next();
    // Cabeceras de seguridad completas (§4.2)
    const csp = c.res.headers.get("content-security-policy");
    if (csp == null && (c.res.headers.get("content-type") ?? "").includes("text/html")) {
      c.res.headers.set(
        "content-security-policy",
        [
          "default-src 'self'",
          `script-src 'self' 'nonce-${c.get("cspNonce")}' https://challenges.cloudflare.com`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://tile.openstreetmap.org",
          "media-src 'self' blob: data:",
          "connect-src 'self' https://tile.openstreetmap.org",
          "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://challenges.cloudflare.com",
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
    if (new URL(opts.config.publicUrl).protocol === "https:") {
      c.res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    c.res.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) return problem(c, err);
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
  api.route("/admin", adminRoutes());
  api.route("/tokens", tokenRoutes());
  api.route("/live", liveRoutes(opts.createLiveRoom ?? null));
  api.route("/ai", aiRoutes(opts.getAi ?? (() => null)));
  api.route("/", analyticsRoutes());
  api.route("/", formRoutes());
  api.get("/openapi.json", (c) => c.json(openApiSpec(c.get("config").publicUrl)));
  api.get("/health", (c) => c.json({ ok: true, platform: opts.runtime.platform }));
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
      },
      orgs: memberships.map((m) => ({ id: m.org.id, name: m.org.name, slug: m.org.slug, role: m.role })),
    });
  });

  /** Preferencias personales: idioma del editor y valores por defecto propios. */
  api.put("/me/prefs", async (c) => {
    const auth = c.get("auth");
    if (auth == null) return c.json({ error: "Sin sesión" }, 401);
    const db = c.get("db");
    const { users } = await import("@andarama/db");
    const { eq } = await import("drizzle-orm");
    const body = (await c.req.json()) as Record<string, unknown>;
    const prefs = {
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

  return app;
}
