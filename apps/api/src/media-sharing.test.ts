import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hotspots, media, mediaDerivatives, projects } from "@andarama/db";
import type { PlatformRuntime } from "@andarama/adapters";
import type { Hono } from "hono";
import { createTestInstance } from "./test-support.js";
import type { AppEnv, Db } from "./lib/context.js";

/**
 * Medios de un recorrido compartido con alguien de otra organización: ve las
 * miniaturas y la biblioteca del recorrido y, si puede editarlo, sube medios
 * que quedan en la organización del recorrido. No ve nada más de esa
 * organización ni toca lo que no es del recorrido.
 */

let app: Hono<AppEnv>;
let db: Db;
let runtime: PlatformRuntime;

class Person {
  cookies = "";
  csrf = "";
  orgId = "";
  userId = "";
  constructor(public email: string) {}
  async call(path: string, opts: { method?: string; body?: unknown } = {}): Promise<Response> {
    const headers: Record<string, string> = {};
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
  async json<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    return (await (await this.call(path, opts)).json()) as T;
  }
}

const ana = new Person("ana@compartir.test");
const luis = new Person("luis@compartir.test");
const lectora = new Person("lectora@compartir.test");
const ajeno = new Person("ajeno@compartir.test");
let tour = "";
let otro = "";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

beforeAll(async () => {
  ({ app, db, runtime } = await createTestInstance());
  for (const [p, name] of [[ana, "Ana"], [luis, "Luis"], [lectora, "Lectora"], [ajeno, "Ajeno"]] as const) {
    expect((await p.call("/auth/register", { method: "POST", body: { email: p.email, name, password: "password-larga-1" } })).status).toBe(201);
    const me = await p.json<{ user: { id: string }; orgs: { id: string }[] }>("/me");
    p.orgId = me.orgs[0]!.id;
    p.userId = me.user.id;
  }
  tour = (await ana.json<{ id: string }>("/projects", { method: "POST", body: { orgId: ana.orgId, title: "Tour compartido" } })).id;
  otro = (await ana.json<{ id: string }>("/projects", { method: "POST", body: { orgId: ana.orgId, title: "Tour privado" } })).id;
  expect((await ana.call(`/projects/${tour}/members`, { method: "POST", body: { email: luis.email, role: "collaborator" } })).status).toBe(201);
  expect((await ana.call(`/projects/${tour}/members`, { method: "POST", body: { email: lectora.email, role: "reader" } })).status).toBe(201);

  const row = (id: string, projectId: string | null, sha256: string | null = null) => ({
    id,
    orgId: ana.orgId,
    projectId,
    kind: "panorama",
    filename: `${id}.jpg`,
    mime: "image/jpeg",
    bytes: JPEG.length,
    sha256,
    r2Key: `media/${ana.orgId}/${id}/original.jpg`,
    status: "ready",
    createdBy: ana.userId,
    createdAt: Date.now(),
  });
  // m-tour: asignado al tour; m-escena: de la biblioteca, usado como escena;
  // m-hotspot y m-ajustes: referenciados desde un hotspot y desde los ajustes;
  // m-otro: de un tour no compartido; m-suelto: en la biblioteca sin más.
  const ids = ["m-tour", "m-escena", "m-hotspot", "m-ajustes", "m-otro", "m-suelto"];
  await db.insert(media).values([
    row("m-tour", tour),
    row("m-escena", null),
    row("m-hotspot", null),
    row("m-ajustes", null),
    row("m-otro", otro),
    row("m-suelto", null, "a".repeat(64)),
  ]);
  for (const id of ids) {
    await runtime.storage.put(`media/${ana.orgId}/${id}/original.jpg`, JPEG, { contentType: "image/jpeg" });
    await runtime.storage.put(`derived/${id}/thumb.jpg`, JPEG, { contentType: "image/jpeg" });
    await db.insert(mediaDerivatives).values({ id: `d-${id}`, mediaId: id, kind: "thumb", r2Prefix: `derived/${id}/thumb.jpg`, manifestJson: "{}", createdAt: Date.now() });
  }
  const scene = await ana.json<{ id: string }>(`/projects/${tour}/scenes`, {
    method: "POST",
    body: { title: "Patio", mediaId: "m-escena", sourceJson: { kind: "equirect", url: "media:m-escena" } },
  });
  await db.insert(hotspots).values({
    id: "h-1",
    sceneId: scene.id,
    type: "info",
    positionJson: "{}",
    contentJson: JSON.stringify({ image: "thumb:m-hotspot" }),
    sort: 0,
  });
  await db.update(projects).set({ settingsJson: JSON.stringify({ logo: "media:m-ajustes" }) }).where(eq(projects.id, tour));
  // El tour privado usa m-otro como escena: eso no lo abre para nadie de fuera
  await ana.call(`/projects/${otro}/scenes`, { method: "POST", body: { title: "Sala", mediaId: "m-otro" } });
});

