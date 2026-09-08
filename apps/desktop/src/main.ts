import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@andarama/db";
import {
  createArgon2Hasher,
  createFsStorage,
  createInProcessQueue,
  createSmtpEmail,
  createSqliteKv,
  createSqlAnalytics,
  migrateSqlite,
} from "@andarama/adapters/node";
import type { PlatformRuntime } from "@andarama/adapters";
import { createApp } from "@andarama/api/app";
import type { AppConfig, Db } from "@andarama/api/lib/context";
import { processJob } from "@andarama/api/jobs";
import { guessContentType } from "@andarama/api/routes/projects";
import { createDesktopRealtime } from "./realtime";

/**
 * Andarama de escritorio: el mismo servidor que el self-host, en un solo
 * fichero que se ejecuta con doble clic. Bun pone el motor y el SQLite; el
 * Studio, el visor y la documentación van embebidos; los datos viven en la
 * carpeta Andarama de la casa del usuario. Al arrancar abre el navegador.
 *
 * Es la instalación gratuita para quien no quiere ni Docker ni Cloudflare.
 */

declare const ANDA_VERSION: string | undefined;

const VERSION = typeof ANDA_VERSION === "string" ? ANDA_VERSION : "dev";
// En el ejecutable, Bun cuelga cada directorio embebido de import.meta.dir
// por su nombre (dist-root, migrations); en desarrollo (bun run) se leen de
// la raíz real del repositorio.
const ROOT = Bun.isStandaloneExecutable ? import.meta.dir : resolve(import.meta.dir, "../../..");
const ASSETS = Bun.isStandaloneExecutable ? join(ROOT, "dist-root") : join(ROOT, "apps/studio/dist-root");
const MIGRATIONS = Bun.isStandaloneExecutable ? join(ROOT, "migrations") : join(ROOT, "packages/db/migrations");

async function main(): Promise<void> {
  const dataDir = resolve(process.env.DATA_DIR ?? join(homedir(), "Andarama"));
  const port = parseInt(process.env.PORT ?? "8788", 10);
  const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
  await mkdir(dataDir, { recursive: true });

  // El secreto de instancia se genera una vez y se guarda con los datos:
  // firma las subidas y las sesiones, así que tiene que sobrevivir al reinicio
  const secretPath = join(dataDir, "secreto.txt");
  let secret = process.env.APP_SECRET ?? "";
  if (secret === "") {
    if (existsSync(secretPath)) secret = readFileSync(secretPath, "utf8").trim();
    if (secret === "") {
      secret = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
      writeFileSync(secretPath, secret, { mode: 0o600 });
    }
  }

  if (!existsSync(ASSETS)) {
    console.error(`No encuentro el Studio en ${ASSETS}. En desarrollo, construye antes con: pnpm --filter @andarama/studio build`);
    try {
      console.error(`Contenido de ${ROOT}: ${readdirSync(ROOT).join(", ")}`);
    } catch {
      // sin listado
    }
    process.exit(1);
  }

  const sqlite = new Database(join(dataDir, "andarama.db"), { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  const applied = await migrateSqlite(sqlite, MIGRATIONS, {
    backupPath: join(dataDir, `anda-backup-${new Date().toISOString().slice(0, 10)}.db`),
  });
  if (applied.length > 0) console.log(`[db] migraciones aplicadas: ${applied.join(", ")}`);

  const queue = createInProcessQueue();
  const runtime: PlatformRuntime = {
    platform: "node",
    publicUrl,
    db,
    kv: createSqliteKv(sqlite),
    storage: createFsStorage({ rootDir: join(dataDir, "storage"), hmacSecret: secret, publicUrl }),
    queue,
    analytics: createSqlAnalytics(db),
    passwords: createArgon2Hasher(),
    email: createSmtpEmail({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT != null ? parseInt(process.env.SMTP_PORT, 10) : undefined,
      secure: process.env.SMTP_SECURE === "1",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM ?? "andarama@localhost",
    }),
    deferred: (p) => {
      void p.catch((err) => console.error("[deferred]", err));
    },
  };

  // Los trabajos pesados (troceado en servidor) necesitan sharp, que no viaja
  // en el ejecutable: el Studio trocea en el navegador, que es lo habitual.
  // Si llega uno, queda en la cola con su motivo a la vista del administrador.
  queue.start(async (msg) => {
    await processJob({ db, runtime, heavyCapable: false }, msg.id);
  });

  const config: AppConfig = {
    publicUrl,
    secret,
    emailFrom: process.env.EMAIL_FROM ?? "andarama@localhost",
    maxUploadBytes: 512 * 1024 * 1024,
  };

  const realtime = createDesktopRealtime();
  const app = createApp({ runtime, config, createLiveRoom: async () => realtime.createLiveRoom() });

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    websocket: realtime.websocket,
    async fetch(request, srv) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/rt/")) {
        if (realtime.upgrade(request, srv)) return undefined as unknown as Response;
        return new Response("No encontrado", { status: 404 });
      }
      // La portada del escritorio es el Studio: no hay nada que vender
      if (url.pathname === "/") return Response.redirect(`${publicUrl}/studio/`, 302);
      const response = await app.fetch(request);
      if (response.status === 404 && request.method === "GET" && !url.pathname.startsWith("/api/")) {
        const asset = serveStatic(url.pathname);
        if (asset != null) return asset;
        if (url.pathname.startsWith("/studio")) {
          const spa = serveStatic("/studio/index.html");
          if (spa != null) return spa;
        }
      }
      return response;
    },
  });

  const studioUrl = `${publicUrl}/studio/`;
  console.log(`Andarama ${VERSION} escuchando en ${server.url}`);
  console.log(`Datos en ${dataDir}`);
  console.log(`Abre ${studioUrl} (la primera cuenta que se cree será la administradora)`);
  if (process.env.ANDA_NO_BROWSER !== "1") openBrowser(studioUrl);
}

/** Sirve un fichero embebido (o del disco en desarrollo) con la misma política de caché que Cloudflare. */
function serveStatic(pathname: string): Response | null {
  let clean = decodeURIComponent(pathname).replaceAll("\\", "/");
  if (clean.includes("..")) return null;
  if (clean.endsWith("/")) clean += "index.html";
  else if (!/\.[a-z0-9]+$/i.test(clean.split("/").pop() ?? "")) clean += "/index.html";
  const filePath = join(ASSETS, clean);
  try {
    if (!statSync(filePath).isFile()) return null;
  } catch {
    return null;
  }
  return new Response(Bun.file(filePath), {
    headers: {
      "content-type": guessContentType(extname(filePath).slice(1) === "" ? "x.html" : filePath),
      "cache-control": clean.includes("/chunks/") || /\.[a-f0-9]{8,}\./.test(clean) ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

/** Abre el navegador del sistema; si falla, la URL ya está en la consola. */
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // sin navegador a mano
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
