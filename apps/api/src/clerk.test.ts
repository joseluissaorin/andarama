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
import type { AppEnv, Db } from "./lib/context.js";
import { parseAdminEmails } from "./lib/admins.js";
import { auditLog, media, users } from "@andarama/db";
import { eq } from "drizzle-orm";
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
  // Dani llega sin plan: catorce días de prueba
  "tok-dani": { email: "dani@ejemplo.es", name: "Dani", plan: null },
  "tok-eva": { email: "eva@ejemplo.es", name: "Eva", plan: "u:formacion" },
  // Fede ya tenía cuenta de antes y figura en ADMIN_EMAILS
  "tok-fede": { email: "fede@ejemplo.es", name: "Fede", plan: null },
  "tok-gabi": { email: "gabi@ejemplo.es", name: "Gabi", plan: "u:andar" },
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
let db: Db;

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
  const created = await createSqliteDb(":memory:");
  const sqlite = created.sqlite;
  db = created.db as unknown as Db;
  await migrateSqlite(sqlite, migrationsDir);
  const runtime: PlatformRuntime = {
    platform: "node",
    publicUrl: "http://localhost",
    db: created.db,
    kv: createSqliteKv(sqlite),
    storage: createFsStorage({ rootDir: join(dataDir, "storage"), hmacSecret: "test-secret", publicUrl: "http://localhost" }),
    queue: createInProcessQueue(),
    analytics: createSqlAnalytics(created.db),
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
      conversionsToken: "secreto-de-conversiones",
      // Sin distinguir mayúsculas y con espacios, como se escribe a mano
      adminEmails: parseAdminEmails(" Bruno@Ejemplo.es , fede@ejemplo.es"),
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
    expect(plans.plans.map((p) => p.slug)).toEqual(["andar", "aula", "paseo", "excursion", "formacion", "vitalicio"]);
    expect((plans as unknown as { trial: { days: number } }).trial.days).toBe(14);
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
    // Bruno está en ADMIN_EMAILS: administra la instancia y no paga
    const first = (await (await call("tok-bruno", "/api/v1/me")).json()) as {
      user: { email: string; roleGlobal: string };
      orgs: { id: string; ownerId: string }[];
      billing: { mode: string; plan: string | null };
    };
    expect(first.user.email).toBe("bruno@ejemplo.es");
    expect(first.user.roleGlobal).toBe("admin");
    expect(first.orgs).toHaveLength(1);
    expect(first.billing).toMatchObject({ mode: "clerk", plan: null, planName: null, trialEndsAt: null });

    const me = (await (await call("tok-ana", "/api/v1/me")).json()) as {
      user: { email: string; name: string; roleGlobal: string; clerkLinked: boolean };
      orgs: { id: string; role: string; ownerId: string }[];
      billing: { mode: string; plan: string | null; planName: string | null };
    };
    expect(me.user).toMatchObject({ email: "ana@ejemplo.es", name: "Ana Pérez", roleGlobal: "user", clerkLinked: true });
    expect(me.orgs).toHaveLength(1);
    expect(me.orgs[0]!.role).toBe("admin");
    expect(me.billing).toMatchObject({ mode: "clerk", plan: "andar", planName: "Andar", capabilities: [], attributionPending: true });
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

  it("una tanda de cupones se genera, se canjea una sola vez y no rebaja a nadie", async () => {
    // Solo el administrador de la instancia los genera
    expect((await call("tok-ana", "/api/v1/admin/coupons", { method: "POST", body: { count: 2 } })).status).toBe(403);

    const res = await call("tok-bruno", "/api/v1/admin/coupons", {
      method: "POST",
      body: { count: 3, plan: "vitalicio", batch: "lanzamiento", note: "Primeros cien" },
    });
    expect(res.status).toBe(201);
    const { codes } = (await res.json()) as { codes: string[] };
    expect(codes).toHaveLength(3);
    expect(new Set(codes).size).toBe(3);
    for (const code of codes) expect(code).toMatch(/^ANDA-[ACDEFGHJKMNPQRTUVWXY2346789]{4}-[ACDEFGHJKMNPQRTUVWXY2346789]{4}$/);

    // Ana tiene Paseo por Clerk: el cupón la sube a De por vida
    const canje = await call("tok-ana", "/api/v1/billing/coupon", { method: "POST", body: { code: codes[0]! } });
    expect(canje.status).toBe(200);
    expect(await canje.json()).toMatchObject({ plan: "vitalicio", planName: "De por vida", keptPrevious: false, previousPlan: "paseo" });
    const billing = (await (await call("tok-ana", "/api/v1/billing/me")).json()) as { plan: string; quota: { quotaTours: number } };
    expect(billing).toMatchObject({ plan: "vitalicio", quota: { quotaTours: 1000 } });

    // Un cupón, un uso: ni ella ni nadie lo repite
    expect((await call("tok-ana", "/api/v1/billing/coupon", { method: "POST", body: { code: codes[0]! } })).status).toBe(409);
    expect((await call("tok-clara", "/api/v1/billing/coupon", { method: "POST", body: { code: codes[0]! } })).status).toBe(409);

    // Se acepta tecleado a mano: minúsculas, espacios y sin el prefijo
    const suelto = codes[1]!.replace("ANDA-", "").toLowerCase().replace("-", " ");
    expect((await call("tok-clara", "/api/v1/billing/coupon", { method: "POST", body: { code: suelto } })).status).toBe(200);

    // Un cupón menor no rebaja a quien ya tiene uno mejor, pero se gasta
    const menores = (await (await call("tok-bruno", "/api/v1/admin/coupons", {
      method: "POST",
      body: { count: 1, plan: "andar" },
    })).json()) as { codes: string[] };
    const bajada = await call("tok-ana", "/api/v1/billing/coupon", { method: "POST", body: { code: menores.codes[0]! } });
    expect(await bajada.json()).toMatchObject({ plan: "andar", keptPrevious: true, previousPlan: "vitalicio" });
    const tras = (await (await call("tok-ana", "/api/v1/billing/me")).json()) as { plan: string };
    expect(tras.plan).toBe("vitalicio");

    // Un código inventado no existe
    expect((await call("tok-ana", "/api/v1/billing/coupon", { method: "POST", body: { code: "ANDA-XXXX-XXXX" } })).status).toBe(404);

    // El listado del panel cuenta lo canjeado y el sin canjear se puede retirar
    const lista = (await (await call("tok-bruno", "/api/v1/admin/coupons?batch=lanzamiento")).json()) as {
      total: number;
      redeemed: number;
      coupons: { code: string; email: string | null }[];
    };
    expect(lista).toMatchObject({ total: 3, redeemed: 2 });
    expect(lista.coupons.find((x) => x.code === codes[0])?.email).toBe("ana@ejemplo.es");
    expect((await call("tok-bruno", `/api/v1/admin/coupons/${codes[2]!}`, { method: "DELETE" })).status).toBe(200);
    expect((await call("tok-bruno", `/api/v1/admin/coupons/${codes[0]!}`, { method: "DELETE" })).status).toBe(409);
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

  /** Un proyecto con una escena, lo mínimo que se puede publicar. */
  async function publicar(token: string, orgId: string, title: string): Promise<{ projectId: string; slug: string }> {
    const creado = await call(token, "/api/v1/projects", { method: "POST", body: { orgId, title } });
    expect(creado.status).toBe(201);
    const { id } = (await creado.json()) as { id: string };
    const escena = await call(token, `/api/v1/projects/${id}/scenes`, {
      method: "POST",
      body: { title: "Entrada", sourceJson: { kind: "equirect", url: "media:falso" } },
    });
    const sceneId = ((await escena.json()) as { id: string }).id;
    await call(token, `/api/v1/projects/${id}/scenes/${sceneId}`, { method: "PATCH", body: { meta: { altText: "Entrada" } } });
    const pub = await call(token, `/api/v1/projects/${id}/publish`, { method: "POST", body: { visibility: "public" } });
    expect(pub.status).toBe(201);
    return { projectId: id, slug: ((await pub.json()) as { slug: string }).slug };
  }

  it("quien llega sin plan tiene catorce días de prueba: un recorrido, y lo creado se conserva al caducar", async () => {
    const dani = (await (await call("tok-dani", "/api/v1/me")).json()) as {
      user: { id: string };
      orgs: { id: string }[];
      billing: { plan: string; planName: string; trialEndsAt: number };
    };
    expect(dani.billing.plan).toBe("prueba");
    expect(dani.billing.planName).toBe("Prueba gratuita");
    expect(dani.billing.trialEndsAt).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    const billing = (await (await call("tok-dani", "/api/v1/billing/me")).json()) as {
      plan: string;
      trialDaysLeft: number;
      quota: { quotaTours: number; quotaBytes: number };
      capabilities: string[];
    };
    expect(billing).toMatchObject({ plan: "prueba", trialDaysLeft: 14, quota: { quotaTours: 1, quotaBytes: 500 * 1024 * 1024 }, capabilities: [] });

    const orgId = dani.orgs[0]!.id;
    const uno = await call("tok-dani", "/api/v1/projects", { method: "POST", body: { orgId, title: "En prueba" } });
    expect(uno.status).toBe(201);
    const dos = await call("tok-dani", "/api/v1/projects", { method: "POST", body: { orgId, title: "Otro" } });
    expect(dos.status).toBe(403);
    expect(await dos.json()).toMatchObject({ code: "quota_tours", plan: "prueba", limit: 1 });

    // Caduca la prueba: cuota cero, pero el recorrido sigue ahí
    const patch = await call("tok-bruno", `/api/v1/admin/users/${dani.user.id}`, { method: "PATCH", body: { trialEndsAt: Date.now() - 1000 } });
    expect(patch.status).toBe(200);
    const tras = (await (await call("tok-dani", "/api/v1/billing/me")).json()) as { plan: string | null; trialDaysLeft: number; quota: { quotaTours: number } };
    expect(tras).toMatchObject({ plan: null, trialDaysLeft: 0, quota: { quotaTours: 0 } });
    const lista = (await (await call("tok-dani", `/api/v1/projects?org=${orgId}`)).json()) as { title: string }[];
    expect(lista.some((p) => p.title === "En prueba")).toBe(true);

    // Un cupón en prueba (o tras ella) siempre mejora: la prueba no es un plan previo
    await call("tok-bruno", `/api/v1/admin/users/${dani.user.id}`, { method: "PATCH", body: { trialEndsAt: Date.now() + 86_400_000 } });
    const { codes } = (await (await call("tok-bruno", "/api/v1/admin/coupons", { method: "POST", body: { count: 1, plan: "andar" } })).json()) as { codes: string[] };
    const canje = await call("tok-dani", "/api/v1/billing/coupon", { method: "POST", body: { code: codes[0]! } });
    expect(await canje.json()).toMatchObject({ plan: "andar", keptPrevious: false, previousPlan: null });
    // Vuelta a la prueba para las pruebas siguientes
    await call("tok-bruno", `/api/v1/admin/users/${dani.user.id}`, { method: "PATCH", body: { planOverride: null } });
  });

  it("guarda la atribución del alta una sola vez y la exporta en CSV para el administrador", async () => {
    const antes = (await (await call("tok-dani", "/api/v1/me")).json()) as { billing: { attributionPending: boolean } };
    expect(antes.billing.attributionPending).toBe(true);

    // Sin nada que atribuir no se guarda
    const vacio = await call("tok-dani", "/api/v1/me/attribution", { method: "POST", body: { landing: "/" } });
    expect(await vacio.json()).toMatchObject({ ok: false, reason: "empty" });
    // Campos que no son los esperados se rechazan (nunca datos personales)
    expect((await call("tok-dani", "/api/v1/me/attribution", { method: "POST", body: { gclid: "abc", email: "x@y.z" } })).status).toBe(400);

    const ok = await call("tok-dani", "/api/v1/me/attribution", {
      method: "POST",
      body: { gclid: "Cj0KCQjw-abc", utm_source: "google", utm_medium: "cpc", utm_campaign: "recorridos-360", utm_term: "tour virtual 360", landing: "/", touchedAt: Date.now() - 60_000 },
    });
    expect(await ok.json()).toEqual({ ok: true });
    const despues = (await (await call("tok-dani", "/api/v1/me")).json()) as { billing: { attributionPending: boolean } };
    expect(despues.billing.attributionPending).toBe(false);
    // El primer toque gana: un segundo envío se ignora sin error
    const otra = await call("tok-dani", "/api/v1/me/attribution", { method: "POST", body: { msclkid: "otro" } });
    expect(await otra.json()).toMatchObject({ ok: false, reason: "already" });

    // Solo el administrador exporta
    expect((await call("tok-dani", "/api/v1/admin/attribution/export")).status).toBe(403);
    const csv = await call("tok-bruno", "/api/v1/admin/attribution/export?only=attributed");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const texto = await csv.text();
    const lineas = texto.trim().split("\r\n");
    expect(lineas[0]).toContain("Google Click ID");
    expect(lineas[0]).toContain("Microsoft Click Id");
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toContain("dani@ejemplo.es");
    expect(lineas[1]).toContain("Cj0KCQjw-abc");
    expect(lineas[1]).toContain("recorridos-360");
    expect(lineas[1]).toContain("tour virtual 360");
    // Sin plan de pago, la columna del primer pago va vacía
    const columnas = lineas[1]!.split(",");
    expect(columnas[5]).toBe("");

    // Todos los usuarios, sin filtro
    const todos = (await (await call("tok-bruno", "/api/v1/admin/attribution/export")).text()).trim().split("\r\n");
    expect(todos.length).toBeGreaterThan(2);
  });

  it("la insignia «Hecho con Andarama» va en los planes sin marca blanca, y el dominio propio en los que lo incluyen", async () => {
    // Dani (en prueba) publica: insignia
    const dani = (await (await call("tok-dani", "/api/v1/me")).json()) as { orgs: { id: string }[] };
    const enPrueba = await call("tok-dani", `/api/v1/projects?org=${dani.orgs[0]!.id}`);
    const proyecto = ((await enPrueba.json()) as { id: string }[])[0]!;
    const escena = await call("tok-dani", `/api/v1/projects/${proyecto.id}/scenes`, {
      method: "POST",
      body: { title: "Entrada", sourceJson: { kind: "equirect", url: "media:falso" } },
    });
    const sceneId = ((await escena.json()) as { id: string }).id;
    await call("tok-dani", `/api/v1/projects/${proyecto.id}/scenes/${sceneId}`, { method: "PATCH", body: { meta: { altText: "Entrada" } } });
    const pub = await call("tok-dani", `/api/v1/projects/${proyecto.id}/publish`, { method: "POST", body: { visibility: "public" } });
    expect(pub.status).toBe(201);
    const { slug } = (await pub.json()) as { slug: string };
    const html = await (await call(null, `/t/${slug}`)).text();
    expect(html).toContain("utm_source=insignia");
    expect(html).toContain('"badge":{"url":"https://andarama.com/?utm_source=insignia&utm_medium=tour&utm_campaign=hecho-con"}');

    // El dominio propio no está en la prueba
    const dominio = await call("tok-dani", `/api/v1/projects/${proyecto.id}/publish`, {
      method: "POST",
      body: { visibility: "public", customDomain: "tour.ejemplo.es" },
    });
    expect(dominio.status).toBe(403);
    expect(await dominio.json()).toMatchObject({ code: "capability", capability: "customDomain", plan: "prueba" });

    // Eva (Formación) tiene marca blanca y dominio propio
    const eva = (await (await call("tok-eva", "/api/v1/me")).json()) as { orgs: { id: string }[]; billing: { capabilities: string[] } };
    expect(eva.billing.capabilities).toEqual(expect.arrayContaining(["scorm", "lti", "whiteLabel", "customDomain", "team", "invoice"]));
    const { projectId, slug: slugEva } = await publicar("tok-eva", eva.orgs[0]!.id, "Curso");
    const htmlEva = await (await call(null, `/t/${slugEva}`)).text();
    expect(htmlEva).not.toContain("utm_source=insignia");
    const conDominio = await call("tok-eva", `/api/v1/projects/${projectId}/publish`, {
      method: "POST",
      body: { visibility: "public", customDomain: "curso.ejemplo.es" },
    });
    expect(conDominio.status).toBe(201);

    // El administrador de la instancia no tiene límites
    const bruno = (await (await call("tok-bruno", "/api/v1/me")).json()) as { orgs: { id: string }[] };
    const { slug: slugBruno } = await publicar("tok-bruno", bruno.orgs[0]!.id, "Demo pública");
    expect(await (await call(null, `/t/${slugBruno}`)).text()).not.toContain("utm_source=insignia");
  });
});

describe("administradores por lista blanca (ADMIN_EMAILS)", () => {
  it("el alta dentro de la lista es administradora y fuera de ella no, y las dos quedan auditadas", async () => {
    const bruno = (await db.select().from(users).where(eq(users.email, "bruno@ejemplo.es")))[0]!;
    const ana = (await db.select().from(users).where(eq(users.email, "ana@ejemplo.es")))[0]!;
    expect(bruno.roleGlobal).toBe("admin");
    expect(ana.roleGlobal).toBe("user");
    const provisions = await db.select().from(auditLog).where(eq(auditLog.action, "user.provision"));
    const deBruno = provisions.find((row) => row.entityId === bruno.id);
    const deAna = provisions.find((row) => row.entityId === ana.id);
    expect(JSON.parse(deBruno!.detailJson!)).toEqual({ firstUser: true, via: "clerk", roleGlobal: "admin" });
    expect(JSON.parse(deAna!.detailJson!)).toEqual({ firstUser: false, via: "clerk", roleGlobal: "user" });
    expect(deAna!.userId).toBe(ana.id);
  });

  it("canjear un cupón nunca cambia el rol", async () => {
    const { codes } = (await (await call("tok-bruno", "/api/v1/admin/coupons", { method: "POST", body: { count: 2, plan: "formacion" } })).json()) as { codes: string[] };
    const antes = (await db.select().from(users).where(eq(users.email, "clara@ejemplo.es")))[0]!;
    expect((await call("tok-clara", "/api/v1/billing/coupon", { method: "POST", body: { code: codes[0]! } })).status).toBe(200);
    expect((await call("tok-bruno", "/api/v1/billing/coupon", { method: "POST", body: { code: codes[1]! } })).status).toBe(200);
    const clara = (await db.select().from(users).where(eq(users.email, "clara@ejemplo.es")))[0]!;
    const bruno = (await db.select().from(users).where(eq(users.email, "bruno@ejemplo.es")))[0]!;
    expect(antes.roleGlobal).toBe("user");
    expect(clara.roleGlobal).toBe("user");
    expect(bruno.roleGlobal).toBe("admin");
    const cambios = await db.select().from(auditLog).where(eq(auditLog.action, "admin.role_change"));
    expect(cambios.filter((row) => row.entityId === clara.id)).toHaveLength(0);
  });

  it("quien está en la lista y aún no administra se promueve al entrar, con auditoría", async () => {
    const now = Date.now();
    await db.insert(users).values({
      id: "fede-antiguo",
      email: "fede@ejemplo.es",
      name: "Fede",
      clerkId: "user_tok-fede",
      roleGlobal: "user",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const me = (await (await call("tok-fede", "/api/v1/me")).json()) as { user: { roleGlobal: string } };
    expect(me.user.roleGlobal).toBe("admin");
    const cambio = (await db.select().from(auditLog).where(eq(auditLog.entityId, "fede-antiguo"))).find((row) => row.action === "admin.role_change");
    expect(JSON.parse(cambio!.detailJson!)).toMatchObject({ from: "user", to: "admin", via: "clerk" });
    // Una segunda petición no repite la promoción
    await call("tok-fede", "/api/v1/me");
    const cambios = (await db.select().from(auditLog).where(eq(auditLog.entityId, "fede-antiguo"))).filter((row) => row.action === "admin.role_change");
    expect(cambios).toHaveLength(1);
  });

  it("el cambio de rol desde el panel deja admin.role_change con el valor anterior", async () => {
    const clara = (await db.select().from(users).where(eq(users.email, "clara@ejemplo.es")))[0]!;
    expect((await call("tok-bruno", `/api/v1/admin/users/${clara.id}`, { method: "PATCH", body: { roleGlobal: "admin" } })).status).toBe(200);
    expect((await call("tok-bruno", `/api/v1/admin/users/${clara.id}`, { method: "PATCH", body: { roleGlobal: "user" } })).status).toBe(200);
    // Sin cambio real, sin acción específica
    expect((await call("tok-bruno", `/api/v1/admin/users/${clara.id}`, { method: "PATCH", body: { roleGlobal: "user" } })).status).toBe(200);
    const cambios = (await db.select().from(auditLog).where(eq(auditLog.entityId, clara.id)))
      .filter((row) => row.action === "admin.role_change")
      .map((row) => JSON.parse(row.detailJson!) as { from: string; to: string });
    expect(cambios).toEqual([
      { from: "user", to: "admin", via: "panel" },
      { from: "admin", to: "user", via: "panel" },
    ]);
  });
});

describe("cuota por dueño", () => {
  it("abrir otra organización no multiplica la cuota del plan", async () => {
    const me = (await (await call("tok-gabi", "/api/v1/me")).json()) as { orgs: { id: string }[] };
    const propia = me.orgs[0]!.id;
    expect((await call("tok-gabi", "/api/v1/projects", { method: "POST", body: { orgId: propia, title: "Único" } })).status).toBe(201);
    const nueva = (await (await call("tok-gabi", "/api/v1/orgs", { method: "POST", body: { name: "Segunda de Gabi" } })).json()) as { id: string };
    const res = await call("tok-gabi", "/api/v1/projects", { method: "POST", body: { orgId: nueva.id, title: "Otro más" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "quota_tours", plan: "andar", limit: 1 });
    // El uso que se enseña es el de todo lo que responde el dueño
    const usage = (await (await call("tok-gabi", `/api/v1/orgs/${nueva.id}/usage`)).json()) as { usedTours: number; quotaTours: number };
    expect(usage).toMatchObject({ usedTours: 1, quotaTours: 1 });
    // Y el almacenamiento también se suma entre organizaciones
    await db.insert(media).values({
      id: "medio-gordo",
      orgId: propia,
      kind: "image",
      filename: "gordo.jpg",
      mime: "image/jpeg",
      bytes: 5 * 1024 * 1024 * 1024 - 10,
      r2Key: "media/x/gordo.jpg",
      status: "ready",
      createdBy: "gabi",
      createdAt: Date.now(),
    });
    const subida = await call("tok-gabi", "/api/v1/media", {
      method: "POST",
      body: { orgId: nueva.id, kind: "image", filename: "a.jpg", mime: "image/jpeg", bytes: 1000 },
    });
    expect(subida.status).toBe(403);
    expect(await subida.json()).toMatchObject({ code: "quota_bytes" });
  });
});

describe("solicitudes de demo y conversiones para Google Ads", () => {
  const demo = (extra: Record<string, unknown> = {}) => ({
    name: "Marta Díaz",
    institution: "Museo de Ejemplo",
    email: "Marta@Museo.es",
    message: "Queremos enseñar el depósito.",
    lang: "es",
    source: "museos",
    page: "/museos/",
    ...extra,
  });

  it("la web sabe si hay Turnstile", async () => {
    const cfg = (await (await call(null, "/api/v1/public/demo/config")).json()) as { turnstileSiteKey: string | null };
    expect(cfg.turnstileSiteKey).toBeNull();
  });

  it("guarda la solicitud con la atribución; sin consentimiento, sin identificador de clic", async () => {
    const con = await call(null, "/api/v1/public/demo", {
      method: "POST",
      body: demo({ attribution: { gclid: "G-DEMO-SI", utm_source: "google", landing_web: "/museos/", consent: true } }),
    });
    expect(con.status).toBe(201);
    const sin = await call(null, "/api/v1/public/demo", {
      method: "POST",
      body: demo({ institution: "Archivo Sin Consentimiento", attribution: { gclid: "G-DEMO-NO", utm_source: "google", consent: false } }),
    });
    expect(sin.status).toBe(201);
    // La trampa para robots: se contesta igual, pero no se guarda
    const robot = await call(null, "/api/v1/public/demo", { method: "POST", body: demo({ institution: "Robot", website: "http://spam" }) });
    expect(robot.status).toBe(201);
    // Campos que faltan o sobran se rechazan
    expect((await call(null, "/api/v1/public/demo", { method: "POST", body: { name: "x" } })).status).toBe(400);
    expect((await call(null, "/api/v1/public/demo", { method: "POST", body: demo({ attribution: { email: "x@y.z" } }) })).status).toBe(400);

    // El panel las ve (y solo el administrador)
    expect((await call("tok-dani", "/api/v1/admin/demo-requests")).status).toBe(403);
    const lista = (await (await call("tok-bruno", "/api/v1/admin/demo-requests")).json()) as {
      institution: string;
      email: string;
      adConsent: boolean;
      clickId: boolean;
      notifiedAt: number | null;
    }[];
    expect(lista.map((d) => d.institution).sort()).toEqual(["Archivo Sin Consentimiento", "Museo de Ejemplo"]);
    const museo = lista.find((d) => d.institution === "Museo de Ejemplo")!;
    expect(museo).toMatchObject({ email: "marta@museo.es", adConsent: true, clickId: true, notifiedAt: null });
    expect(lista.find((d) => d.institution === "Archivo Sin Consentimiento")).toMatchObject({ adConsent: false, clickId: false });
  });

  it("exporta el CSV de conversiones con el secreto o con un administrador", async () => {
    expect((await call(null, "/api/v1/admin/conversions.csv")).status).toBe(401);
    expect((await call(null, "/api/v1/admin/conversions.csv?token=otro")).status).toBe(401);
    expect((await call("tok-dani", "/api/v1/admin/conversions.csv")).status).toBe(403);
    expect((await call("tok-bruno", "/api/v1/admin/conversions.csv")).status).toBe(200);

    const res = await call(null, "/api/v1/admin/conversions.csv?token=secreto-de-conversiones");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const lineas = (await res.text()).trim().split("\r\n");
    expect(lineas[0]).toBe(
      "Google Click ID,GBRAID,WBRAID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Ad User Data,Ad Personalization",
    );
    // La demo con consentimiento, con GRANTED; la otra no aparece (no guardó el clic)
    expect(lineas.find((l) => l.startsWith("G-DEMO-SI,"))).toMatch(/^G-DEMO-SI,,,Solicitud de demo,\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00:00,60,EUR,GRANTED,GRANTED$/);
    expect(lineas.some((l) => l.includes("G-DEMO-NO"))).toBe(false);
    // Dani se dio de alta con gclid antes de que existiera el aviso: prueba iniciada, DENIED
    expect(lineas.find((l) => l.startsWith("Cj0KCQjw-abc,"))).toMatch(/,Prueba iniciada,.*,10,EUR,DENIED,DENIED$/);

    // También por cabecera
    const porCabecera = await app.request("http://localhost/api/v1/admin/conversions.csv", { headers: { "x-conversions-token": "secreto-de-conversiones" } });
    expect(porCabecera.status).toBe(200);
  });
});
