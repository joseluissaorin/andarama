import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { emailTokens, orgMembers, orgs, users } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { newId, newToken, nowMs, sha256Hex, slugify, dailyIpHash } from "../lib/util.js";
import { createSession, destroySession, requireAuth } from "../lib/session.js";
import { audit, clientIp, getSettings, rateLimit } from "../lib/helpers.js";
import { generateTotpSecret, totpUri, verifyTotp } from "../lib/totp.js";

const registerSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(120),
  password: z.string().min(10).max(200),
  orgName: z.string().min(1).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

export function authRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/register", async (c) => {
    const runtime = c.get("runtime");
    const db = c.get("db");
    await rateLimit(runtime.kv, `register:${clientIp(c)}`, 10, 3600);
    const body = registerSchema.parse(await c.req.json());
    const settings = await getSettings(db);
    const emailNorm = body.email.trim().toLowerCase();
    const domain = emailNorm.split("@")[1] ?? "";

    const anyUser = await db.select({ id: users.id }).from(users).limit(1);
    const isFirstUser = anyUser.length === 0;

    if (!isFirstUser) {
      if (settings.registration === "invite") {
        throw forbidden("El registro es solo por invitación");
      }
      if (settings.registration === "domain" && !settings.allowedDomains.includes(domain)) {
        throw forbidden("El registro esta limitado a dominios institucionales");
      }
    }

    const existing = await db.select().from(users).where(eq(users.email, emailNorm)).limit(1);
    if (existing.length > 0) throw conflict("Ya existe una cuenta con ese email");

    const userId = newId();
    const passwordHash = await runtime.passwords.hash(body.password);
    const emailConfigured = runtime.email.configured;
    await db.insert(users).values({
      id: userId,
      email: emailNorm,
      name: body.name.trim(),
      passwordHash,
      roleGlobal: isFirstUser ? "admin" : "user",
      emailVerified: !emailConfigured, // sin transporte de email: alta directa
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });

    // Organizacion inicial
    const orgId = newId();
    const orgName = body.orgName?.trim() ?? `${body.name.trim()}`;
    let slug = slugify(orgName);
    const slugTaken = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
    if (slugTaken.length > 0) slug = `${slug}-${newId(6).toLowerCase()}`;
    await db.insert(orgs).values({
      id: orgId,
      name: orgName,
      slug,
      quotaBytes: settings.defaultQuotaBytes,
      quotaTours: settings.defaultQuotaTours,
      settingsJson: "{}",
      createdAt: nowMs(),
    });
    await db.insert(orgMembers).values({ orgId, userId, role: "admin", createdAt: nowMs() });

    if (emailConfigured) {
      const token = newToken(24);
      await db.insert(emailTokens).values({
        id: newId(),
        userId,
        kind: "verify",
        tokenHash: await sha256Hex(token),
        expiresAt: nowMs() + 48 * 3600 * 1000,
        createdAt: nowMs(),
      });
      const url = `${c.get("config").publicUrl}/api/v1/auth/verify?token=${token}&uid=${userId}`;
      c.get("runtime").deferred(
        runtime.email.send({
          to: emailNorm,
          subject: "Verifica tu cuenta de Andarama",
          text: `Hola ${body.name}:\n\nConfirma tu cuenta de Andarama abriendo este enlace:\n${url}\n\nSi no has creado esta cuenta, ignora este mensaje.`,
        }),
      );
    }

    await createSession(c, userId, { totpOk: true, ipHash: await dailyIpHash(clientIp(c), c.get("config").secret) });
    await audit(c, "user.register", "user", userId, { firstUser: isFirstUser }, orgId);
    return c.json({ id: userId, emailVerificationPending: emailConfigured, isInstanceAdmin: isFirstUser }, 201);
  });

  r.get("/verify", async (c) => {
    const db = c.get("db");
    const token = c.req.query("token");
    const uid = c.req.query("uid");
    if (token == null || uid == null) throw badRequest("Faltan parámetros");
    const hash = await sha256Hex(token);
    const rows = await db
      .select()
      .from(emailTokens)
      .where(and(eq(emailTokens.userId, uid), eq(emailTokens.kind, "verify"), eq(emailTokens.tokenHash, hash)))
      .limit(1);
    const row = rows[0];
    if (row == null || row.expiresAt < nowMs()) throw badRequest("Enlace de verificación inválido o caducado");
    await db.update(users).set({ emailVerified: true, updatedAt: nowMs() }).where(eq(users.id, uid));
    await db.delete(emailTokens).where(eq(emailTokens.id, row.id));
    return c.redirect("/studio/?verified=1");
  });

  r.post("/login", async (c) => {
    const runtime = c.get("runtime");
    const db = c.get("db");
    const body = loginSchema.parse(await c.req.json());
    const emailNorm = body.email.trim().toLowerCase();
    await rateLimit(runtime.kv, `login:${clientIp(c)}:${emailNorm}`, 8, 900);
    const rows = await db.select().from(users).where(eq(users.email, emailNorm)).limit(1);
    const user = rows[0];
    if (user?.passwordHash == null) throw unauthorized("Credenciales invalidas");
    const ok = await runtime.passwords.verify(body.password, user.passwordHash);
    if (!ok) throw unauthorized("Credenciales invalidas");

    let totpOk = true;
    if (user.totpSecret != null) {
      if (body.totp == null || body.totp === "") {
        return c.json({ totpRequired: true }, 200);
      }
      totpOk = await verifyTotp(user.totpSecret, body.totp);
      if (!totpOk) throw unauthorized("Código de verificación incorrecto");
    }
    await createSession(c, user.id, { totpOk, ipHash: await dailyIpHash(clientIp(c), c.get("config").secret) });
    await audit(c, "user.login", "user", user.id);
    return c.json({ id: user.id, name: user.name, email: user.email });
  });

  r.post("/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  });

  r.post("/password/forgot", async (c) => {
    const runtime = c.get("runtime");
    const db = c.get("db");
    await rateLimit(runtime.kv, `forgot:${clientIp(c)}`, 5, 3600);
    const { email } = z.object({ email: z.string().email() }).parse(await c.req.json());
    const rows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    const user = rows[0];
    if (user != null && runtime.email.configured) {
      const token = newToken(24);
      await db.insert(emailTokens).values({
        id: newId(),
        userId: user.id,
        kind: "reset",
        tokenHash: await sha256Hex(token),
        expiresAt: nowMs() + 2 * 3600 * 1000,
        createdAt: nowMs(),
      });
      const url = `${c.get("config").publicUrl}/studio/reset?token=${token}&uid=${user.id}`;
      runtime.deferred(
        runtime.email.send({
          to: user.email,
          subject: "Restablecer contraseña de Andarama",
          text: `Para restablecer tu contraseña abre este enlace (caduca en 2 horas):\n${url}`,
        }),
      );
    }
    // Respuesta identica exista o no la cuenta (sin enumeracion)
    return c.json({ ok: true });
  });

  r.post("/password/reset", async (c) => {
    const runtime = c.get("runtime");
    const db = c.get("db");
    const body = z
      .object({ uid: z.string(), token: z.string(), password: z.string().min(10).max(200) })
      .parse(await c.req.json());
    const hash = await sha256Hex(body.token);
    const rows = await db
      .select()
      .from(emailTokens)
      .where(and(eq(emailTokens.userId, body.uid), eq(emailTokens.kind, "reset"), eq(emailTokens.tokenHash, hash)))
      .limit(1);
    const row = rows[0];
    if (row == null || row.expiresAt < nowMs()) throw badRequest("Enlace inválido o caducado");
    await db
      .update(users)
      .set({ passwordHash: await runtime.passwords.hash(body.password), updatedAt: nowMs() })
      .where(eq(users.id, body.uid));
    await db.delete(emailTokens).where(eq(emailTokens.id, row.id));
    await audit(c, "user.password_reset", "user", body.uid);
    return c.json({ ok: true });
  });

  // ------- OIDC SSO institucional -------

  r.get("/oidc/start", async (c) => {
    const cfg = c.get("config").oidc;
    if (cfg == null) throw notFound("SSO no configurado");
    const runtime = c.get("runtime");
    const state = newToken(16);
    const nonce = newToken(16);
    const verifier = newToken(32);
    const challengeBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...challengeBytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    await runtime.kv.put(`oidc:${state}`, JSON.stringify({ nonce, verifier }), { ttlSeconds: 600 });
    const disco = await discover(cfg.issuer);
    const url = new URL(disco.authorization_endpoint);
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("redirect_uri", `${c.get("config").publicUrl}/api/v1/auth/oidc/callback`);
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return c.redirect(url.toString());
  });

  r.get("/oidc/callback", async (c) => {
    const cfg = c.get("config").oidc;
    if (cfg == null) throw notFound("SSO no configurado");
    const runtime = c.get("runtime");
    const db = c.get("db");
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (code == null || state == null) throw badRequest("Respuesta OIDC incompleta");
    const stored = await runtime.kv.get(`oidc:${state}`);
    if (stored == null) throw badRequest("Estado OIDC inválido o caducado");
    await runtime.kv.delete(`oidc:${state}`);
    const { nonce, verifier } = JSON.parse(stored) as { nonce: string; verifier: string };

    const disco = await discover(cfg.issuer);
    const tokenRes = await fetch(disco.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${c.get("config").publicUrl}/api/v1/auth/oidc/callback`,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code_verifier: verifier,
      }),
    });
    if (!tokenRes.ok) throw badRequest(`Intercambio OIDC fallo: ${tokenRes.status}`);
    const tokens = (await tokenRes.json()) as { id_token?: string; access_token?: string };
    if (tokens.id_token == null) throw badRequest("El IdP no devolvio id_token");

    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const jwks = createRemoteJWKSet(new URL(disco.jwks_uri));
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: disco.issuer,
      audience: cfg.clientId,
    });
    if (payload.nonce !== nonce) throw badRequest("Nonce OIDC inválido");
    const email = String(payload.email ?? "").toLowerCase();
    const sub = String(payload.sub);
    const name = String(payload.name ?? payload.preferred_username ?? email.split("@")[0] ?? "Usuario");
    if (email === "") throw badRequest("El IdP no proporciono email");
    const domain = email.split("@")[1] ?? "";
    if (cfg.allowedDomains != null && cfg.allowedDomains.length > 0 && !cfg.allowedDomains.includes(domain)) {
      throw forbidden("Dominio no permitido para SSO");
    }

    // JIT: crear cuenta si no existe
    let userRow = (await db.select().from(users).where(eq(users.idpSubject, sub)).limit(1))[0];
    if (userRow == null) {
      userRow = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
      if (userRow != null) {
        await db.update(users).set({ idpSubject: sub, updatedAt: nowMs() }).where(eq(users.id, userRow.id));
      }
    }
    if (userRow == null) {
      const settings = await getSettings(db);
      const userId = newId();
      await db.insert(users).values({
        id: userId,
        email,
        name,
        idpSubject: sub,
        roleGlobal: "user",
        emailVerified: true,
        createdAt: nowMs(),
        updatedAt: nowMs(),
      });
      const orgId = newId();
      let slug = slugify(name);
      if ((await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1)).length > 0) {
        slug = `${slug}-${newId(6).toLowerCase()}`;
      }
      await db.insert(orgs).values({
        id: orgId,
        name,
        slug,
        quotaBytes: settings.defaultQuotaBytes,
        quotaTours: settings.defaultQuotaTours,
        settingsJson: "{}",
        createdAt: nowMs(),
      });
      await db.insert(orgMembers).values({ orgId, userId, role: "admin", createdAt: nowMs() });
      userRow = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]!;
    }
    await createSession(c, userRow.id, { totpOk: true, ipHash: await dailyIpHash(clientIp(c), c.get("config").secret) });
    await audit(c, "user.login_oidc", "user", userRow.id);
    return c.redirect("/studio/");
  });

  // ------- 2FA TOTP -------

  r.post("/totp/setup", async (c) => {
    const auth = requireAuth(c);
    const secret = generateTotpSecret();
    await c.get("runtime").kv.put(`totp-setup:${auth.user.id}`, secret, { ttlSeconds: 600 });
    return c.json({ secret, uri: totpUri(secret, auth.user.email, "Andarama") });
  });

  r.post("/totp/confirm", async (c) => {
    const auth = requireAuth(c);
    const { code } = z.object({ code: z.string().min(6).max(8) }).parse(await c.req.json());
    const secret = await c.get("runtime").kv.get(`totp-setup:${auth.user.id}`);
    if (secret == null) throw badRequest("No hay configuración TOTP pendiente");
    if (!(await verifyTotp(secret, code))) throw badRequest("Código incorrecto");
    await c.get("db").update(users).set({ totpSecret: secret, updatedAt: nowMs() }).where(eq(users.id, auth.user.id));
    await c.get("runtime").kv.delete(`totp-setup:${auth.user.id}`);
    await audit(c, "user.totp_enabled", "user", auth.user.id);
    return c.json({ ok: true });
  });

  r.post("/totp/disable", async (c) => {
    const auth = requireAuth(c);
    const { password } = z.object({ password: z.string() }).parse(await c.req.json());
    if (auth.user.passwordHash != null) {
      const ok = await c.get("runtime").passwords.verify(password, auth.user.passwordHash);
      if (!ok) throw unauthorized("Contraseña incorrecta");
    }
    await c.get("db").update(users).set({ totpSecret: null, updatedAt: nowMs() }).where(eq(users.id, auth.user.id));
    await audit(c, "user.totp_disabled", "user", auth.user.id);
    return c.json({ ok: true });
  });

  return r;
}

interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
}

const discoveryCache = new Map<string, OidcDiscovery>();

async function discover(issuer: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached != null) return cached;
  const res = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
  if (!res.ok) throw badRequest(`No se pudo descubrir el IdP: ${res.status}`);
  const disco = (await res.json()) as OidcDiscovery;
  discoveryCache.set(issuer, disco);
  return disco;
}
