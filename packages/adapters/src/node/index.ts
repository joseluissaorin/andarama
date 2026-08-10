import type {
  AnalyticsAdapter,
  EmailAdapter,
  JobMessage,
  KVAdapter,
  MailMessage,
  PasswordHasher,
  QueueAdapter,
} from "../types.js";
import { pbkdf2Verify } from "../shared/pbkdf2.js";
import { createSqlAnalytics } from "../shared/analytics-sql.js";

export { createFsStorage, type FsStorageOptions } from "./storage.js";
export { createSqlAnalytics };

// ---------------------------------------------------------------------------
// Base de datos (better-sqlite3 + drizzle) y migraciones
// ---------------------------------------------------------------------------

export interface NodeDb {
  db: unknown;
  sqlite: import("better-sqlite3").Database;
}

export async function createSqliteDb(path: string): Promise<NodeDb> {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@andarama/db");
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/**
 * Aplica las migraciones pendientes con copia de seguridad previa.
 * Registra las aplicadas en _migrations (mismo criterio que d1 migrations).
 */
export async function migrateSqlite(
  sqlite: import("better-sqlite3").Database,
  migrationsDir: string,
  opts: { backupPath?: string } = {},
): Promise<string[]> {
  const { readFile, readdir, copyFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  sqlite
    .prepare(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
    )
    .run();
  const applied = new Set(
    (sqlite.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) return [];
  if (opts.backupPath != null && sqlite.name !== ":memory:") {
    try {
      await copyFile(sqlite.name, opts.backupPath);
    } catch {
      // primera ejecucion: aun no existe el fichero
    }
  }
  for (const file of pending) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(file, Date.now());
  }
  return pending;
}

// ---------------------------------------------------------------------------
// KV sobre SQLite
// ---------------------------------------------------------------------------

export function createSqliteKv(sqlite: import("better-sqlite3").Database): KVAdapter {
  sqlite
    .prepare("CREATE TABLE IF NOT EXISTS _kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)")
    .run();
  const get = sqlite.prepare("SELECT value, expires_at FROM _kv WHERE key = ?");
  const put = sqlite.prepare(
    "INSERT INTO _kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
  );
  const del = sqlite.prepare("DELETE FROM _kv WHERE key = ?");
  const gc = sqlite.prepare("DELETE FROM _kv WHERE expires_at IS NOT NULL AND expires_at < ?");
  let ops = 0;
  return {
    async get(key) {
      const row = get.get(key) as { value: string; expires_at: number | null } | undefined;
      if (row == null) return null;
      if (row.expires_at != null && row.expires_at < Date.now()) {
        del.run(key);
        return null;
      }
      return row.value;
    },
    async put(key, value, opts) {
      put.run(key, value, opts?.ttlSeconds != null ? Date.now() + opts.ttlSeconds * 1000 : null);
      if (++ops % 500 === 0) gc.run(Date.now());
    },
    async delete(key) {
      del.run(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Cola en proceso persistida en la tabla jobs
// ---------------------------------------------------------------------------

export type JobHandler = (message: JobMessage) => Promise<void>;

/**
 * Cola en proceso: enqueue notifica a un bucle consumidor en el mismo
 * proceso. La durabilidad la da la tabla `jobs` (estado queued): al
 * arrancar, el bucle recoge tambien los trabajos pendientes de ejecuciones
 * anteriores.
 */
export function createInProcessQueue(): QueueAdapter & {
  start(handler: JobHandler): void;
  stop(): void;
  notify(message: JobMessage): void;
} {
  const pending: JobMessage[] = [];
  let handler: JobHandler | null = null;
  let running = false;
  let stopped = false;

  const pump = async (): Promise<void> => {
    if (running || handler == null) return;
    running = true;
    while (pending.length > 0 && !stopped) {
      const msg = pending.shift()!;
      try {
        await handler(msg);
      } catch (err) {
        console.error(`[queue] trabajo ${msg.id} (${msg.kind}) fallo:`, err);
      }
    }
    running = false;
  };

  return {
    async enqueue(message) {
      pending.push(message);
      void pump();
    },
    notify(message) {
      pending.push(message);
      void pump();
    },
    start(h) {
      handler = h;
      void pump();
    },
    stop() {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Contrasenas: Argon2id (hash-wasm), verify compatible con PBKDF2
// ---------------------------------------------------------------------------

export function createArgon2Hasher(): PasswordHasher {
  return {
    async hash(password) {
      const { argon2id } = await import("hash-wasm");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      return argon2id({
        password,
        salt,
        parallelism: 1,
        iterations: 3,
        memorySize: 65536,
        hashLength: 32,
        outputType: "encoded",
      });
    },
    async verify(password, phcHash) {
      if (phcHash.startsWith("$pbkdf2-sha256$")) return pbkdf2Verify(password, phcHash);
      if (phcHash.startsWith("$argon2")) {
        const { argon2Verify } = await import("hash-wasm");
        try {
          return await argon2Verify({ password, hash: phcHash });
        } catch {
          return false;
        }
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// Email SMTP (nodemailer) con modo log por defecto
// ---------------------------------------------------------------------------

export interface SmtpOptions {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export function createSmtpEmail(opts: SmtpOptions): EmailAdapter {
  const configured = opts.host != null && opts.host !== "";
  let transporterPromise: Promise<import("nodemailer").Transporter> | null = null;
  const getTransporter = async () => {
    if (transporterPromise == null) {
      transporterPromise = import("nodemailer").then((nm) =>
        nm.default.createTransport({
          host: opts.host,
          port: opts.port ?? 587,
          secure: opts.secure ?? false,
          auth: opts.user != null ? { user: opts.user, pass: opts.pass } : undefined,
        }),
      );
    }
    return transporterPromise;
  };
  return {
    configured,
    async send(message: MailMessage) {
      if (!configured) {
        console.log(`[email:log] para=${message.to} asunto="${message.subject}"\n${message.text}`);
        return;
      }
      const transporter = await getTransporter();
      await transporter.sendMail({
        from: opts.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

export function createNodeAnalytics(db: unknown): AnalyticsAdapter {
  return createSqlAnalytics(db);
}
