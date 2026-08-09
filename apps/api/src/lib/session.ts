import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, eq, gt } from "drizzle-orm";
import { apiTokens, sessions, users } from "@ull360/db";
import type { AppEnv, AuthState, Db } from "./context.js";
import { newToken, nowMs, parseJson, sha256Hex } from "./util.js";
import { unauthorized, forbidden } from "./errors.js";

const SESSION_COOKIE = "u3s";
const CSRF_COOKIE = "u3c";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export async function createSession(
  c: Context<AppEnv>,
  userId: string,
  opts: { totpOk: boolean; ipHash?: string },
): Promise<string> {
  const db = c.get("db");
  const id = newToken(32);
  await db.insert(sessions).values({
    id: await sha256Hex(id),
    userId,
    expiresAt: nowMs() + SESSION_TTL_MS,
    createdAt: nowMs(),
    ipHash: opts.ipHash,
    userAgent: c.req.header("user-agent")?.slice(0, 200),
    totpOk: opts.totpOk,
  });
  const secure = new URL(c.get("config").publicUrl).protocol === "https:";
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  // CSRF doble token: cookie legible por JS que el Studio refleja en cabecera.
  setCookie(c, CSRF_COOKIE, newToken(16), {
    httpOnly: false,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return id;
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw != null) {
    await c.get("db").delete(sessions).where(eq(sessions.id, await sha256Hex(raw)));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  deleteCookie(c, CSRF_COOKIE, { path: "/" });
}

/** Resuelve la autenticacion: sesion por cookie o token de API Bearer. */
export async function resolveAuth(c: Context<AppEnv>): Promise<AuthState | null> {
  const db = c.get("db");
  const bearer = c.req.header("authorization");
  if (bearer != null && bearer.startsWith("Bearer ull360_")) {
    const token = bearer.slice("Bearer ".length);
    const hash = await sha256Hex(token);
    const rows = await db.select().from(apiTokens).where(eq(apiTokens.hash, hash)).limit(1);
    const tok = rows[0];
    if (tok == null) return null;
    const userRows = await db.select().from(users).where(eq(users.id, tok.userId)).limit(1);
    const user = userRows[0];
    if (user == null) return null;
    void db.update(apiTokens).set({ lastUsedAt: nowMs() }).where(eq(apiTokens.id, tok.id)).then(
      () => {},
      () => {},
    );
    return { user, session: null, tokenScopes: parseJson<string[]>(tok.scopesJson, []) };
  }
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw == null) return null;
  const hash = await sha256Hex(raw);
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, hash), gt(sessions.expiresAt, nowMs())))
    .limit(1);
  const session = rows[0];
  if (session == null) return null;
  const userRows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = userRows[0];
  if (user == null) return null;
  return { user, session: { id: session.id, userId: session.userId, totpOk: session.totpOk }, tokenScopes: null };
}

/** CSRF de doble token para mutaciones con sesion de cookie. */
export function checkCsrf(c: Context<AppEnv>): void {
  const auth = c.get("auth");
  if (auth?.session == null) return; // tokens de API no usan cookies
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const cookie = getCookie(c, CSRF_COOKIE);
  const header = c.req.header("x-csrf-token");
  if (cookie == null || header == null || cookie !== header) {
    throw forbidden("Token CSRF invalido");
  }
}

export function requireAuth(c: Context<AppEnv>): AuthState {
  const auth = c.get("auth");
  if (auth == null) throw unauthorized();
  // Con TOTP pendiente la sesion no sirve (salvo el endpoint de verificacion)
  if (auth.session != null && auth.user.totpSecret != null && !auth.session.totpOk) {
    throw unauthorized("Verificacion en dos pasos pendiente");
  }
  return auth;
}

export function requireScope(auth: AuthState, scope: string): void {
  if (auth.tokenScopes == null) return; // sesiones tienen todos los permisos del usuario
  if (!auth.tokenScopes.includes(scope) && !auth.tokenScopes.includes("admin")) {
    throw forbidden(`El token de API no tiene el scope "${scope}"`);
  }
}

export async function purgeExpiredSessions(db: Db): Promise<void> {
  const { lt } = await import("drizzle-orm");
  await db.delete(sessions).where(lt(sessions.expiresAt, nowMs()));
}
