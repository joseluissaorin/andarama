import { beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { auditLog, hotspots, media, users } from "@andarama/db";
import type { AppEnv, Db } from "./lib/context.js";
import { compileProject } from "./compiler.js";
import { createTestInstance } from "./test-support.js";

/**
 * Seguridad de cuentas y contenido en una autoinstalación (sin Clerk): quién
 * administra con y sin ADMIN_EMAILS, la importación de copias, y que una
 * escena no pueda usar medios de otra organización.
 */

/** Cliente con tarro de cookies y CSRF, como el Studio con sesión propia. */
function browser(app: Hono<AppEnv>, ip: string) {
  let cookies = "";
  let csrf = "";
  return async (path: string, opts: { method?: string; body?: unknown } = {}): Promise<Response> => {
    const headers: Record<string, string> = { "cf-connecting-ip": ip };
    let body: string | undefined;
    if (opts.body != null) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (cookies !== "") {
      headers.cookie = cookies;
      if ((opts.method ?? "GET") !== "GET") headers["x-csrf-token"] = csrf;
    }
    const res = await app.request(`http://localhost${path}`, { method: opts.method ?? "GET", headers, body });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const pair = sc.split(";")[0]!;
      const name = pair.split("=")[0]!;
      const jar = new Map(cookies.split("; ").filter(Boolean).map((c) => [c.split("=")[0]!, c]));
      jar.set(name, pair);
      cookies = [...jar.values()].join("; ");
      if (name === "u3c") csrf = pair.split("=")[1] ?? "";
    }
    return res;
  };
}

async function register(app: Hono<AppEnv>, ip: string, email: string): Promise<{ call: ReturnType<typeof browser>; admin: boolean; orgId: string }> {
  const call = browser(app, ip);
  const res = await call("/api/v1/auth/register", {
    method: "POST",
    body: { email, name: email.split("@")[0], password: "password-larga-1" },
  });
  expect(res.status).toBe(201);
  const { isInstanceAdmin } = (await res.json()) as { isInstanceAdmin: boolean };
  const me = (await (await call("/api/v1/me")).json()) as { orgs: { id: string }[] };
  return { call, admin: isInstanceAdmin, orgId: me.orgs[0]!.id };
}

describe("autoinstalación sin ADMIN_EMAILS", () => {
  it("el primer usuario administra y el segundo no", async () => {
    const { app } = await createTestInstance();
    expect((await register(app, "10.0.0.1", "primera@casa.test")).admin).toBe(true);
    expect((await register(app, "10.0.0.2", "segunda@casa.test")).admin).toBe(false);
  });
});