describe("lectura de medios por un recorrido compartido", () => {
  it("quien lo edita desde otra organización ve las miniaturas de todo lo que usa el recorrido", async () => {
    for (const id of ["m-tour", "m-escena", "m-hotspot", "m-ajustes"]) {
      const res = await luis.call(`/media/${id}/derived/thumb`);
      expect(res.status, id).toBe(200);
    }
    expect((await luis.call("/media/m-tour/file")).status).toBe(200);
    expect((await luis.call("/media/m-escena")).status).toBe(200);
  });

  it("quien solo puede leerlo, también", async () => {
    expect((await lectora.call("/media/m-escena/derived/thumb")).status).toBe(200);
    expect((await lectora.call("/media/m-tour/file")).status).toBe(200);
  });

  it("no ve medios de recorridos que no le han compartido ni sueltos en la biblioteca", async () => {
    for (const id of ["m-otro", "m-suelto"]) {
      expect((await luis.call(`/media/${id}/derived/thumb`)).status, id).toBe(403);
      expect((await luis.call(`/media/${id}/file`)).status, id).toBe(403);
    }
  });

  it("quien no tiene nada compartido no ve nada", async () => {
    expect((await ajeno.call("/media/m-tour/derived/thumb")).status).toBe(403);
    expect((await ajeno.call("/media/m-escena/file")).status).toBe(403);
  });

  it("si el recorrido va a la papelera, deja de verlos", async () => {
    await db.update(projects).set({ deletedAt: Date.now() }).where(eq(projects.id, tour));
    try {
      expect((await luis.call("/media/m-escena/derived/thumb")).status).toBe(403);
    } finally {
      await db.update(projects).set({ deletedAt: null }).where(eq(projects.id, tour));
    }
  });
});

describe("biblioteca del recorrido", () => {
  it("«Este tour» le muestra lo mismo que al dueño", async () => {
    const delDueno = (await ana.json<{ id: string }[]>(`/media?org=${ana.orgId}&project=${tour}`)).map((m) => m.id).sort();
    const res = await luis.call(`/media?org=${ana.orgId}&project=${tour}`);
    expect(res.status).toBe(200);
    const deLuis = ((await res.json()) as { id: string }[]).map((m) => m.id).sort();
    expect(deLuis).toEqual(delDueno);
    expect(deLuis).toEqual(["m-escena", "m-tour"]);
  });

  it("no puede listar la biblioteca entera ni otros recorridos ni las carpetas", async () => {
    expect((await luis.call(`/media?org=${ana.orgId}`)).status).toBe(403);
    expect((await luis.call(`/media?org=${ana.orgId}&project=none`)).status).toBe(403);
    expect((await luis.call(`/media?org=${ana.orgId}&project=${otro}`)).status).toBe(403);
    expect((await luis.call(`/media/folders?org=${ana.orgId}`)).status).toBe(403);
    expect((await ajeno.call(`/media?org=${ana.orgId}&project=${tour}`)).status).toBe(403);
  });
});

