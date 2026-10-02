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
import { exportScope, signExportToken, verifyExportToken } from "./lib/export-token.js";

/**
 * Descarga del export ZIP con vale firmado: el vale se firma una vez en
 * POST /export y cada fichero se sirve sin sesión. Y la vista previa ya no
 * da 500 si KV rechaza la escritura del mapa de assets.
 */

const SECRET = "test-secret";

describe("vale de descarga del export", () => {
  it("el alcance cubre cada carpeta de medio una sola vez", () => {
    const scope = exportScope({
      assets: {
        "a/media/m1.jpg": "media/org1/m1/original.jpg",
        "a/thumb/m1.jpg": "media/org1/m1/thumb.jpg",
        "a/media/m2.mp3": "media/tpl/m2/original.mp3",
      },
      prefixes: { "a/tiles/m1/": "media/org1/m1/tiles/", "a/tiles/m3/": "media/org1/m3/tiles/" },
    });
    expect(scope.sort()).toEqual(["media/org1/m1/", "media/org1/m3/tiles/", "media/tpl/m2/"]);
  });

  it("si el alcance no cabe en una URL, se acorta a la carpeta de cada organización", () => {
    const assets: Record<string, string> = {};
    for (let i = 0; i < 400; i++)
      assets[`a/media/m${i}.jpg`] = `media/org1/medio-${String(i).padStart(20, "0")}/original.jpg`;
    assets["a/media/t.jpg"] = "media/tpl/t1/original.jpg";
    expect(exportScope({ assets, prefixes: {} }).sort()).toEqual(["media/org1/", "media/tpl/"]);
  });

  it("firma y verifica: proyecto, prefijos, caducidad y firma", async () => {
    const token = await signExportToken(SECRET, "p1", ["media/org1/m1/"]);
    expect(await verifyExportToken(SECRET, token, "p1", "media/org1/m1/tiles/2/f/3/3.webp")).toBe(true);
    // Otro proyecto, otra carpeta, salir por «..», otro secreto
    expect(await verifyExportToken(SECRET, token, "p2", "media/org1/m1/tiles/2/f/3/3.webp")).toBe(false);
    expect(await verifyExportToken(SECRET, token, "p1", "media/org1/m2/original.jpg")).toBe(false);
    expect(await verifyExportToken(SECRET, token, "p1", "media/org1/m1/../m2/original.jpg")).toBe(false);
    expect(await verifyExportToken("otro-secreto", token, "p1", "media/org1/m1/original.jpg")).toBe(false);
    // Cuerpo manipulado: se amplía el alcance sin volver a firmar
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "p1", e: 9_999_999_999, s: ["media/"] })).toString(
      "base64url",
    );
    expect(await verifyExportToken(SECRET, `${forged}.${sig}`, "p1", "media/org2/x/original.jpg")).toBe(
      false,
    );
    expect(await verifyExportToken(SECRET, "basura", "p1", "media/org1/m1/original.jpg")).toBe(false);
    // Caducado
    const expired = await signExportToken(SECRET, "p1", ["media/org1/m1/"], -10);
    expect(await verifyExportToken(SECRET, expired, "p1", "media/org1/m1/original.jpg")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../packages/db/migrations");

let app: Hono<AppEnv>;
let runtime: PlatformRuntime;
let kvPutFails = false;
let cookies = "";
let csrf = "";
let projectId = "";

async function call(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
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
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    if (pair == null) continue;
    const [name] = pair.split("=");
    const jar = new Map(
      cookies
        .split("; ")
        .filter(Boolean)
        .map((c) => [c.split("=")[0]!, c]),
    );
    jar.set(name!, pair);
    cookies = [...jar.values()].join("; ");
    if (name === "u3c") csrf = pair.split("=")[1] ?? "";
  }
  return res;
}

beforeAll(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "anda-export-blob-"));
  const { db, sqlite } = await createSqliteDb(":memory:");
  await migrateSqlite(sqlite, migrationsDir);
  const kv = createSqliteKv(sqlite);
  runtime = {
    platform: "node",
    publicUrl: "http://localhost",
    db,
    // KV que puede fallar como el de Cloudflare con más de una escritura por segundo
    kv: {
      ...kv,
      get: kv.get.bind(kv),
      delete: kv.delete.bind(kv),
      put: async (...args: Parameters<typeof kv.put>) => {
        if (kvPutFails) throw new Error("KV PUT failed: 429 Too Many Requests");
        return kv.put(...args);
      },
    },
    storage: createFsStorage({
      rootDir: join(dataDir, "storage"),
      hmacSecret: SECRET,
      publicUrl: "http://localhost",
    }),
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
      secret: SECRET,
      emailFrom: "test@localhost",
      maxUploadBytes: 1024 * 1024 * 100,
    },
  });
  await call("/api/v1/auth/register", {
    method: "POST",
    body: { email: "admin@test.ull", name: "Admin", password: "password-larga-1", orgName: "ULL Test" },
  });
  const me = (await (await call("/api/v1/me")).json()) as { orgs: { id: string }[] };
  const res = await call("/api/v1/projects", {
    method: "POST",
    body: { orgId: me.orgs[0]!.id, title: "Tour exportable" },
  });
  projectId = ((await res.json()) as { id: string }).id;
  await call(`/api/v1/projects/${projectId}/scenes`, {
    method: "POST",
    body: { title: "Entrada", sourceJson: { kind: "equirect", url: "media:falso" } },
  });
});

