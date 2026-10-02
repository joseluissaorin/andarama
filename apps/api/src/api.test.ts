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

/**
 * Tests de integracion de la API completa: la misma app Hono que corre en
 * Workers y Node, con adaptadores locales (SQLite en memoria + FS temporal).
 * Cubre el flujo critico: registro -> proyecto -> escenas/hotspots ->
 * compilar -> publicar -> visor publico -> analitica -> autorizacion.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../packages/db/migrations");

let app: Hono<AppEnv>;
let testRuntime: PlatformRuntime;
let cookies = "";
let csrf = "";

async function call(path: string, opts: { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  let body: string | undefined;
  if (opts.body != null) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.auth !== false && cookies !== "") {
    headers.cookie = cookies;
    if ((opts.method ?? "GET") !== "GET") headers["x-csrf-token"] = csrf;
  }
  const res = await app.request(`http://localhost${path}`, { method: opts.method ?? "GET", headers, body });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    if (pair == null) continue;
    const [name] = pair.split("=");
    // actualizar el tarro de cookies
    const jar = new Map(cookies.split("; ").filter(Boolean).map((c) => [c.split("=")[0]!, c]));
    jar.set(name!, pair);
    cookies = [...jar.values()].join("; ");
    if (name === "u3c") csrf = pair.split("=")[1] ?? "";
  }
  return res;
}

beforeAll(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "anda-test-"));
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
  testRuntime = runtime;
  app = createApp({
    runtime,
    config: { publicUrl: "http://localhost", secret: "test-secret", emailFrom: "test@localhost", maxUploadBytes: 1024 * 1024 * 100 },
  });
});

let orgId = "";
let projectId = "";
let sceneA = "";
let sceneB = "";
let publishedSlug = "";

describe("flujo critico", () => {
  it("salud y OpenAPI", async () => {
    expect((await call("/api/v1/health")).status).toBe(200);
    const openapi = (await (await call("/api/v1/openapi.json")).json()) as { openapi: string };
    expect(openapi.openapi).toBe("3.1.0");
  });

  it("registro del primer usuario (admin de instancia) con sesion", async () => {
    const res = await call("/api/v1/auth/register", {
      method: "POST",
      body: { email: "admin@test.ull", name: "Admin", password: "password-larga-1", orgName: "ULL Test" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { isInstanceAdmin: boolean };
    expect(body.isInstanceAdmin).toBe(true);
    const me = (await (await call("/api/v1/me")).json()) as { user: { email: string }; orgs: { id: string }[] };
    expect(me.user.email).toBe("admin@test.ull");
    orgId = me.orgs[0]!.id;
  });

  it("rechaza mutaciones sin CSRF", async () => {
    const res = await app.request("http://localhost/api/v1/projects", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ orgId, title: "X" }),
    });
    expect(res.status).toBe(403);
  });

  it("crea proyecto, escenas y hotspots", async () => {
    const res = await call("/api/v1/projects", { method: "POST", body: { orgId, title: "Tour de prueba" } });
    expect(res.status).toBe(201);
    projectId = ((await res.json()) as { id: string }).id;

    const s1 = await call(`/api/v1/projects/${projectId}/scenes`, {
      method: "POST",
      body: { title: "Entrada", sourceJson: { kind: "equirect", url: "media:falso" } },
    });
    sceneA = ((await s1.json()) as { id: string }).id;
    const s2 = await call(`/api/v1/projects/${projectId}/scenes`, {
      method: "POST",
      body: { title: "Aula", sourceJson: { kind: "equirect", url: "media:falso" } },
    });
    sceneB = ((await s2.json()) as { id: string }).id;

    // Escena con metadatos accesibles
    await call(`/api/v1/projects/${projectId}/scenes/${sceneA}`, {
      method: "PATCH",
      body: { meta: { altText: "Entrada del edificio" }, initialView: { yaw: 0.4, pitch: 0, fov: 1.2 } },
    });
    await call(`/api/v1/projects/${projectId}/scenes/${sceneB}`, { method: "PATCH", body: { meta: { altText: "Aula" } } });

    const h1 = await call(`/api/v1/projects/${projectId}/scenes/${sceneA}/hotspots`, {
      method: "POST",
      body: {
        type: "navigation",
        position: { yaw: 1, pitch: 0 },
        content: { target: sceneB, label: "Ir al aula", altText: "Ir al aula" },
      },
    });
    expect(h1.status).toBe(201);
    // La vuelta es otro hotspot de navegación: el grafo no tiene datos propios
    const h2 = await call(`/api/v1/projects/${projectId}/scenes/${sceneB}/hotspots`, {
      method: "POST",
      body: {
        type: "navigation",
        position: { yaw: Math.PI, pitch: -0.17 },
        content: { target: sceneA, label: "Volver", altText: "Volver", entry: { mode: "lookBack" } },
      },
    });
    expect(h2.status).toBe(201);
  });

  it("compila el borrador a tour.json valido", async () => {
    const res = await call(`/api/v1/projects/${projectId}/compile`, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    const { tour, issues } = (await res.json()) as { tour: { scenes: unknown[]; start: { scene: string } }; issues: { severity: string }[] };
    expect(tour.scenes.length).toBe(2);
    expect(tour.start.scene).toBe(sceneA);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("las áreas dan los planos y la categoría del menú de escenas", async () => {
    // Un área con plano es una planta; la misma área es la categoría con la
    // que el visor agrupa el menú de escenas. Una sola cosa, dos salidas.
    await call(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      body: {
        settings: {
          areas: [
            { id: "planta0", title: "Planta baja", color: "#7c3aed", level: 0, plan: { url: "media:falso", widthMeters: 42 } },
            { id: "sinplano", title: "Jardín" },
          ],
        },
      },
    });
    await call(`/api/v1/projects/${projectId}/scenes/${sceneA}`, {
      method: "PATCH",
      body: { meta: { altText: "Entrada del edificio", area: "planta0", category: "Planta baja" } },
    });

    const res = await call(`/api/v1/projects/${projectId}/compile`, { method: "POST", body: {} });
    const { tour } = (await res.json()) as {
      tour: { floorplans?: { id: string; title: unknown; url: string; level?: number }[]; scenes: { id: string; category?: unknown }[] };
    };
    // Solo las áreas con plano se publican como plantas
    expect(tour.floorplans?.map((f) => f.id)).toEqual(["planta0"]);
    expect(tour.floorplans?.[0]!.level).toBe(0);
    expect(tour.scenes.find((s) => s.id === sceneA)?.category).toBe("Planta baja");
  });

  it("el compilador pasa el texto de la insignia y la cesión de la música global", async () => {
    await call(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      body: { settings: { ui: { badgeText: "Un recorrido del Museo" }, globalAudio: { url: "https://example.com/musica.mp3" } } },
    });
    await call(`/api/v1/projects/${projectId}/scenes/${sceneB}`, {
      method: "PATCH",
      body: { audio: { ambient: { url: "https://example.com/aula.mp3" }, replaceGlobal: false } },
    });
    const res = await call(`/api/v1/projects/${projectId}/compile`, { method: "POST", body: {} });
    const { tour } = (await res.json()) as {
      tour: { ui?: { badgeText?: string }; globalAudio?: { url: string }; scenes: { id: string; audio?: { replaceGlobal?: boolean } }[] };
    };
    expect(tour.ui?.badgeText).toBe("Un recorrido del Museo");
    expect(tour.globalAudio?.url).toBe("https://example.com/musica.mp3");
    expect(tour.scenes.find((s) => s.id === sceneB)?.audio?.replaceGlobal).toBe(false);
    // Se deja como estaba para el resto de pruebas
    await call(`/api/v1/projects/${projectId}`, { method: "PATCH", body: { settings: { ui: {}, globalAudio: null } } });
    await call(`/api/v1/projects/${projectId}/scenes/${sceneB}`, { method: "PATCH", body: { audio: null } });
  });

  it("el título del área se traduce y arrastra la categoría", async () => {
    await call(`/api/v1/projects/${projectId}/translations/en`, {
      method: "PUT",
      body: [{ entity: "area", entityId: "planta0", field: "title", value: "Ground floor" }],
    });
    const res = await call(`/api/v1/projects/${projectId}/compile`, { method: "POST", body: {} });
    const { tour } = (await res.json()) as {
      tour: { floorplans?: { title: Record<string, string> }[]; scenes: { id: string; category?: Record<string, string> }[] };
    };
    expect(tour.floorplans?.[0]!.title).toMatchObject({ es: "Planta baja", en: "Ground floor" });
    expect(tour.scenes.find((s) => s.id === sceneA)?.category).toMatchObject({ es: "Planta baja", en: "Ground floor" });
  });

  it("gestiona traducciones con export XLIFF", async () => {
    const put = await call(`/api/v1/projects/${projectId}/translations/en`, {
      method: "PUT",
      body: [
        { entity: "tour", entityId: "meta", field: "title", value: "Test tour" },
        { entity: "scene", entityId: sceneA, field: "title", value: "Entrance" },
      ],
    });
    expect(put.status).toBe(200);
    const xliff = await call(`/api/v1/projects/${projectId}/translations/en/xliff`);
    const xml = await xliff.text();
    expect(xml).toContain('target-language="en"');
    expect(xml).toContain("Entrance");
  });

  it("publica y sirve el tour sin base de datos", async () => {
    const res = await call(`/api/v1/projects/${projectId}/publish`, { method: "POST", body: { visibility: "public" } });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string; version: number };
    publishedSlug = body.slug;
    expect(body.version).toBe(1);

    // El visor publico no requiere sesion
    const page = await call(`/t/${publishedSlug}`, { auth: false });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Tour de prueba");
    expect(html).toContain("/viewer/viewer.js");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors");

    const tourJson = await call(`/t/${publishedSlug}/tour.json`, { auth: false });
    expect(tourJson.status).toBe(200);
    const tour = (await tourJson.json()) as { version: number };
    expect(tour.version).toBe(1);
  });

  it("republicar se ve al recargar: HTML sin caché y tour.json con la versión en la URL", async () => {
    const page = await call(`/t/${publishedSlug}`, { auth: false });
    expect(page.headers.get("cache-control")).toBe("public, no-cache");
    expect(await page.text()).toContain(`/t/${publishedSlug}/tour.json?v=1`);
    const fijo = await call(`/t/${publishedSlug}/tour.json?v=1`, { auth: false });
    expect(fijo.headers.get("cache-control")).toContain("immutable");
    const suelto = await call(`/t/${publishedSlug}/tour.json`, { auth: false });
    expect(suelto.headers.get("cache-control")).toBe("public, no-cache");

    const re = await call(`/api/v1/projects/${projectId}/publish`, { method: "POST", body: { visibility: "public" } });
    const { version } = (await re.json()) as { version: number };
    expect(version).toBe(2);
    // El HTML ya apunta a la nueva versión y la vieja deja de ser inmutable
    expect(await (await call(`/t/${publishedSlug}`, { auth: false })).text()).toContain(`tour.json?v=2`);
    const viejo = await call(`/t/${publishedSlug}/tour.json?v=1`, { auth: false });
    expect(viejo.headers.get("cache-control")).toBe("public, no-cache");
  });

  it("el enlace se puede publicar en modo quiosco, y el normal lo admite por parametro", async () => {
    // Publicado como quiosco: la pagina sale ya en bucle, sin parametros
    const res = await call(`/api/v1/projects/${projectId}/publish`, {
      method: "POST",
      body: { visibility: "public", kiosk: true },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { url: string; kioskUrl: string; tourUrl: string; kiosk: boolean };
    expect(body.kiosk).toBe(true);
    // Publicado en quiosco, el enlace limpio ES el de quiosco
    expect(body.kioskUrl).not.toContain("kiosk=");
    expect(body.kioskUrl).toBe(body.url);
    const quiosco = await call(`/t/${publishedSlug}`, { auth: false });
    expect(await quiosco.text()).toContain('"kiosk":true');
    // Y del tour en bucle se puede sacar el recorrido suelto sin republicar
    expect(body.tourUrl).toContain("kiosk=0");
    const suelto = await call(`/t/${publishedSlug}?kiosk=0`, { auth: false });
    expect(await suelto.text()).not.toContain('"kiosk":true');

    // Republicar sin decir nada conserva el modo elegido
    await call(`/api/v1/projects/${projectId}/publish`, { method: "POST", body: { visibility: "public" } });
    expect(await (await call(`/t/${publishedSlug}`, { auth: false })).text()).toContain('"kiosk":true');

    // Y se puede volver al recorrido normal, que sigue admitiendo el parametro
    const normal = await call(`/api/v1/projects/${projectId}/publish`, {
      method: "POST",
      body: { visibility: "public", kiosk: false },
    });
    const cuerpoNormal = (await normal.json()) as { kiosk: boolean; kioskUrl: string; tourUrl: string };
    expect(cuerpoNormal.kiosk).toBe(false);
    // Y ahora el que lleva parametro es el de quiosco
    expect(cuerpoNormal.kioskUrl).toContain("kiosk=1");
    expect(cuerpoNormal.tourUrl).not.toContain("kiosk=");
    expect(await (await call(`/t/${publishedSlug}`, { auth: false })).text()).not.toContain('"kiosk":true');
    expect(await (await call(`/t/${publishedSlug}?kiosk=1`, { auth: false })).text()).toContain('"kiosk":true');
  });

  it("proteccion por contrasena", async () => {
    await call(`/api/v1/projects/${projectId}/publish`, {
      method: "POST",
      body: { visibility: "password", password: "secreta123" },
    });
    const blocked = await call(`/t/${publishedSlug}`, { auth: false });
    expect(blocked.status).toBe(401);
    expect(await blocked.text()).toContain("protegido");
    // volver a publico para el resto de tests
    await call(`/api/v1/projects/${projectId}/publish`, { method: "POST", body: { visibility: "public" } });
  });

  it("ingesta y consulta de analitica sin cookies", async () => {
    const ingest = await call("/ingest/e", {
      auth: false,
      method: "POST",
      body: {
        events: [
          { t: publishedSlug, e: "view", sid: "s1", d: "desktop", l: "es" },
          { t: publishedSlug, e: "scene", s: sceneA, sid: "s1" },
          { t: publishedSlug, e: "heartbeat", s: sceneA, yb: 4, pb: 3, sid: "s1" },
        ],
      },
    });
    expect(ingest.status).toBe(200);
    const summary = (await (
      await call(`/api/v1/projects/${projectId}/analytics?from=0&to=${Date.now() + 1000}`)
    ).json()) as { visits: number; heatmap: unknown[] };
    expect(summary.visits).toBe(1);
    expect(summary.heatmap.length).toBe(1);
  });

  it("recibe envios de formulario publicos y los exporta a CSV", async () => {
    const submit = await call(`/api/v1/public/forms/${publishedSlug}`, {
      auth: false,
      method: "POST",
      body: { hotspotId: "h-form", lang: "es", data: { nombre: "Alguien", email: "a@b.c" } },
    });
    expect(submit.status).toBe(201);
    const csv = await (await call(`/api/v1/projects/${projectId}/submissions.csv`)).text();
    expect(csv).toContain("Alguien");
  });

  it("resultados de quiz publicos", async () => {
    // El tour publicado no tiene preguntas: la nota que diga el navegador
    // no cuenta, no hay nada que puntuar
    const res = await call(`/api/v1/public/quiz/${publishedSlug}`, {
      auth: false,
      method: "POST",
      body: { sessionId: "s1", score: 2, maxScore: 3, passed: true, detail: [], participantName: "Estudiante" },
    });
    expect(res.status).toBe(201);
    const list = (await (await call(`/api/v1/projects/${projectId}/quiz-results`)).json()) as { score: number; maxScore: number; participantName: string }[];
    expect(list[0]!.score).toBe(0);
    expect(list[0]!.maxScore).toBe(0);
    expect(list[0]!.participantName).toBe("Estudiante");
  });

  describe("quiz con nota del servidor, LTI y formulario de un solo envío", () => {
    const quizA = "quizA-000001";
    const quizB = "quizB-000001";
    const formOnce = "formOnce-0001";

    it("publica un tour con dos preguntas y un formulario de un solo envío", async () => {
      const q1 = await call(`/api/v1/projects/${projectId}/scenes/${sceneA}/hotspots`, {
        method: "POST",
        body: {
          id: quizA,
          type: "quiz",
          position: { yaw: 0.5, pitch: 0 },
          content: {
            question: "¿Capital de Canarias?",
            kind: "single",
            points: 2,
            gate: true,
            options: [
              { id: "a", text: "Santa Cruz y Las Palmas", correct: true },
              { id: "b", text: "La Laguna" },
            ],
          },
        },
      });
      expect(q1.status).toBe(201);
      const q2 = await call(`/api/v1/projects/${projectId}/scenes/${sceneA}/hotspots`, {
        method: "POST",
        body: {
          id: quizB,
          type: "quiz",
          position: { yaw: 0.8, pitch: 0 },
          content: {
            question: "¿Qué islas son volcánicas?",
            kind: "multiple",
            options: [
              { id: "x", text: "Tenerife", correct: true },
              { id: "y", text: "La Palma", correct: true },
              { id: "z", text: "Ninguna" },
            ],
          },
        },
      });
      expect(q2.status).toBe(201);
      const f = await call(`/api/v1/projects/${projectId}/scenes/${sceneA}/hotspots`, {
        method: "POST",
        body: {
          id: formOnce,
          type: "form",
          position: { yaw: 1.2, pitch: 0 },
          content: { once: true, fields: [{ id: "nombre", type: "text", label: "Nombre" }], destination: { api: true } },
        },
      });
      expect(f.status).toBe(201);
      const pub = await call(`/api/v1/projects/${projectId}/publish`, { method: "POST", body: { visibility: "public" } });
      expect(pub.status).toBe(201);
      // La página publicada lleva el endpoint del quiz
      const html = await (await call(`/t/${publishedSlug}`, { auth: false })).text();
      expect(html).toContain(`/api/v1/public/quiz/${publishedSlug}`);
    });

    it("el servidor recalcula la nota con las opciones marcadas e ignora la del navegador", async () => {
      const res = await call(`/api/v1/public/quiz/${publishedSlug}`, {
        auth: false,
        method: "POST",
        body: {
          sessionId: "s-nota",
          score: 999,
          maxScore: 999,
          passed: true,
          detail: [
            { hotspotId: quizA, correct: true, points: 2, selected: ["a"] },
            // Dice que acertó, pero marcó solo una de las dos correctas
            { hotspotId: quizB, correct: true, points: 50, selected: ["x"] },
            { hotspotId: "inventada", correct: true, points: 100, selected: ["a"] },
          ],
        },
      });
      expect(res.status).toBe(201);
      const nota = (await res.json()) as { score: number; maxScore: number };
      expect(nota).toMatchObject({ score: 2, maxScore: 3 });
      const list = (await (await call(`/api/v1/projects/${projectId}/quiz-results`)).json()) as { sessionId: string; score: number; maxScore: number }[];
      const fila = list.find((r) => r.sessionId === "s-nota")!;
      expect(fila.score).toBe(2);
      expect(fila.maxScore).toBe(3);
    });

    it("sin opciones marcadas no hay acierto, diga lo que diga el navegador", async () => {
      const res = await call(`/api/v1/public/quiz/${publishedSlug}`, {
        auth: false,
        method: "POST",
        body: { sessionId: "s-trampa", detail: [{ hotspotId: quizA, correct: true, points: 2 }, { hotspotId: quizB, correct: true, points: 1 }] },
      });
      expect(((await res.json()) as { score: number }).score).toBe(0);
    });

    it("con ?lti= del mismo tour, el resultado queda ligado al lanzamiento y lleva su nombre", async () => {
      await testRuntime.kv.put(
        "lti-launch:0123456789abcdef",
        JSON.stringify({ registrationId: "no-existe", issuer: "https://moodle.test", clientId: "c", sub: "u1", name: "Alumna LTI", slug: publishedSlug }),
        { ttlSeconds: 600 },
      );
      await testRuntime.kv.put(
        "lti-launch:fedcba9876543210",
        JSON.stringify({ registrationId: "no-existe", issuer: "https://moodle.test", clientId: "c", sub: "u2", slug: "otro-tour" }),
        { ttlSeconds: 600 },
      );
      const ok = await call(`/api/v1/public/quiz/${publishedSlug}`, {
        auth: false,
        method: "POST",
        body: { sessionId: "s-lti", ltiLaunchId: "0123456789abcdef", detail: [{ hotspotId: quizA, selected: ["a"] }, { hotspotId: quizB, selected: ["x", "y"] }] },
      });
      expect(ok.status).toBe(201);
      expect(await ok.json()).toMatchObject({ score: 3, maxScore: 3 });
      const ajeno = await call(`/api/v1/public/quiz/${publishedSlug}`, {
        auth: false,
        method: "POST",
        body: { sessionId: "s-lti-ajeno", ltiLaunchId: "fedcba9876543210", detail: [] },
      });
      expect(ajeno.status).toBe(201);
      const list = (await (await call(`/api/v1/projects/${projectId}/quiz-results`)).json()) as { sessionId: string; lti: boolean; participantName: string | null }[];
      const lti = list.find((r) => r.sessionId === "s-lti")!;
      expect(lti.lti).toBe(true);
      expect(lti.participantName).toBe("Alumna LTI");
      // Un lanzamiento de otro tour no se reutiliza para devolver notas
      expect(list.find((r) => r.sessionId === "s-lti-ajeno")!.lti).toBe(false);
    });

    it("el formulario de un solo envío rechaza el segundo del mismo visitante", async () => {
      const enviar = (visitorId: string): Promise<Response> =>
        call(`/api/v1/public/forms/${publishedSlug}`, {
          auth: false,
          method: "POST",
          body: { hotspotId: formOnce, data: { nombre: "Ana" }, visitorId },
        });
      expect((await enviar("visitante-0001")).status).toBe(201);
      const repetido = await enviar("visitante-0001");
      expect(repetido.status).toBe(409);
      expect(await repetido.json()).toMatchObject({ alreadySubmitted: true });
      // Otro visitante (aunque salga por la misma IP del aula) sí puede
      expect((await enviar("visitante-0002")).status).toBe(201);
      // Un formulario normal admite varios envíos
      const normal = (): Promise<Response> =>
        call(`/api/v1/public/forms/${publishedSlug}`, {
          auth: false,
          method: "POST",
          body: { hotspotId: "h-form", data: { nombre: "Luis" }, visitorId: "visitante-0001" },
        });
      expect((await normal()).status).toBe(201);
      expect((await normal()).status).toBe(201);
    });
  });

  it("tokens de API con scopes", async () => {
    const created = (await (
      await call("/api/v1/tokens", { method: "POST", body: { name: "ci", scopes: ["projects:read"] } })
    ).json()) as { token: string };
    expect(created.token.startsWith("andarama_")).toBe(true);
    // lectura permitida
    const ok = await app.request(`http://localhost/api/v1/projects/${projectId}`, {
      headers: { authorization: `Bearer ${created.token}` },
    });
    expect(ok.status).toBe(200);
    // escritura denegada por scope
    const denied = await app.request(`http://localhost/api/v1/projects/${projectId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${created.token}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "Hackeado" }),
    });
    expect(denied.status).toBe(403);
  });

  it("segundo usuario sin acceso al proyecto ajeno", async () => {
    const savedCookies = cookies;
    const savedCsrf = csrf;
    cookies = "";
    csrf = "";
    await call("/api/v1/auth/register", {
      method: "POST",
      body: { email: "otro@test.ull", name: "Otro", password: "password-larga-2" },
    });
    const res = await call(`/api/v1/projects/${projectId}`);
    expect([403, 404]).toContain(res.status);
    cookies = savedCookies;
    csrf = savedCsrf;
  });

  it("el slug ocupado por otra organización se resuelve con sufijo y aviso", async () => {
    const savedCookies = cookies;
    const savedCsrf = csrf;
    cookies = "";
    csrf = "";
    await call("/api/v1/auth/login", { method: "POST", body: { email: "otro@test.ull", password: "password-larga-2" } });
    const propia = (await (await call("/api/v1/me")).json()) as { orgs: { id: string }[] };
    const creado = await call("/api/v1/projects", { method: "POST", body: { orgId: propia.orgs[0]!.id, title: "Tour de prueba" } });
    const ajeno = ((await creado.json()) as { id: string }).id;
    await call(`/api/v1/projects/${ajeno}/scenes`, {
      method: "POST",
      body: { title: "Única", sourceJson: { kind: "equirect", url: "media:falso" } },
    });
    // Mientras se escribe, el diálogo ya sabe que está ocupada y cuál sugerir
    const check = (await (await call(`/api/v1/projects/${ajeno}/publish/slug?slug=${publishedSlug}`)).json()) as { status: string; suggested: string };
    expect(check.status).toBe("taken");
    expect(check.suggested).toBe(`${publishedSlug}-2`);
    // Publicar pidiendo la misma dirección ya no da 409: se añade sufijo y se avisa
    const pub = await call(`/api/v1/projects/${ajeno}/publish`, { method: "POST", body: { slug: publishedSlug, visibility: "public" } });
    expect(pub.status).toBe(201);
    const body = (await pub.json()) as { slug: string; slugChanged?: { requested: string; reason: string } };
    expect(body.slug).toBe(`${publishedSlug}-2`);
    expect(body.slugChanged).toEqual({ requested: publishedSlug, reason: "taken" });
    // Republicar conserva la suya, sin más avisos
    const re = (await (await call(`/api/v1/projects/${ajeno}/publish`, { method: "POST", body: { visibility: "public" } })).json()) as {
      slug: string;
      slugChanged?: unknown;
    };
    expect(re.slug).toBe(`${publishedSlug}-2`);
    expect(re.slugChanged).toBeUndefined();
    expect(((await (await call(`/api/v1/projects/${ajeno}/publish/slug?slug=${publishedSlug}-2`)).json()) as { status: string }).status).toBe("own");
    await call(`/api/v1/projects/${ajeno}/unpublish`, { method: "POST", body: {} });
    await call(`/api/v1/projects/${ajeno}`, { method: "DELETE" });
    cookies = savedCookies;
    csrf = savedCsrf;

    // Dentro de la misma organización, escribirla a mano pide otra con sugerencia
    const mio = await call("/api/v1/projects", { method: "POST", body: { orgId, title: "Otro tour" } });
    const mioId = ((await mio.json()) as { id: string }).id;
    await call(`/api/v1/projects/${mioId}/scenes`, {
      method: "POST",
      body: { title: "Única", sourceJson: { kind: "equirect", url: "media:falso" } },
    });
    const choque = await call(`/api/v1/projects/${mioId}/publish`, { method: "POST", body: { slug: publishedSlug, visibility: "public" } });
    expect(choque.status).toBe(409);
    const problema = (await choque.json()) as { detail: string; suggestedSlug: string; reason: string };
    expect(problema.reason).toBe("org");
    expect(problema.suggestedSlug).toMatch(new RegExp(`^${publishedSlug}-\\d$`));
    expect(problema.detail).toContain("tu organización");
    await call(`/api/v1/projects/${mioId}`, { method: "DELETE" });
  });

  it("plantillas: hereda la configuracion y no cruza organizaciones", async () => {
    // Marcar el proyecto como plantilla y darle una configuracion propia
    await call(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      body: { isTemplate: true, settings: { langs: ["es", "en"], ui: { theme: { base: "anda", primaryColor: "#f59e00" } } } },
    });
    const creado = await call("/api/v1/projects", {
      method: "POST",
      body: { orgId, title: "Desde plantilla", fromTemplate: projectId, defaultLang: "es" },
    });
    expect(creado.status).toBe(201);
    const { id: nuevoId } = (await creado.json()) as { id: string };
    const detalle = (await (await call(`/api/v1/projects/${nuevoId}`)).json()) as {
      settings: { langs: string[]; ui: { theme: { primaryColor?: string } } };
    };
    // La plantilla vale por su configuracion, no solo por sus escenas
    expect(detalle.settings.langs).toEqual(["es", "en"]);
    expect(detalle.settings.ui.theme.primaryColor).toBe("#f59e00");
    const contenido = (await (await call(`/api/v1/projects/${nuevoId}/scenes`)).json()) as {
      scenes: unknown[];
      hotspots: unknown[];
    };
    expect(contenido.scenes.length).toBeGreaterThan(0);
    expect(contenido.hotspots.length).toBeGreaterThan(0);

    // Un usuario ajeno no puede clonar el contenido conociendo el id
    const savedCookies = cookies;
    const savedCsrf = csrf;
    cookies = "";
    csrf = "";
    await call("/api/v1/auth/login", { method: "POST", body: { email: "otro@test.ull", password: "password-larga-2" } });
    const propia = (await (await call("/api/v1/me")).json()) as { orgs: { id: string }[] };
    const intruso = await call("/api/v1/projects", {
      method: "POST",
      body: { orgId: propia.orgs[0]!.id, title: "Robado", fromTemplate: projectId, defaultLang: "es" },
    });
    expect([403, 404]).toContain(intruso.status);
    cookies = savedCookies;
    csrf = savedCsrf;

    await call(`/api/v1/projects/${nuevoId}`, { method: "DELETE" });
    await call(`/api/v1/projects/${projectId}`, { method: "PATCH", body: { isTemplate: false } });
  });

  it("papelera y restauracion", async () => {
    await call(`/api/v1/projects/${projectId}`, { method: "DELETE" });
    const list = (await (await call(`/api/v1/projects?org=${orgId}`)).json()) as unknown[];
    expect(list.length).toBe(0);
    const trash = (await (await call(`/api/v1/projects?org=${orgId}&trashed=1`)).json()) as { id: string }[];
    expect(trash[0]!.id).toBe(projectId);
    await call(`/api/v1/projects/${projectId}/restore`, { method: "POST", body: {} });
    const restored = (await (await call(`/api/v1/projects?org=${orgId}`)).json()) as unknown[];
    expect(restored.length).toBe(1);
  });

  it("admin: resumen, ajustes y auditoria", async () => {
    const overview = (await (await call("/api/v1/admin/overview")).json()) as { users: number };
    expect(overview.users).toBe(2);
    const settings = await call("/api/v1/admin/settings", { method: "PUT", body: { registration: "domain", allowedDomains: ["andarama.com"] } });
    expect(settings.status).toBe(200);
    // registro bloqueado por dominio
    cookies = "";
    csrf = "";
    const blocked = await call("/api/v1/auth/register", {
      method: "POST",
      body: { email: "x@gmail.com", name: "X", password: "password-larga-3" },
    });
    expect(blocked.status).toBe(403);
    const audit = await call("/api/v1/admin/audit");
    expect(audit.status).toBe(401); // sesion borrada
  });
});