describe("subida y edición desde un recorrido compartido", () => {
  let subido = "";

  it("quien puede editar sube al recorrido: el medio es de la organización del recorrido", async () => {
    // El Studio antiguo mandaba la organización de la persona: manda el recorrido
    const res = await luis.call("/media", {
      method: "POST",
      body: { orgId: luis.orgId, projectId: tour, kind: "image", filename: "nueva.jpg", mime: "image/jpeg", bytes: JPEG.length },
    });
    expect(res.status).toBe(201);
    subido = ((await res.json()) as { media: { id: string } }).media.id;
    const fila = (await db.select().from(media).where(eq(media.id, subido)))[0]!;
    expect(fila.orgId).toBe(ana.orgId);
    expect(fila.projectId).toBe(tour);
    expect(fila.r2Key.startsWith(`media/${ana.orgId}/`)).toBe(true);

    await runtime.storage.put(fila.r2Key, JPEG, { contentType: "image/jpeg" });
    expect((await luis.call(`/media/${subido}/complete`, { method: "POST", body: { width: 2, height: 1 } })).status).toBe(200);
    expect((await luis.call(`/media/${subido}/derivative-uploads`, { method: "POST", body: { keys: [`derived/${subido}/thumb.jpg`] } })).status).toBe(200);
    expect((await luis.call(`/media/${subido}`, { method: "PATCH", body: { filename: "renombrada.jpg", folder: "Tour compartido" } })).status).toBe(200);
    // Y la dueña lo ve en su biblioteca, en el tour
    const delDueno = (await ana.json<{ id: string }[]>(`/media?org=${ana.orgId}&project=${tour}`)).map((m) => m.id);
    expect(delDueno).toContain(subido);
  });

  it("no deduplica contra el resto de la biblioteca de la otra organización", async () => {
    const res = await luis.call("/media", {
      method: "POST",
      body: { orgId: ana.orgId, projectId: tour, kind: "image", filename: "copia.jpg", mime: "image/jpeg", bytes: JPEG.length, sha256: "a".repeat(64) },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { deduplicated?: boolean; media: { id: string } };
    expect(body.deduplicated).toBeUndefined();
    expect(body.media.id).not.toBe("m-suelto");
  });

  it("quien solo puede leer no sube, y sin recorrido no se sube a la otra organización", async () => {
    expect(
      (await lectora.call("/media", {
        method: "POST",
        body: { orgId: ana.orgId, projectId: tour, kind: "image", filename: "x.jpg", mime: "image/jpeg", bytes: 10 },
      })).status,
    ).toBe(403);
    expect(
      (await luis.call("/media", {
        method: "POST",
        body: { orgId: ana.orgId, kind: "image", filename: "x.jpg", mime: "image/jpeg", bytes: 10 },
      })).status,
    ).toBe(403);
    expect(
      (await luis.call("/media", {
        method: "POST",
        body: { orgId: ana.orgId, projectId: otro, kind: "image", filename: "x.jpg", mime: "image/jpeg", bytes: 10 },
      })).status,
    ).toBe(403);
  });

  it("no toca lo que el recorrido solo usa, ni lo saca del recorrido", async () => {
    expect((await luis.call("/media/m-escena", { method: "PATCH", body: { filename: "otro.jpg" } })).status).toBe(403);
    expect((await luis.call("/media/m-escena", { method: "DELETE" })).status).toBe(403);
    expect((await luis.call("/media/m-suelto", { method: "DELETE" })).status).toBe(403);
    expect((await luis.call("/media/m-otro", { method: "DELETE" })).status).toBe(403);
    expect((await luis.call("/media/m-tour", { method: "PATCH", body: { projectId: otro } })).status).toBe(403);
    expect((await luis.call("/media/m-tour", { method: "PATCH", body: { projectId: null } })).status).toBe(403);
    expect((await lectora.call(`/media/${subido}`, { method: "PATCH", body: { filename: "no.jpg" } })).status).toBe(403);
  });

  it("puede borrar lo que subió al recorrido si nada lo usa", async () => {
    expect((await luis.call(`/media/${subido}`, { method: "DELETE" })).status).toBe(200);
  });
});