describe("rutas del export", () => {
  it("POST /export devuelve un vale de descarga para el proyecto", async () => {
    const res = await call(`/api/v1/projects/${projectId}/export`, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; assets: unknown[] };
    expect(typeof body.token).toBe("string");
    expect(body.token).toMatch(/^[\w-]+\.[0-9a-f]{64}$/);
  });

  it("sirve un fichero con el vale, sin sesión y con su tipo", async () => {
    const key = "media/org1/m1/tiles/2/f/3/3.webp";
    await runtime.storage.put(key, new Uint8Array([7, 7, 7]), { contentType: "image/webp" });
    const token = await signExportToken(SECRET, projectId, ["media/org1/m1/"]);
    const url = (k: string, t: string): string =>
      `/api/v1/projects/${projectId}/export/blob?${new URLSearchParams({ k, t }).toString()}`;

    const ok = await call(url(key, token), { auth: false });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect([...new Uint8Array(await ok.arrayBuffer())]).toEqual([7, 7, 7]);

    // Fuera del alcance, de otro proyecto o con el vale roto: 403
    expect((await call(url("media/org1/m2/original.jpg", token), { auth: false })).status).toBe(403);
    expect(
      (
        await call(
          `/api/v1/projects/otro/export/blob?${new URLSearchParams({ k: key, t: token }).toString()}`,
          { auth: false },
        )
      ).status,
    ).toBe(403);
    expect((await call(url(key, `${token}0`), { auth: false })).status).toBe(403);
    // Dentro del alcance pero inexistente: 404
    expect((await call(url("media/org1/m1/tiles/9/f/0/0.webp", token), { auth: false })).status).toBe(404);
  });

  it("la vista previa no da 500 si KV rechaza guardar el mapa de assets", async () => {
    await runtime.kv.delete(`preview-map:${projectId}`);
    kvPutFails = true;
    try {
      const res = await call(`/api/v1/projects/${projectId}/preview/a/tiles/nada/0/f/0/0.webp`);
      // Recompila, no puede guardar el mapa y sigue: el asset no es del tour
      expect(res.status).toBe(404);
      const exp = await call(`/api/v1/projects/${projectId}/export`, { method: "POST", body: {} });
      expect(exp.status).toBe(200);
    } finally {
      kvPutFails = false;
    }
  });
});
