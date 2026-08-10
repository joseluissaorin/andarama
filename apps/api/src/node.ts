import { serve } from "@hono/node-server";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createArgon2Hasher,
  createFsStorage,
  createInProcessQueue,
  createSmtpEmail,
  createSqliteDb,
  createSqliteKv,
  createSqlAnalytics,
  migrateSqlite,
} from "@ull360/adapters/node";
import type { PlatformRuntime } from "@ull360/adapters";
import { createRealtimeServer } from "@ull360/realtime/node";
import { createApp } from "./app.js";
import type { AppConfig, Db } from "./lib/context.js";
import { processJob } from "./jobs.js";
import { guessContentType } from "./routes/projects.js";

/**
 * Entrada self-host: un proceso Node, un volumen (/data), un puerto (§5.7).
 * SQLite + FS + ws + cola en proceso + argon2id. Sirve tambien el Studio y
 * el bundle del visor como estaticos.
 */

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const dataDir = resolve(process.env.DATA_DIR ?? "./data");
  const port = parseInt(process.env.PORT ?? "8788", 10);
  const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
  const secret = process.env.APP_SECRET ?? "dev-secret-cambia-esto";
  if (secret === "dev-secret-cambia-esto" && process.env.NODE_ENV === "production") {
    console.error("ATENCION: define APP_SECRET en produccion");
  }

  const { mkdir } = await import("node:fs/promises");
  await mkdir(dataDir, { recursive: true });
  const { db, sqlite } = await createSqliteDb(join(dataDir, "ull360.db"));
  const migrationsDir = findMigrationsDir();
  const applied = await migrateSqlite(sqlite, migrationsDir, {
    backupPath: join(dataDir, `ull360-backup-${new Date().toISOString().slice(0, 10)}.db`),
  });
  if (applied.length > 0) console.log(`[db] migraciones aplicadas: ${applied.join(", ")}`);

  const queue = createInProcessQueue();
  const runtime: PlatformRuntime = {
    platform: "node",
    publicUrl,
    db,
    kv: createSqliteKv(sqlite),
    storage: createFsStorage({
      rootDir: join(dataDir, "storage"),
      hmacSecret: secret,
      publicUrl,
      s3:
        process.env.S3_ENDPOINT != null
          ? {
              endpoint: process.env.S3_ENDPOINT,
              bucket: process.env.S3_BUCKET ?? "ull360",
              accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
              region: process.env.S3_REGION,
            }
          : undefined,
    }),
    queue,
    analytics: createSqlAnalytics(db),
    passwords: createArgon2Hasher(),
    email: createSmtpEmail({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT != null ? parseInt(process.env.SMTP_PORT, 10) : undefined,
      secure: process.env.SMTP_SECURE === "1",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM ?? "ull360@localhost",
    }),
    deferred: (p) => {
      void p.catch((err) => console.error("[deferred]", err));
    },
  };

  // Procesador de trabajos pesados en el propio proceso (§5.5)
  queue.start(async (msg) => {
    await processJob({ db: db as Db, runtime, heavyCapable: true }, msg.id);
  });

  const config: AppConfig = {
    publicUrl,
    secret,
    emailFrom: process.env.EMAIL_FROM ?? "ull360@localhost",
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY,
    turnstileSecret: process.env.TURNSTILE_SECRET,
    maxUploadBytes: 512 * 1024 * 1024,
    oidc:
      process.env.OIDC_ISSUER != null && process.env.OIDC_CLIENT_ID != null && process.env.OIDC_CLIENT_SECRET != null
        ? {
            issuer: process.env.OIDC_ISSUER,
            clientId: process.env.OIDC_CLIENT_ID,
            clientSecret: process.env.OIDC_CLIENT_SECRET,
            allowedDomains: process.env.OIDC_ALLOWED_DOMAINS?.split(",").map((d) => d.trim()),
          }
        : undefined,
  };

  const realtime = await createRealtimeServer({
    authorizePresence: async () => true, // la sesion del Studio ya protege los datos; presencia es inocua
  });

  const app = createApp({
    runtime,
    config,
    createLiveRoom: async () => realtime.createLiveRoom(),
  });

  // Estaticos: Studio (SPA) y bundle del visor
  const assetRoots = findAssetRoots();

  const server = serve(
    {
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        // Dominio propio (CNAME/proxy): host distinto del canonico -> tour en la raiz
        let effectiveRequest = request;
        const canonicalHost = (() => {
          try {
            return new URL(publicUrl).host;
          } catch {
            return url.host;
          }
        })();
        if (url.host !== canonicalHost) {
          const p = url.pathname;
          const passthrough =
            p.startsWith("/api/") || p.startsWith("/viewer/") || p.startsWith("/ingest/") || p.startsWith("/studio") ||
            p.startsWith("/rt/") || p.startsWith("/docs") || p.startsWith("/t/") || p.startsWith("/embed.js");
          if (!passthrough) {
            const slug = await runtime.kv.get(`domain:${url.host}`);
            if (slug != null) {
              const rewritten = new URL(url.toString());
              rewritten.pathname = `/t/${slug}${p === "/" ? "" : p}`;
              effectiveRequest = new Request(rewritten.toString(), request);
            }
          }
        }
        if (new URL(effectiveRequest.url).pathname === "/") {
          return Response.redirect(`${publicUrl}/studio/`, 302);
        }
        const response = await app.fetch(effectiveRequest);
        if (response.status === 404 && request.method === "GET" && !url.pathname.startsWith("/api/")) {
          const asset = await serveStatic(assetRoots, url.pathname);
          if (asset != null) return asset;
          if (url.pathname.startsWith("/studio")) {
            const spa = await serveStatic(assetRoots, "/studio/index.html");
            if (spa != null) return spa;
          }
        }
        return response;
      },
      port,
      hostname: "0.0.0.0",
    },
    (info) => {
      console.log(`ULL360 self-host escuchando en http://localhost:${info.port} (datos en ${dataDir})`);
    },
  );

  // WebSockets de tiempo real en el mismo puerto
  (server as unknown as { on: (ev: string, fn: (...args: any[]) => void) => void }).on(
    "upgrade",
    (req: import("node:http").IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => {
      if (!realtime.handleUpgrade(req, socket, head)) {
        socket.destroy();
      }
    },
  );
}

