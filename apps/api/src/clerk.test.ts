import { beforeAll, describe, expect, it } from "vitest";
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
import type { AppEnv } from "./lib/context.js";
import type { ClerkVerifier } from "./lib/clerk.js";

/**
 * La instancia alojada: Clerk pone la puerta y el plan del token fija la
 * cuota. El verificador es falso (no hay red): cada token es el nombre de un
 * usuario inventado y su plan.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../packages/db/migrations");

interface FakeUser {
  email: string;
  name: string;
  plan: string | null;
}

const people: Record<string, FakeUser> = {
  "tok-ana": { email: "ana@ejemplo.es", name: "Ana Pérez", plan: "u:andar" },
  "tok-bruno": { email: "bruno@ejemplo.es", name: "Bruno", plan: "u:free_user" },
  "tok-clara": { email: "clara@ejemplo.es", name: "Clara", plan: "u:paseo" },
};

const verifier: ClerkVerifier = {
  async verify(token) {
    const p = people[token];
    if (p == null) return null;
    return { sub: `user_${token}`, sid: `sess_${token}`, pla: p.plan ?? undefined };
  },
  async fetchUser(clerkId) {
    const token = clerkId.replace(/^user_/, "");
    const p = people[token];
    return p == null ? null : { email: p.email, name: p.name };
  },
};

let app: Hono<AppEnv>;

async function call(token: string | null, path: string, opts: { method?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token != null) headers.authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (opts.body != null) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return app.request(`http://localhost${path}`, { method: opts.method ?? "GET", headers, body });
}

beforeAll(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "anda-clerk-"));
  const { db, sqlite } = await createSqliteDb(":memory:");
  await migrateSqlite(sqlite, migrationsDir);
  const runtime: PlatformRuntime = {
    platform: "node",
    publicUrl: "http://localhost",
    db,
    kv: createSqliteKv(sqlite),
    storage: createFsStorage({ rootDir: join(dataDir, "storage"), hmacSecret: "test-secret", publicUrl: "http://localhost" }),
    queue: createInProcessQueue(),
    analytics: createSqlAnalytics(db),
    passwords: createArgon2Hasher(),
    email: createSmtpEmail({ from: "test@localhost" }),
    deferred: (p) => {
      void p.catch(() => {});
    },
  };
  app = createApp({
    runtime,
    config: {
      publicUrl: "http://localhost",
      secret: "test-secret",
      emailFrom: "test@localhost",
      maxUploadBytes: 1024 * 1024 * 100,
      clerk: { publishableKey: "pk_test_x", secretKey: "sk_test_x" },
    },
    clerkVerifier: verifier,
  });
});

describe("instancia alojada con Clerk", () => {
  it("anuncia la puerta y el catálogo de planes", async () => {
    const cfg = (await (await call(null, "/api/v1/config")).json()) as { auth: string; clerkPublishableKey: string };
    expect(cfg.auth).toBe("clerk");
    expect(cfg.clerkPublishableKey).toBe("pk_test_x");
    const plans = (await (await call(null, "/api/v1/billing/plans")).json()) as { mode: string; plans: { slug: string }[] };
    expect(plans.mode).toBe("clerk");
    expect(plans.plans.map((p) => p.slug)).toEqual(["andar", "paseo", "excursion", "vitalicio"]);
  });

  it("cierra el registro y el inicio de sesión propios", async () => {
    const reg = await call(null, "/api/v1/auth/register", {
      method: "POST",
      body: { email: "x@y.z", name: "X", password: "password-larga-1" },
    });
    expect(reg.status).toBe(404);
    expect((await call(null, "/api/v1/auth/login", { method: "POST", body: { email: "x@y.z", password: "p" } })).status).toBe(404);
  });

  it("rechaza tokens desconocidos y no exige CSRF con Bearer", async () => {
    expect((await call("tok-nadie", "/api/v1/me")).status).toBe(200);
    const me = (await (await call("tok-nadie", "/api/v1/me")).json()) as { user: unknown };
    expect(me.user).toBeNull();
  });

  it("da de alta al usuario la primera vez, con su organización y su plan", async () => {
    // La primera persona que entra administra la instancia: no paga
    const first = (await (await call("tok-bruno", "/api/v1/me")).json()) as {
      user: { email: string; roleGlobal: string };
      orgs: { id: string; ownerId: string }[];
      billing: { mode: string; plan: string | null };
    };
    expect(first.user.email).toBe("bruno@ejemplo.es");
    expect(first.user.roleGlobal).toBe("admin");
    expect(first.orgs).toHaveLength(1);
    expect(first.billing).toEqual({ mode: "clerk", plan: null, planName: null });

    const me = (await (await call("tok-ana", "/api/v1/me")).json()) as {
      user: { email: string; name: string; roleGlobal: string; clerkLinked: boolean };
      orgs: { id: string; role: string; ownerId: string }[];
      billing: { mode: string; plan: string | null; planName: string | null };
    };
    expect(me.user).toMatchObject({ email: "ana@ejemplo.es", name: "Ana Pérez", roleGlobal: "user", clerkLinked: true });
    expect(me.orgs).toHaveLength(1);
    expect(me.orgs[0]!.role).toBe("admin");
    expect(me.billing).toEqual({ mode: "clerk", plan: "andar", planName: "Andar" });
  });

  it("acuña una cookie de lectura a cambio del token, válida solo para GET", async () => {
    const res = await call("tok-ana", "/api/v1/auth/clerk/session", { method: "POST", body: {} });
    expect(res.status).toBe(200);
    const jar = (res.headers.getSetCookie?.() ?? []).map((sc) => sc.split(";")[0]!).join("; ");
    expect(jar).toContain("u3s=");
    // Con la cookie sola se lee (miniaturas, tiles, descargas)...
    const me = await app.request("http://localhost/api/v1/me", { headers: { cookie: jar } });
    expect(((await me.json()) as { user: { email: string } | null }).user?.email).toBe("ana@ejemplo.es");
    // ...pero no se escribe: las mutaciones exigen el token de Clerk
    const csrf = jar.match(/u3c=([^;]+)/)?.[1] ?? "";
    const orgs = (await (await call("tok-ana", "/api/v1/me")).json()) as { orgs: { id: string }[] };
    const post = await app.request("http://localhost/api/v1/projects", {
      method: "POST",
      headers: { cookie: jar, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ orgId: orgs.orgs[0]!.id, title: "Con cookie" }),
    });
    expect(post.status).toBe(401);
    // Sin token de Clerk no hay cookie
    expect((await call(null, "/api/v1/auth/clerk/session", { method: "POST", body: {} })).status).toBe(401);
  });

  it("el plan Andar permite un recorrido y ni uno más", async () => {
    const me = (await (await call("tok-ana", "/api/v1/me")).json()) as { orgs: { id: string }[] };
    const orgId = me.orgs[0]!.id;
    const usage = (await (await call("tok-ana", `/api/v1/orgs/${orgId}/usage`)).json()) as { quotaTours: number; plan: string; fromPlan: boolean };
    expect(usage).toMatchObject({ quotaTours: 1, plan: "andar", fromPlan: true });

    const first = await call("tok-ana", "/api/v1/projects", { method: "POST", body: { orgId, title: "Mi casa" } });
    expect(first.status).toBe(201);
    const second = await call("tok-ana", "/api/v1/projects", { method: "POST", body: { orgId, title: "Otra" } });
    expect(second.status).toBe(403);
    const problem = (await second.json()) as { code: string; plan: string; limit: number };
    expect(problem).toMatchObject({ code: "quota_tours", plan: "andar", limit: 1 });

    // Duplicar cuenta igual que crear
    const { id } = (await first.clone().json()) as { id: string };
    const dup = await call("tok-ana", `/api/v1/projects/${id}/duplicate`, { method: "POST", body: {} });
    expect(dup.status).toBe(403);
  });

  it("el administrador de la instancia conserva la cuota fijada en su organización", async () => {
    const me = (await (await call("tok-bruno", "/api/v1/me")).json()) as { orgs: { id: string }[] };
    const orgId = me.orgs[0]!.id;
    const usage = (await (await call("tok-bruno", `/api/v1/orgs/${orgId}/usage`)).json()) as { quotaTours: number; fromPlan: boolean };
    expect(usage.fromPlan).toBe(false);
    expect(usage.quotaTours).toBe(100);
    const res = await call("tok-bruno", "/api/v1/projects", { method: "POST", body: { orgId, title: "Demo" } });
    expect(res.status).toBe(201);
  });

  it("un cambio de plan en Clerk se refleja en la siguiente petición", async () => {
    people["tok-ana"]!.plan = "u:paseo";
    const me = (await (await call("tok-ana", "/api/v1/me")).json()) as { orgs: { id: string }[]; billing: { plan: string } };
    expect(me.billing.plan).toBe("paseo");
    const usage = (await (await call("tok-ana", `/api/v1/orgs/${me.orgs[0]!.id}/usage`)).json()) as { quotaTours: number };
    expect(usage.quotaTours).toBe(10);
  });

  it("el plan concedido a mano manda sobre Clerk", async () => {
    const clara = (await (await call("tok-clara", "/api/v1/me")).json()) as { user: { id: string }; orgs: { id: string }[] };
    const patch = await call("tok-bruno", `/api/v1/admin/users/${clara.user.id}`, { method: "PATCH", body: { planOverride: "vitalicio" } });
    expect(patch.status).toBe(200);
    const billing = (await (await call("tok-clara", "/api/v1/billing/me")).json()) as { plan: string; planOverride: string; quota: { quotaTours: number } };
    expect(billing).toMatchObject({ plan: "vitalicio", planOverride: "vitalicio", quota: { quotaTours: 1000 } });
  });

  it("sin plan de pago no se puede crear ningún recorrido", async () => {
    people["tok-clara"]!.plan = "u:free_user";
    const clara = (await (await call("tok-clara", "/api/v1/me")).json()) as { user: { id: string }; orgs: { id: string }[] };
    await call("tok-bruno", `/api/v1/admin/users/${clara.user.id}`, { method: "PATCH", body: { planOverride: null } });
    const res = await call("tok-clara", "/api/v1/projects", { method: "POST", body: { orgId: clara.orgs[0]!.id, title: "Nada" } });
    expect(res.status).toBe(403);
    const problem = (await res.json()) as { code: string; plan: string | null; limit: number };
    expect(problem).toMatchObject({ code: "quota_tours", plan: null, limit: 0 });
  });
});
