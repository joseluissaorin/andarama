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
import { media } from "@andarama/db";
import { createApp } from "./app.js";
import type { AppConfig, AppEnv, Db } from "./lib/context.js";
import type { ClerkVerifier } from "./lib/clerk.js";
import { parseTemplatesConfig } from "./lib/templates.js";

/**
 * Alta, prueba y activación en la instancia alojada: el tour de ejemplo que
 * se clona al dar de alta, las plantillas por sector del operador, la
 * moderación de la galería, la lista de primeros pasos y lo que pasa al
 * acabar la prueba (lo publicado sigue, exportar sigue libre, editar,
 * republicar y subir piden plan).
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../packages/db/migrations");

const people: Record<string, { email: string; name: string; plan: string | null }> = {
  // La cuenta del operador (en ADMIN_EMAILS) administra la instancia y guarda la organización Plantillas
  "tok-op": { email: "operador@andarama.test", name: "Plantillas", plan: null },
  // Llega sin plan: catorce días de prueba
  "tok-lia": { email: "lia@ejemplo.es", name: "Lía", plan: null },
  "tok-max": { email: "max@ejemplo.es", name: "Max", plan: "u:paseo" },
};

const verifier: ClerkVerifier = {
  async verify(token) {
    const p = people[token];
    return p == null ? null : { sub: `user_${token}`, sid: `sess_${token}`, pla: p.plan ?? undefined };
  },
  async fetchUser(clerkId) {
    const p = people[clerkId.replace(/^user_/, "")];
    return p == null ? null : { email: p.email, name: p.name };
  },
};

let app: Hono<AppEnv>;
let db: Db;
let runtime: PlatformRuntime;
const config: AppConfig = {
  publicUrl: "http://localhost",
  secret: "test-secret",
  emailFrom: "test@localhost",
  maxUploadBytes: 1024 * 1024 * 100,
  clerk: { publishableKey: "pk_test_x", secretKey: "sk_test_x" },
  adminEmails: ["operador@andarama.test"],
};

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

async function json<T>(res: Response | Promise<Response>): Promise<T> {
  return (await (await res).json()) as T;
}

interface MeBody {
  user: { id: string };
  orgs: { id: string }[];
}

/** Un tour de dos escenas enlazadas, con el panorama de `mediaId`. */
async function montarTour(token: string, orgId: string, title: string, mediaId: string): Promise<string> {
  const { id } = await json<{ id: string }>(call(token, "/api/v1/projects", { method: "POST", body: { orgId, title } }));
  const escenas: string[] = [];
  for (const nombre of ["Entrada", "Sala"]) {
    const s = await json<{ id: string }>(
      call(token, `/api/v1/projects/${id}/scenes`, { method: "POST", body: { title: nombre, mediaId, sourceJson: { kind: "equirect", url: `media:${mediaId}` } } }),
    );
    await call(token, `/api/v1/projects/${id}/scenes/${s.id}`, { method: "PATCH", body: { meta: { altText: `Vista de ${nombre}` } } });
    escenas.push(s.id);
  }
  await call(token, `/api/v1/projects/${id}/scenes/${escenas[0]}/hotspots`, {
    method: "POST",
    body: { type: "navigation", position: { yaw: 0, pitch: 0 }, content: { target: escenas[1], label: "A la sala", altText: "A la sala" } },
  });
  await call(token, `/api/v1/projects/${id}/scenes/${escenas[1]}/hotspots`, {
    method: "POST",
    body: { type: "navigation", position: { yaw: 0, pitch: 0 }, content: { target: escenas[0], label: "A la entrada", altText: "A la entrada" } },
  });
  return id;
}

const DESCRIPCION =
  "El castillo de San Felipe, en el Puerto de la Cruz, es una pequeña fortaleza del siglo XVII junto al mar. Este recorrido virtual " +
  "entra por la puerta del baluarte, sube a la batería y termina en la sala de exposiciones, con cada escena enlazada a la " +
  "siguiente y un texto breve sobre lo que se ve. Se puede recorrer con el ratón, con el dedo en el móvil o con unas gafas de " +
  "realidad virtual, y sirve de ejemplo de visita cultural para ayuntamientos y museos pequeños.";

let opOrg = "";
let panoramaId = "";
let sampleId = "";
let escapeId = "";
let lia: MeBody;
let liaTour = "";