function findMigrationsDir(): string {
  const candidates = [
    resolve(here, "../../../packages/db/migrations"),
    resolve(here, "../node_modules/@ull360/db/migrations"),
    resolve(process.cwd(), "node_modules/@ull360/db/migrations"),
    resolve(here, "./migrations"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "0001_init.sql"))) return dir;
  }
  throw new Error("No se encontró el directorio de migraciones");
}

function findAssetRoots(): string[] {
  const roots: string[] = [];
  const candidates = [
    process.env.ASSETS_DIR,
    resolve(here, "./assets"),
    resolve(here, "../assets"),
    resolve(here, "../../studio/dist-root"),
  ].filter((d): d is string => d != null);
  for (const dir of candidates) {
    if (existsSync(dir)) roots.push(dir);
  }
  return roots;
}

async function serveStatic(roots: string[], pathname: string): Promise<Response | null> {
  const clean = decodeURIComponent(pathname).replaceAll("\\", "/");
  if (clean.includes("..")) return null;
  for (const root of roots) {
    const filePath = join(root, clean);
    try {
      const s = await stat(filePath);
      if (!s.isFile()) continue;
      const stream = createReadStream(filePath);
      const { Readable } = await import("node:stream");
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        headers: {
          "content-type": guessContentType(extname(filePath).slice(1) === "" ? "x.html" : filePath),
          "cache-control": clean.includes("/chunks/") || /\.[a-f0-9]{8,}\./.test(clean) ? "public, max-age=31536000, immutable" : "public, max-age=300",
        },
      });
    } catch {
      // no existe en esta raiz
    }
  }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
