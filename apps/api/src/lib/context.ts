import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "@ull360/db";
import type { PlatformRuntime } from "@ull360/adapters";
import type { users } from "@ull360/db";

/**
 * Tipos del contexto de la aplicacion. La API es identica en Cloudflare y
 * Node: recibe un PlatformRuntime con adaptadores y una config de instancia.
 */

export type Db = DrizzleD1Database<typeof schema>;

export interface AppConfig {
  publicUrl: string;
  /** Secreto de instancia (HMAC de subidas, sesiones firmadas, ip hash). */
  secret: string;
  emailFrom: string;
  turnstileSiteKey?: string;
  turnstileSecret?: string;
  /** OIDC SSO institucional. */
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    /** Dominios de email con alta JIT automatica. */
    allowedDomains?: string[];
    displayName?: string;
  };
  /** Cloudflare Stream (opcional). */
  stream?: { accountId: string; apiToken: string; customerSubdomain?: string };
  /** Limite de subida en bytes. */
  maxUploadBytes: number;
}

export type UserRow = typeof users.$inferSelect;

export interface SessionInfo {
  id: string;
  userId: string;
  totpOk: boolean;
}

export interface AuthState {
  user: UserRow;
  session: SessionInfo | null;
  /** Scopes si autentico via token de API. */
  tokenScopes: string[] | null;
}

export interface AppEnv {
  Variables: {
    runtime: PlatformRuntime;
    db: Db;
    config: AppConfig;
    auth: AuthState | null;
    cspNonce: string;
  };
  Bindings: Record<string, unknown>;
}