beforeAll(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "anda-activacion-"));
  const sqliteDb = await createSqliteDb(":memory:");
  db = sqliteDb.db as unknown as Db;
  await migrateSqlite(sqliteDb.sqlite, migrationsDir);
  runtime = {
    platform: "node",
    publicUrl: "http://localhost",
    db: sqliteDb.db,
    kv: createSqliteKv(sqliteDb.sqlite),
    storage: createFsStorage({ rootDir: join(dataDir, "storage"), hmacSecret: "test-secret", publicUrl: "http://localhost" }),
    queue: createInProcessQueue(),
    analytics: createSqlAnalytics(sqliteDb.db),
    passwords: createArgon2Hasher(),
    email: createSmtpEmail({ from: "test@localhost" }),
    deferred: (p) => {
      void p.catch(() => {});
    },
  };
  app = createApp({ runtime, config, clerkVerifier: verifier });

  // El operador monta su organización Plantillas con un panorama ya listo
  const op = await json<MeBody>(call("tok-op", "/api/v1/me"));
  opOrg = op.orgs[0]!.id;
  panoramaId = "pano-plantilla-1";
  const key = `media/${opOrg}/${panoramaId}/original.jpg`;
  await runtime.storage.put(key, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" });
  await db.insert(media).values({
    id: panoramaId,
    orgId: opOrg,
    kind: "panorama",
    filename: "castillo.jpg",
    mime: "image/jpeg",
    bytes: 4,
    width: 8192,
    height: 4096,
    r2Key: key,
    status: "ready",
    createdBy: op.user.id,
    createdAt: Date.now(),
  });
  sampleId = await montarTour("tok-op", opOrg, "Castillo de ejemplo", panoramaId);
  escapeId = await montarTour("tok-op", opOrg, "La bodega del castillo", panoramaId);
  config.templates = parseTemplatesConfig(sampleId, `escape_room:${escapeId}, prl:no-existe`);
});

describe("configuración de las plantillas", () => {
  it("lee las dos variables de entorno", () => {
    expect(parseTemplatesConfig(undefined, undefined)).toBeUndefined();
    expect(parseTemplatesConfig(" abc ", "escape_room:x, y ,")).toEqual({
      sampleProjectId: "abc",
      projects: [
        { key: "escape_room", id: "x" },
        { key: "", id: "y" },
      ],
    });
  });
});

describe("tour de ejemplo (A4)", () => {
  it("se clona al dar de alta, marcado como ejemplo y fuera de la cuota", async () => {
    lia = await json<MeBody>(call("tok-lia", "/api/v1/me"));
    const orgId = lia.orgs[0]!.id;
    const lista = await json<{ id: string; title: string; isSample: boolean; coverMediaId: string | null }[]>(
      call("tok-lia", `/api/v1/projects?org=${orgId}`),
    );
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ title: "Castillo de ejemplo", isSample: true, coverMediaId: panoramaId });
    const escenas = await json<{ scenes: { mediaId: string }[]; hotspots: unknown[] }>(call("tok-lia", `/api/v1/projects/${lista[0]!.id}/scenes`));
    expect(escenas.scenes).toHaveLength(2);
    expect(escenas.hotspots).toHaveLength(2);
    // Los medios no se copian: siguen siendo los de la organización Plantillas
    expect(escenas.scenes.every((s) => s.mediaId === panoramaId)).toBe(true);
    const usage = await json<{ usedTours: number; quotaTours: number; usedBytes: number }>(call("tok-lia", `/api/v1/orgs/${orgId}/usage`));
    expect(usage).toMatchObject({ usedTours: 0, quotaTours: 1, usedBytes: 0 });
  });

  it("los medios de Plantillas se leen desde cualquier cuenta, pero no se tocan", async () => {
    expect((await call("tok-lia", `/api/v1/media/${panoramaId}/file`)).status).toBe(200);
    expect((await call("tok-lia", `/api/v1/media/${panoramaId}`, { method: "PATCH", body: { folder: "mío" } })).status).toBe(403);
    expect((await call("tok-lia", `/api/v1/media/${panoramaId}`, { method: "DELETE" })).status).toBe(403);
    // Los de otra organización cualquiera, no
    const max = await json<MeBody>(call("tok-max", "/api/v1/me"));
    const ajeno = await call("tok-lia", `/api/v1/media?org=${max.orgs[0]!.id}`);
    expect(ajeno.status).toBe(403);
  });

  it("la cuenta que administra la instancia no recibe ejemplo", async () => {
    const lista = await json<{ isSample: boolean }[]>(call("tok-op", `/api/v1/projects?org=${opOrg}`));
    expect(lista.some((p) => p.isSample)).toBe(false);
  });
});

