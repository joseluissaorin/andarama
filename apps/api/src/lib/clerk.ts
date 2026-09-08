import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { orgMembers, orgs, users } from "@andarama/db";
import type { AppEnv, AuthState, UserRow } from "./context.js";
import { newId, nowMs, slugify } from "./util.js";
import { getSettings } from "./helpers.js";
import { planFromClaim } from "./plans.js";

/**
 * Clerk como puerta de la instancia alojada.
 *
 * El Studio manda el token de sesión de Clerk en `Authorization: Bearer`.
 * Aquí se verifica su firma, se da de alta al usuario la primera vez que
 * aparece (con su organización, de la que responde) y se copia al usuario el
 * plan que trae el token, para que la cuota de sus organizaciones se pueda
 * resolver sin tener el token del dueño a mano. El self-host no pasa por
 * aquí: sin claves de Clerk, la instancia usa sus cuentas de siempre.
 */

export interface ClerkConfig {
  publishableKey: string;
  secretKey: string;
  /** Clave pública PEM para verificar sin red (opcional). */
  jwtKey?: string;
  /** Orígenes desde los que se acepta el token (claim `azp`). */
  authorizedParties?: string[];
}

export interface ClerkClaims {
  /** Identificador del usuario en Clerk. */
  sub: string;
  sid?: string;
  /** Plan del usuario, "u:paseo". */
  pla?: string;
  fea?: string;
}

export interface ClerkVerifier {
  verify(token: string): Promise<ClerkClaims | null>;
  /** Datos del usuario, solo para darlo de alta la primera vez. */
  fetchUser(clerkId: string): Promise<{ email: string; name: string } | null>;
}

/** Orígenes que pueden presentar el token: la instancia y su subdominio de la app. */
export function defaultAuthorizedParties(publicUrl: string): string[] {
  const parties = new Set<string>();
  try {
    const u = new URL(publicUrl);
    parties.add(u.origin);
    parties.add(`${u.protocol}//app.${u.host}`);
    if (u.protocol !== "https:" || u.hostname === "localhost") {
      for (const port of ["5173", "8787", "8788"]) parties.add(`http://localhost:${port}`);
    }
  } catch {
    // publicUrl inválida: sin restricción de origen
  }
  return [...parties];
}

export function createClerkVerifier(cfg: ClerkConfig, publicUrl: string): ClerkVerifier {
  const authorizedParties = cfg.authorizedParties ?? defaultAuthorizedParties(publicUrl);
  let sdk: Promise<typeof import("@clerk/backend")> | null = null;
  const load = (): Promise<typeof import("@clerk/backend")> => (sdk ??= import("@clerk/backend"));
  return {
    async verify(token) {
      const { verifyToken } = await load();
      // Según la versión, verifyToken devuelve { data, errors } o el payload a
      // secas y lanza si el token no vale: se aceptan las dos formas.
      let payload: Record<string, unknown>;
      try {
        const result = (await verifyToken(token, {
          secretKey: cfg.secretKey,
          jwtKey: cfg.jwtKey,
          authorizedParties,
        })) as unknown as { data?: Record<string, unknown>; errors?: { message?: string }[] } & Record<string, unknown>;
        if (result.errors != null) {
          console.warn("[clerk] token rechazado:", result.errors[0]?.message ?? "");
          return null;
        }
        payload = result.data ?? result;
      } catch (err) {
        console.warn("[clerk] token rechazado:", err instanceof Error ? err.message : String(err));
        return null;
      }
      if (typeof payload.sub !== "string") return null;
      return {
        sub: payload.sub,
        sid: typeof payload.sid === "string" ? payload.sid : undefined,
        pla: typeof payload.pla === "string" ? payload.pla : undefined,
        fea: typeof payload.fea === "string" ? payload.fea : undefined,
      };
    },
    async fetchUser(clerkId) {
      const { createClerkClient } = await load();
      const client = createClerkClient({ secretKey: cfg.secretKey, publishableKey: cfg.publishableKey });
      const user = await client.users.getUser(clerkId);
      const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
      if (primary == null) return null;
      const name = [user.firstName, user.lastName].filter((s) => s != null && s !== "").join(" ").trim();
      return { email: primary.emailAddress.toLowerCase(), name: name !== "" ? name : primary.emailAddress.split("@")[0]! };
    },
  };
}

/** Resuelve la sesión a partir de un token de Clerk; null si no es válido. */
export async function resolveClerkAuth(c: Context<AppEnv>, verifier: ClerkVerifier, token: string): Promise<AuthState | null> {
  const claims = await verifier.verify(token);
  if (claims == null) return null;
  const db = c.get("db");
  const plan = planFromClaim(claims.pla);

  let user = (await db.select().from(users).where(eq(users.clerkId, claims.sub)).limit(1))[0];
  if (user == null) {
    const profile = await verifier.fetchUser(claims.sub);
    if (profile == null) return null;
    // La cuenta pudo existir antes de Clerk: se enlaza por email (Clerk ya lo verificó)
    const byEmail = (await db.select().from(users).where(eq(users.email, profile.email)).limit(1))[0];
    if (byEmail != null) {
      await db
        .update(users)
        .set({ clerkId: claims.sub, emailVerified: true, plan, planUpdatedAt: nowMs(), updatedAt: nowMs() })
        .where(eq(users.id, byEmail.id));
      user = { ...byEmail, clerkId: claims.sub, emailVerified: true, plan, planUpdatedAt: nowMs() };
    } else {
      user = await provisionUser(c, claims.sub, profile, plan);
    }
  } else if (user.plan !== plan) {
    await db.update(users).set({ plan, planUpdatedAt: nowMs(), updatedAt: nowMs() }).where(eq(users.id, user.id));
    user = { ...user, plan, planUpdatedAt: nowMs() };
  }

  return { user, session: null, tokenScopes: null, clerkSessionId: claims.sid ?? null };
}

/** Alta JIT: usuario y su organización propia (de la que responde). */
async function provisionUser(
  c: Context<AppEnv>,
  clerkId: string,
  profile: { email: string; name: string },
  plan: string | null,
): Promise<UserRow> {
  const db = c.get("db");
  const settings = await getSettings(db);
  const isFirstUser = (await db.select({ id: users.id }).from(users).limit(1)).length === 0;
  const userId = newId();
  await db.insert(users).values({
    id: userId,
    email: profile.email,
    name: profile.name,
    clerkId,
    plan,
    planUpdatedAt: nowMs(),
    roleGlobal: isFirstUser ? "admin" : "user",
    emailVerified: true,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  });
  const orgId = newId();
  let slug = slugify(profile.name);
  if (slug === "" || (await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1)).length > 0) {
    slug = `${slug || "org"}-${newId(6).toLowerCase()}`;
  }
  await db.insert(orgs).values({
    id: orgId,
    name: profile.name,
    slug,
    quotaBytes: settings.defaultQuotaBytes,
    quotaTours: settings.defaultQuotaTours,
    settingsJson: "{}",
    ownerId: userId,
    createdAt: nowMs(),
  });
  await db.insert(orgMembers).values({ orgId, userId, role: "admin", createdAt: nowMs() });
  return (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]!;
}
