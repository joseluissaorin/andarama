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
import { verifyRealtimeTicket } from "@andarama/realtime";
import { createApp } from "./app.js";
import type { AppEnv } from "./lib/context.js";

/**
 * Edición en grupo: billete de la sala (quién entra), control optimista de
 * versiones (409 con la fila vigente) y avisos a la sala tras cada escritura.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../packages/db/migrations");
const SECRET = "secreto-colab";

let app: Hono<AppEnv>;
const events: { projectId: string; event: Record<string, unknown> }[] = [];

class Person {
  cookies = "";
  csrf = "";
  constructor(public email: string) {}
  async call(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
    const headers: Record<string, string> = { ...opts.headers };
    let body: string | undefined;
    if (opts.body != null) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (this.cookies !== "") {
      headers.cookie = this.cookies;
      if ((opts.method ?? "GET") !== "GET") headers["x-csrf-token"] = this.csrf;
    }
    const res = await app.request(`http://localhost/api/v1${path}`, { method: opts.method ?? "GET", headers, body });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      if (pair == null) continue;
      const [name] = pair.split("=");
      const jar = new Map(this.cookies.split("; ").filter(Boolean).map((c) => [c.split("=")[0]!, c]));
      jar.set(name!, pair);
      this.cookies = [...jar.values()].join("; ");
      if (name === "u3c") this.csrf = pair.split("=")[1] ?? "";
    }
    return res;
  }
  async json<T>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    const res = await this.call(path, opts);
    return (await res.json()) as T;
  }
}

const ana = new Person("ana@colab.test");
const luis = new Person("luis@colab.test");
const lectora = new Person("lectora@colab.test");
const ajeno = new Person("ajeno@colab.test");
let projectId = "";
let sceneId = "";
let hotspotId = "";

beforeAll(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "anda-colab-"));
  const { db, sqlite } = await createSqliteDb(":memory:");
  await migrateSqlite(sqlite, migrationsDir);
  app = createApp({
    runtime: {
      platform: "node",
      publicUrl: "http://localhost",
      db,
      kv: createSqliteKv(sqlite),
      storage: createFsStorage({ rootDir: join(dataDir, "storage"), hmacSecret: SECRET, publicUrl: "http://localhost" }),
      queue: createInProcessQueue(),
      analytics: createSqlAnalytics(db),
      passwords: createArgon2Hasher(),
      email: createSmtpEmail({ from: "test@localhost" }),
      deferred: (p) => void p.catch(() => {}),
    },
    config: { publicUrl: "http://localhost", secret: SECRET, emailFrom: "test@localhost", maxUploadBytes: 1024 * 1024 },
    notifyProject: async (pid, event) => {
      events.push({ projectId: pid, event });
    },
  });
  for (const [p, name] of [[ana, "Ana"], [luis, "Luis"], [lectora, "Lectora"], [ajeno, "Ajeno"]] as const) {
    const res = await p.call("/auth/register", { method: "POST", body: { email: p.email, name, password: "password-larga-1" } });
    expect(res.status).toBe(201);
  }
  const me = await ana.json<{ orgs: { id: string }[] }>("/me");
  projectId = (await ana.json<{ id: string }>("/projects", { method: "POST", body: { orgId: me.orgs[0]!.id, title: "Tour en grupo" } })).id;
  expect((await ana.call(`/projects/${projectId}/members`, { method: "POST", body: { email: luis.email, role: "collaborator" } })).status).toBe(201);
  expect((await ana.call(`/projects/${projectId}/members`, { method: "POST", body: { email: lectora.email, role: "reader" } })).status).toBe(201);
});

const lastEvent = (): Record<string, unknown> => events.at(-1)!.event;

describe("billete de la sala de edición", () => {
  it("lo recibe quien puede editar, con su identidad firmada", async () => {
    const res = await luis.call(`/projects/${projectId}/realtime`, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    const { ticket, path } = (await res.json()) as { ticket: string; path: string };
    expect(path).toBe(`/rt/project/${projectId}?t=${encodeURIComponent(ticket)}`);
    const identity = await verifyRealtimeTicket(SECRET, ticket, projectId);
    expect(identity).toMatchObject({ projectId, name: "Luis" });
  });

  it("no lo recibe quien solo puede leer ni quien no tiene acceso", async () => {
    expect((await lectora.call(`/projects/${projectId}/realtime`, { method: "POST", body: {} })).status).toBe(403);
    expect((await ajeno.call(`/projects/${projectId}/realtime`, { method: "POST", body: {} })).status).toBe(403);
  });

  it("sin sesión, tampoco", async () => {
    const res = await app.request(`http://localhost/api/v1/projects/${projectId}/realtime`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("versiones y avisos", () => {
  it("crear una escena avisa a la sala con la fila y la versión 0", async () => {
    events.length = 0;
    const res = await ana.json<{ id: string; version: number }>(`/projects/${projectId}/scenes`, {
      method: "POST",
      body: { title: "Entrada" },
      headers: { "x-andarama-conn": "conn-ana" },
    });
    sceneId = res.id;
    expect(res.version).toBe(0);
    expect(events[0]).toMatchObject({
      projectId,
      event: { kind: "scene", op: "upsert", row: { id: sceneId, title: "Entrada", version: 0 }, origin: "conn-ana", by: "Ana" },
    });
  });

  it("cada cambio sube la versión y la anuncia", async () => {
    const res = await luis.json<{ version: number }>(`/projects/${projectId}/scenes/${sceneId}`, {
      method: "PATCH",
      body: { title: "Entrada principal", baseVersion: 0 },
    });
    expect(res.version).toBe(1);
    expect(lastEvent()).toMatchObject({ kind: "scene", row: { title: "Entrada principal", version: 1 }, by: "Luis", origin: null });
  });

  it("guardar con una versión vieja da 409 con la fila vigente y no pisa nada", async () => {
    events.length = 0;
    const res = await ana.call(`/projects/${projectId}/scenes/${sceneId}`, { method: "PATCH", body: { title: "Pisado", baseVersion: 0 } });
    expect(res.status).toBe(409);
    const problem = (await res.json()) as { code: string; entity: string; current: { title: string; version: number } };
    expect(problem).toMatchObject({ code: "version_conflict", entity: "scene", current: { title: "Entrada principal", version: 1 } });
    expect(events).toEqual([]);
    const { scenes } = await ana.json<{ scenes: { title: string; version: number }[] }>(`/projects/${projectId}/scenes`);
    expect(scenes[0]).toMatchObject({ title: "Entrada principal", version: 1 });
  });

  it("sin versión (clientes de la API) sigue guardando como siempre", async () => {
    const res = await ana.json<{ version: number }>(`/projects/${projectId}/scenes/${sceneId}`, { method: "PATCH", body: { meta: { altText: "Puerta" } } });
    expect(res.version).toBe(2);
  });

  it("puntos: crear, cambiar con versión, conflicto y borrar", async () => {
    const created = await ana.json<{ id: string; version: number }>(`/projects/${projectId}/scenes/${sceneId}/hotspots`, {
      method: "POST",
      body: { type: "text", position: { yaw: 0, pitch: 0 }, content: { title: "Hola" } },
    });
    hotspotId = created.id;
    expect(lastEvent()).toMatchObject({ kind: "hotspot", op: "upsert", row: { id: hotspotId, sceneId, version: 0 } });
    const patched = await luis.json<{ version: number }>(`/projects/${projectId}/hotspots/${hotspotId}`, {
      method: "PATCH",
      body: { content: { title: "Hola, mundo" }, baseVersion: 0 },
    });
    expect(patched.version).toBe(1);
    const stale = await ana.call(`/projects/${projectId}/hotspots/${hotspotId}`, { method: "PATCH", body: { content: { title: "Adiós" }, baseVersion: 0 } });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { current: { contentJson: string } }).current.contentJson).toContain("Hola, mundo");
    expect((await ana.call(`/projects/${projectId}/hotspots/${hotspotId}`, { method: "DELETE" })).status).toBe(200);
    expect(lastEvent()).toMatchObject({ kind: "hotspot", op: "delete", id: hotspotId, sceneId });
  });

  it("ajustes: versión propia, 409 con los ajustes vigentes y aviso con el resultado", async () => {
    const before = await ana.json<{ settingsVersion: number }>(`/projects/${projectId}`);
    const v0 = before.settingsVersion;
    const ok = await ana.json<{ settingsVersion: number }>(`/projects/${projectId}`, {
      method: "PATCH",
      body: { settings: { autorotate: { enabled: true } }, baseSettingsVersion: v0 },
    });
    expect(ok.settingsVersion).toBe(v0 + 1);
    expect(lastEvent()).toMatchObject({ kind: "settings", version: v0 + 1, settings: { autorotate: { enabled: true } } });
    const stale = await luis.call(`/projects/${projectId}`, { method: "PATCH", body: { settings: { autorotate: { enabled: false } }, baseSettingsVersion: v0 } });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ entity: "settings", current: { version: v0 + 1, settings: { autorotate: { enabled: true } } } });
  });

  it("renombrar, reordenar, borrar escenas y comentar también avisan", async () => {
    await ana.call(`/projects/${projectId}`, { method: "PATCH", body: { title: "Tour renombrado" } });
    expect(lastEvent()).toMatchObject({ kind: "project", title: "Tour renombrado" });
    const second = await ana.json<{ id: string }>(`/projects/${projectId}/scenes`, { method: "POST", body: { title: "Patio" } });
    await ana.call(`/projects/${projectId}/scenes/reorder`, { method: "POST", body: { order: [second.id, sceneId] } });
    expect(lastEvent()).toEqual(expect.objectContaining({ kind: "order", order: [second.id, sceneId] }));
    await ana.call(`/projects/${projectId}/scenes/${second.id}`, { method: "DELETE" });
    expect(lastEvent()).toMatchObject({ kind: "scene", op: "delete", id: second.id });
    await luis.call(`/projects/${projectId}/comments`, { method: "POST", body: { body: "¿Cambiamos la entrada?" } });
    expect(lastEvent()).toMatchObject({ kind: "comments" });
  });

  it("los avisos van siempre a la sala de su recorrido", () => {
    expect(events.every((e) => e.projectId === projectId)).toBe(true);
  });
});