describe("plantillas por sector (A6)", () => {
  it("lista solo las que existen, en el orden configurado", async () => {
    const tpl = await json<{ id: string; key: string; title: string; coverMediaId: string | null }[]>(
      call("tok-lia", "/api/v1/projects/sector-templates"),
    );
    expect(tpl).toEqual([{ id: escapeId, key: "escape_room", title: "La bodega del castillo", coverMediaId: panoramaId }]);
  });

  it("crea un proyecto desde una plantilla de otra organización", async () => {
    const orgId = lia.orgs[0]!.id;
    const res = await call("tok-lia", "/api/v1/projects", { method: "POST", body: { orgId, title: "Mi escape room", fromTemplate: escapeId } });
    expect(res.status).toBe(201);
    liaTour = (await json<{ id: string }>(res)).id;
    const escenas = await json<{ scenes: { mediaId: string }[] }>(call("tok-lia", `/api/v1/projects/${liaTour}/scenes`));
    expect(escenas.scenes).toHaveLength(2);
    // Este sí cuenta: la prueba da un recorrido y ya está usado
    const otro = await call("tok-lia", "/api/v1/projects", { method: "POST", body: { orgId, title: "Otro" } });
    expect(otro.status).toBe(403);
    expect(((await otro.json()) as { code: string }).code).toBe("quota_tours");
  });

  it("el clon compila con los medios de Plantillas y su recorrido automático apunta a sus propias escenas", async () => {
    const original = await json<{ scenes: { id: string }[] }>(call("tok-op", `/api/v1/projects/${escapeId}/scenes`));
    const pasos = original.scenes.map((s) => ({ scene: s.id, dwell: 3 }));
    await call("tok-op", `/api/v1/projects/${escapeId}`, { method: "PATCH", body: { settings: { autopilot: [{ id: "visita", title: "Visita", steps: pasos }] } } });
    const max = await json<MeBody>(call("tok-max", "/api/v1/me"));
    const res = await call("tok-max", "/api/v1/projects", { method: "POST", body: { orgId: max.orgs[0]!.id, title: "Escape de Max", fromTemplate: escapeId } });
    expect(res.status).toBe(201);
    const clon = (await json<{ id: string }>(res)).id;
    const { tour } = await json<{ tour: { scenes: { id: string; source: unknown }[]; autopilot?: { steps: { scene: string }[] }[] } }>(
      call("tok-max", `/api/v1/projects/${clon}/compile`, { method: "POST" }),
    );
    // Sin los medios de Plantillas el compilador no los resolvía: las escenas
    // se quedaban sin imagen (o fuera del tour, si no llevaban fuente propia)
    expect(tour.scenes).toHaveLength(2);
    expect(tour.scenes.every((s) => !JSON.stringify(s.source).includes("media:"))).toBe(true);
    const propias = new Set(tour.scenes.map((s) => s.id));
    expect(tour.autopilot?.[0]?.steps.every((p) => propias.has(p.scene))).toBe(true);
  });

  it("un proyecto cualquiera de otra organización sigue sin poder usarse de plantilla", async () => {
    const max = await json<MeBody>(call("tok-max", "/api/v1/me"));
    const res = await call("tok-max", "/api/v1/projects", {
      method: "POST",
      body: { orgId: max.orgs[0]!.id, title: "Copia ajena", fromTemplate: liaTour },
    });
    expect(res.status).toBe(403);
  });
});

