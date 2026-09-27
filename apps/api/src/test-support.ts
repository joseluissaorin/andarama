import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import {
  createArgon2Hasher,
  createFsStorage,
  createInProcessQueue,
  createSmtpEmail,
  createSqliteDb,
  createSqliteKv,
  createSqlAnalytics,
  migrateSqlite,
} from "@andarama/adapters/node";
import type { PlatformRuntime } from "@andarama/adapters";
import { createApp } from "./app.js";
import type { AppConfig, AppEnv, Db } from "./lib/context.js";
import type { ClerkVerifier } from "./lib/clerk.js";

/**
 * Montaje común de las pruebas de integración: la app completa sobre SQLite
 * en memoria y un directorio temporal, con la configuración que pida cada
 * prueba y, si hace falta, un verificador de Clerk falso.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../packages/db/migrations");

export interface TestInstance {
  app: Hono<AppEnv>;
  db: Db;
  runtime: PlatformRuntime;
}

export const TEST_SECRET = "test-secret";

export async function createTestInstance(
  config: Partial<AppConfig> = {},
  clerkVerifier?: ClerkVerifier,
): Promise<TestInstance> {
  const dataDir = mkdtempSync(join(tmpdir(), "anda-support-"));
  const { db, sqlite } = await createSqliteDb(":memory:");
  await migrateSqlite(sqlite, migrationsDir);
  const runtime: PlatformRuntime = {
    platform: "node",
    publicUrl: "http://localhost",
    db,
    kv: createSqliteKv(sqlite),
    storage: createFsStorage({ rootDir: join(dataDir, "storage"), hmacSecret: TEST_SECRET, publicUrl: "http://localhost" }),
    queue: createInProcessQueue(),
    analytics: createSqlAnalytics(db),
    passwords: createArgon2Hasher(),
    email: createSmtpEmail({ from: "test@localhost" }),
    deferred: (p) => {
      void p.catch(() => {});
    },
  };
  const app = createApp({
    runtime,
    config: {
      publicUrl: "http://localhost",
      secret: TEST_SECRET,
      emailFrom: "test@localhost",
      maxUploadBytes: 1024 * 1024 * 100,
      ...config,
    },
    clerkVerifier,
  });
  return { app, db: db as unknown as Db, runtime };
}

/** Verificador de Clerk falso: cada token es una persona inventada con su plan. */
export function fakeClerk(people: Record<string, { email: string; name: string; plan: string | null }>): ClerkVerifier {
  return {
    async verify(token) {
      const p = people[token];
      if (p == null) return null;
      return { sub: `user_${token}`, sid: `sess_${token}`, pla: p.plan ?? undefined };
    },
    async fetchUser(clerkId) {
      const p = people[clerkId.replace(/^user_/, "")];
      return p == null ? null : { email: p.email, name: p.name };
    },
  };
}

/** Petición con token de Clerk (Bearer): sin cookies ni CSRF. */
export function bearerCaller(app: Hono<AppEnv>) {
  return async (token: string | null, path: string, opts: { method?: string; body?: unknown } = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (token != null) headers.authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (opts.body != null) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    return app.request(`http://localhost${path}`, { method: opts.method ?? "GET", headers, body });
  };
}