describe("autoinstalación con ADMIN_EMAILS", () => {
  let app: Hono<AppEnv>;
  let db: Db;
  let jefa: Awaited<ReturnType<typeof register>>;

  beforeAll(async () => {
    const inst = await createTestInstance({ adminEmails: ["jefa@casa.test", "tarde@casa.test"] });
    app = inst.app;
    db = inst.db;
  });

  it("llegar primero no da nada: solo la lista", async () => {
    const primero = await register(app, "10.0.1.1", "primero@casa.test");
    expect(primero.admin).toBe(false);
    jefa = await register(app, "10.0.1.2", "Jefa@Casa.test");
    expect(jefa.admin).toBe(true);
  });

  it("quien está en la lista y entra sin ser administrador se promueve, con auditoría", async () => {
    const tarde = await register(app, "10.0.1.3", "tarde@casa.test");
    expect(tarde.admin).toBe(true);
    // Se le quita el rol a mano (SQL) y vuelve a entrar
    await db.update(users).set({ roleGlobal: "user" }).where(eq(users.email, "tarde@casa.test"));
    const call = browser(app, "10.0.1.4");
    expect((await call("/api/v1/auth/login", { method: "POST", body: { email: "tarde@casa.test", password: "password-larga-1" } })).status).toBe(200);
    const row = (await db.select().from(users).where(eq(users.email, "tarde@casa.test")))[0]!;
    expect(row.roleGlobal).toBe("admin");
    const cambio = (await db.select().from(auditLog).where(eq(auditLog.entityId, row.id))).find((a) => a.action === "admin.role_change");
    expect(JSON.parse(cambio!.detailJson!)).toMatchObject({ from: "user", to: "admin", via: "login" });
  });

  it("la importación de una copia no concede administración fuera de la lista", async () => {
    const now = Date.now();
    const fila = (id: string, email: string, roleGlobal: string) => ({
      id, email, name: id, roleGlobal, emailVerified: true, prefsJson: "{}", createdAt: now, updatedAt: now,
    });
    const res = await jefa.call("/api/v1/admin/backup/import", {
      method: "POST",
      body: {
        format: "anda-backup",
        version: 1,
        tables: {
          users: [
            fila("intruso", "intruso@fuera.test", "admin"),
            fila("normal", "normal@fuera.test", "user"),
            fila("de-la-lista", "TARDE2@casa.test", "user"),
          ],
        },
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ imported: 3, roleChanges: 1 });
    const intruso = (await db.select().from(users).where(eq(users.id, "intruso")))[0]!;
    expect(intruso.roleGlobal).toBe("user");
    const cambios = (await db.select().from(auditLog).where(eq(auditLog.action, "admin.role_change"))).filter((a) => a.entityId === "intruso");
    expect(JSON.parse(cambios[0]!.detailJson!)).toMatchObject({ from: "admin", to: "user", via: "backup_import" });
    // Quien no figura en la lista (TARDE2 no es tarde) tampoco sube
    expect((await db.select().from(users).where(eq(users.id, "de-la-lista")))[0]!.roleGlobal).toBe("user");
  });
});

describe("medios de una escena", () => {
  it("una escena solo puede usar medios de la organización de su proyecto", async () => {
    const { app, db } = await createTestInstance();
    const ana = await register(app, "10.0.2.1", "ana@casa.test");
    const beto = await register(app, "10.0.2.2", "beto@casa.test");
    const now = Date.now();
    const medio = (id: string, orgId: string) => ({
      id, orgId, kind: "panorama", filename: `${id}.jpg`, mime: "image/jpeg", bytes: 10,
      r2Key: `media/${orgId}/${id}/original.jpg`, status: "ready", createdBy: "x", createdAt: now,
    });
    await db.insert(media).values([medio("propio", ana.orgId), medio("ajeno", beto.orgId)]);

    const proyecto = (await (await ana.call("/api/v1/projects", { method: "POST", body: { orgId: ana.orgId, title: "Casa" } })).json()) as { id: string };
    const base = `/api/v1/projects/${proyecto.id}/scenes`;
    expect((await ana.call(base, { method: "POST", body: { title: "Robada", mediaId: "ajeno" } })).status).toBe(400);
    expect((await ana.call(base, { method: "POST", body: { title: "Inventada", mediaId: "no-existe" } })).status).toBe(400);
    const escena = await ana.call(base, { method: "POST", body: { title: "Salón", mediaId: "propio" } });
    expect(escena.status).toBe(201);
    const { id: sceneId } = (await escena.json()) as { id: string };
    expect((await ana.call(`${base}/${sceneId}`, { method: "PATCH", body: { mediaId: "ajeno" } })).status).toBe(400);
    expect((await ana.call(`${base}/${sceneId}`, { method: "PATCH", body: { title: "Salón grande" } })).status).toBe(200);

    // Aunque la referencia llegue por otro camino (un hotspot), el compilador no la publica
    await db.insert(hotspots).values({
      id: "hs-ajeno",
      sceneId,
      type: "image",
      positionJson: JSON.stringify({ yaw: 0, pitch: 0 }),
      contentJson: JSON.stringify({ image: "media:ajeno" }),
      sort: 0,
    });
    const compilado = await compileProject(db, proyecto.id);
    const claves = Object.values(compilado.assets);
    expect(claves.some((k) => k.includes("/propio/"))).toBe(true);
    expect(claves.some((k) => k.includes("/ajeno/"))).toBe(false);
  });
});