describe("moderación de la galería (A8)", () => {
  it("una ficha nueva queda pendiente y no se lista", async () => {
    const res = await call("tok-lia", `/api/v1/projects/${liaTour}/publish`, {
      method: "POST",
      body: {
        slug: "bodega-de-lia",
        visibility: "public",
        gallery: { enabled: true, title: "Castillo de San Felipe en 360", description: DESCRIPCION, placeName: "Puerto de la Cruz", placeCountry: "ES" },
      },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { galleryUrl: string | null; gallery: { status: string }; firstForUser: boolean };
    expect(body.gallery.status).toBe("pending");
    expect(body.galleryUrl).toBeNull();
    expect(body.firstForUser).toBe(true);
    const lista = await json<{ total: number }>(call(null, "/api/v1/gallery"));
    expect(lista.total).toBe(0);
    expect((await call(null, "/explorar/bodega-de-lia/")).status).toBe(404);
    const sitemap = await (await call(null, "/sitemap-tours.xml")).text();
    expect(sitemap).toContain("/t/bodega-de-lia");
    expect(sitemap).not.toContain("/explorar/bodega-de-lia/");
  });

  it("solo un administrador ve las pendientes y las aprueba", async () => {
    expect((await call("tok-lia", "/api/v1/admin/gallery")).status).toBe(403);
    const pendientes = await json<{ projectId: string; slug: string; authorEmail: string; gallery: { status: string } }[]>(
      call("tok-op", "/api/v1/admin/gallery"),
    );
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toMatchObject({ projectId: liaTour, slug: "bodega-de-lia", authorEmail: "lia@ejemplo.es", gallery: { status: "pending" } });
    const ok = await call("tok-op", `/api/v1/admin/gallery/${liaTour}/approve`, { method: "POST", body: {} });
    expect(ok.status).toBe(200);
    const lista = await json<{ total: number; items: { slug: string }[] }>(call(null, "/api/v1/gallery"));
    expect(lista.items.map((i) => i.slug)).toEqual(["bodega-de-lia"]);
    expect((await call(null, "/explorar/bodega-de-lia/")).status).toBe(200);
    expect(await (await call(null, "/sitemap-tours.xml")).text()).toContain("/explorar/bodega-de-lia/");
  });

  it("republicar sin tocar la ficha conserva la aprobación; cambiar los textos la devuelve a revisión", async () => {
    const igual = await json<{ gallery: { status: string }; firstForUser: boolean }>(
      call("tok-lia", `/api/v1/projects/${liaTour}/publish`, { method: "POST", body: { visibility: "public" } }),
    );
    expect(igual.gallery.status).toBe("approved");
    expect(igual.firstForUser).toBe(false);
    const cambiada = await json<{ gallery: { status: string } }>(
      call("tok-lia", `/api/v1/projects/${liaTour}/publish`, {
        method: "POST",
        body: { visibility: "public", gallery: { enabled: true, title: "Compra seguidores baratos aquí" } },
      }),
    );
    expect(cambiada.gallery.status).toBe("pending");
    expect((await json<{ total: number }>(call(null, "/api/v1/gallery"))).total).toBe(0);
    const rechazo = await call("tok-op", `/api/v1/admin/gallery/${liaTour}/reject`, { method: "POST", body: {} });
    expect(rechazo.status).toBe(200);
    const rechazadas = await json<{ projectId: string }[]>(call("tok-op", "/api/v1/admin/gallery?status=rejected"));
    expect(rechazadas.map((r) => r.projectId)).toEqual([liaTour]);
    // Rechazar la ficha no despublica el recorrido
    expect((await call(null, "/t/bodega-de-lia")).status).toBe(200);
    const proyecto = await json<{ publication: { gallery: { status: string } } }>(call("tok-lia", `/api/v1/projects/${liaTour}`));
    expect(proyecto.publication.gallery.status).toBe("rejected");
  });
});

describe("primeros pasos (A5)", () => {
  it("deduce lo hecho y guarda lo que no deja rastro", async () => {
    const antes = await json<{ steps: Record<string, boolean>; hasPhotos: boolean; sampleProjectId: string | null; completed: boolean }>(
      call("tok-lia", "/api/v1/me/onboarding"),
    );
    // Sin fotos propias (las del ejemplo son de Plantillas), con punto y publicado
    expect(antes.steps).toEqual({ upload: false, hotspot: true, publish: true, share: false });
    expect(antes.hasPhotos).toBe(false);
    expect(antes.sampleProjectId).not.toBeNull();
    expect(antes.completed).toBe(false);
    expect((await call("tok-lia", "/api/v1/me/onboarding", { method: "POST", body: { step: "share" } })).status).toBe(200);
    await call("tok-lia", "/api/v1/me/onboarding", { method: "POST", body: { dismissed: true } });
    const despues = await json<{ steps: Record<string, boolean>; dismissed: boolean }>(call("tok-lia", "/api/v1/me/onboarding"));
    expect(despues.steps.share).toBe(true);
    expect(despues.dismissed).toBe(true);
    // Las preferencias de siempre no se pierden
    const me = await json<{ user: { prefs: { onboarding?: unknown } } }>(call("tok-lia", "/api/v1/me"));
    expect(me.user.prefs.onboarding).toBeDefined();
  });
});

describe("final de la prueba (A7)", () => {
  let orgId = "";
  let sceneId = "";

  it("mientras dura la prueba se edita con normalidad", async () => {
    orgId = lia.orgs[0]!.id;
    const escenas = await json<{ scenes: { id: string }[] }>(call("tok-lia", `/api/v1/projects/${liaTour}/scenes`));
    sceneId = escenas.scenes[0]!.id;
    expect((await call("tok-lia", `/api/v1/projects/${liaTour}/scenes/${sceneId}`, { method: "PATCH", body: { title: "Portón" } })).status).toBe(200);
    const proyecto = await json<{ planLocked: boolean; permissions: { canEdit: boolean } }>(call("tok-lia", `/api/v1/projects/${liaTour}`));
    expect(proyecto).toMatchObject({ planLocked: false, permissions: { canEdit: true } });
  });

  it("al caducar: lo publicado sigue, exportar sigue libre, lo demás pide plan", async () => {
    const op = await call("tok-op", `/api/v1/admin/users/${lia.user.id}`, { method: "PATCH", body: { trialEndsAt: Date.now() - 1000 } });
    expect(op.status).toBe(200);

    // El recorrido publicado sigue en línea (con la insignia)
    expect((await call(null, "/t/bodega-de-lia")).status).toBe(200);
    // Exportar sigue libre
    expect((await call("tok-lia", `/api/v1/projects/${liaTour}/export`, { method: "POST", body: {} })).status).toBe(200);
    expect((await call("tok-lia", `/api/v1/projects/${liaTour}/export.andarama`)).status).toBe(200);

    const bloqueos: [string, string, unknown][] = [
      ["PATCH", `/api/v1/projects/${liaTour}/scenes/${sceneId}`, { title: "Otra" }],
      ["POST", `/api/v1/projects/${liaTour}/scenes`, { title: "Nueva" }],
      ["POST", `/api/v1/projects/${liaTour}/scenes/${sceneId}/hotspots`, { type: "text", position: { yaw: 1, pitch: 0 }, content: { title: "x" } }],
      ["PATCH", `/api/v1/projects/${liaTour}`, { title: "Renombrado" }],
      ["PUT", `/api/v1/projects/${liaTour}/translations/en`, []],
      ["POST", `/api/v1/projects/${liaTour}/publish`, { visibility: "public" }],
      ["POST", `/api/v1/projects/${liaTour}/versions/1/restore`, {}],
      ["POST", "/api/v1/media", { orgId, kind: "panorama", filename: "nuevo.jpg", mime: "image/jpeg", bytes: 1000 }],
    ];
    for (const [method, path, body] of bloqueos) {
      const res = await call("tok-lia", path, { method, body });
      expect(res.status, `${method} ${path}`).toBe(403);
      const problema = (await res.json()) as { code: string; trialEnded: boolean };
      expect(problema, `${method} ${path}`).toMatchObject({ code: "plan_required", trialEnded: true });
    }

    // Ordenar en carpetas sigue libre
    expect((await call("tok-lia", `/api/v1/projects/${liaTour}`, { method: "PATCH", body: { folder: "Archivo" } })).status).toBe(200);
    // El editor abre en solo lectura y lo dice
    const proyecto = await json<{ planLocked: boolean; permissions: { canEdit: boolean; canPublish: boolean } }>(
      call("tok-lia", `/api/v1/projects/${liaTour}`),
    );
    expect(proyecto).toMatchObject({ planLocked: true, permissions: { canEdit: false, canPublish: false } });
    const usage = await json<{ planLocked: boolean }>(call("tok-lia", `/api/v1/orgs/${orgId}/usage`));
    expect(usage.planLocked).toBe(true);
    // Despublicar sigue en su mano
    expect((await call("tok-lia", `/api/v1/projects/${liaTour}/unpublish`, { method: "POST", body: {} })).status).toBe(200);
  });

  it("con un plan de pago nada de esto se aplica", async () => {
    const max = await json<MeBody>(call("tok-max", "/api/v1/me"));
    const orgId = max.orgs[0]!.id;
    const usage = await json<{ planLocked: boolean }>(call("tok-max", `/api/v1/orgs/${orgId}/usage`));
    expect(usage.planLocked).toBe(false);
    const res = await call("tok-max", "/api/v1/media", {
      method: "POST",
      body: { orgId, kind: "panorama", filename: "nuevo.jpg", mime: "image/jpeg", bytes: 1000 },
    });
    expect(res.status).toBe(201);
  });
});
