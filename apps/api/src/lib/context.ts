import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "@andarama/db";
import type { PlatformRuntime } from "@andarama/adapters";
import type { users } from "@andarama/db";

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
  /**
   * Secreto para descargar /api/v1/admin/conversions.csv sin sesión (Google
   * Ads Data Manager lo lee como fuente HTTPS): `?token=` o cabecera
   * `x-conversions-token`. Sin él, solo con sesión o token de API de admin.
   */
  conversionsToken?: string;
  /** A quién se avisa por correo de cada solicitud de demo de la web. */
  demoNotifyTo?: string;
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
  /**
   * Instancia alojada: Clerk pone la puerta (cuentas) y la caja (planes).
   * Sin esta clave la instancia usa sus cuentas propias, que es el self-host.
   */
  clerk?: import("./clerk.js").ClerkConfig;
  /**
   * Plantillas del operador: el tour de ejemplo que se clona al dar de alta
   * y las plantillas por sector de «Nuevo proyecto» (SAMPLE_PROJECT_ID y
   * TEMPLATE_PROJECTS). Sin ellas, ni ejemplo ni sección de plantillas.
   */
  templates?: import("./templates.js").TemplatesConfig;
  /**
   * Lista blanca de administradores de la instancia (`ADMIN_EMAILS`, en
   * minúsculas). Si existe, solo estas direcciones son administradoras por
   * alta o por inicio de sesión; si no existe y la instancia no usa Clerk,
   * el primer usuario registrado administra la instancia (autoinstalación).
   */
  adminEmails?: string[];
  /** Secreto de firma (svix) del webhook de Clerk: `CLERK_WEBHOOK_SECRET`. */
  clerkWebhookSecret?: string;
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
  /** Sesión de Clerk que presentó el token (instancia alojada). */
  clerkSessionId?: string | null;
}

export interface AppEnv {
  Variables: {
    runtime: PlatformRuntime;
    db: Db;
    config: AppConfig;
    auth: AuthState | null;
    cspNonce: string;
    clerkVerifier: import("./clerk.js").ClerkVerifier | null;
  };
  Bindings: Record<string, unknown>;
}
