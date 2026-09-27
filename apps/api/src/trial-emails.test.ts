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
import type { EmailAdapter, MailMessage, PlatformRuntime } from "@andarama/adapters";
import { trialEmails, users } from "@andarama/db";
import { createApp } from "./app.js";
import type { AppConfig, AppEnv, Db } from "./lib/context.js";
import { TRIAL_MS } from "./lib/plans.js";
import { composeTrialEmail, sendTrialEmails, stepFor, unsubscribeToken } from "./lib/trial-emails.js";

/** Correos del ciclo de la prueba de 14 días: cuándo, qué dicen, sin repetir y con baja. */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../packages/db/migrations");
const DAY = 24 * 60 * 60 * 1000;
const config: AppConfig = {
  publicUrl: "http://localhost",
  secret: "test-secret",
  emailFrom: "test@localhost",
  maxUploadBytes: 1024 * 1024,
};

describe("calendario de pasos", () => {
  const start = Date.UTC(2026, 9, 1);
  const end = start + TRIAL_MS;
  it("cada paso en su ventana y nada fuera de ellas", () => {
    expect(stepFor(end, start + 1 * DAY)).toBe("bienvenida");
    expect(stepFor(end, start + 3 * DAY)).toBeNull();
    expect(stepFor(end, start + 7.5 * DAY)).toBe("dia7");
    expect(stepFor(end, start + 10.5 * DAY)).toBeNull();
    expect(stepFor(end, start + 12.5 * DAY)).toBe("dia12");
    expect(stepFor(end, end + 1 * DAY)).toBe("final");
    expect(stepFor(end, end + 4 * DAY)).toBeNull();
  });
});

describe("texto", () => {
  it("promete lo que hace el producto al acabar la prueba y lleva la baja", () => {
    const m = composeTrialEmail("dia12", {
      name: "Lía",
      lang: "es",
      trialEndsAt: Date.UTC(2026, 9, 15),
      studioUrl: "https://app.andarama.com/",
      unsubscribeUrl: "https://andarama.com/baja",
    });
    expect(m.subject).toContain("Tu prueba termina el 15 de octubre");
    expect(m.text).toContain("siguen en línea");
    expect(m.text).toContain("Exportar sigue siendo libre");
    expect(m.text).toContain("https://andarama.com/baja");
  });

  it("sin tour de ejemplo configurado no lo promete", () => {
    const sin = composeTrialEmail("bienvenida", { name: "Max", lang: "es", trialEndsAt: Date.now(), studioUrl: "x", unsubscribeUrl: "y" });
    expect(sin.text).not.toContain("recorrido de ejemplo");
    const con = composeTrialEmail("bienvenida", { name: "Max", lang: "es", trialEndsAt: Date.now(), studioUrl: "x", unsubscribeUrl: "y", sampleTour: true });
    expect(con.text).toContain("recorrido de ejemplo");
  });
});

describe("envío y baja", () => {
  let db: Db;
  let app: Hono<AppEnv>;
  const bandeja: MailMessage[] = [];
  const correo: EmailAdapter = {
    configured: true,
    async send(m) {
      bandeja.push(m);
    },
  };

  beforeAll(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "anda-prueba-"));
    const sqliteDb = await createSqliteDb(":memory:");
    db = sqliteDb.db as unknown as Db;
    await migrateSqlite(sqliteDb.sqlite, migrationsDir);
    const runtime: PlatformRuntime = {
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
    app = createApp({ runtime, config });
    const now = Date.now();
    const base = { passwordHash: null, emailVerified: true, createdAt: now, updatedAt: now };
    await db.insert(users).values([
      // Recién empezada: bienvenida
      { ...base, id: "u-nueva", email: "nueva@ejemplo.es", name: "Ana Pérez", trialEndsAt: now + TRIAL_MS - DAY },
      // A punto de acabar: aviso del día 12
      { ...base, id: "u-dia12", email: "doce@ejemplo.es", name: "Bea", trialEndsAt: now + DAY },
      // Ya paga: nada
      { ...base, id: "u-paga", email: "paga@ejemplo.es", name: "Carla", plan: "paseo", trialEndsAt: now + DAY },
      // Plan concedido: nada
      { ...base, id: "u-regalo", email: "regalo@ejemplo.es", name: "Dani", planOverride: "vitalicio", trialEndsAt: now + DAY },
    ]);
  });

  it("envía lo que toca a quien toca y no repite", async () => {
    const opts = { secret: "test-secret", apiUrl: "http://localhost", studioUrl: "http://localhost/studio/" };
    expect(await sendTrialEmails(db, correo, opts)).toBe(2);
    expect(bandeja.map((m) => m.to).sort()).toEqual(["doce@ejemplo.es", "nueva@ejemplo.es"]);
    expect(bandeja.find((m) => m.to === "nueva@ejemplo.es")!.text).toContain("Hola, Ana:");
    expect(await sendTrialEmails(db, correo, opts)).toBe(0);
  });

  it("sin transporte de correo no marca nada como enviado", async () => {
    const sinCorreo: EmailAdapter = { configured: false, async send() {} };
    expect(await sendTrialEmails(db, sinCorreo, { secret: "s", apiUrl: "x", studioUrl: "y" })).toBe(0);
  });

  it("la baja firmada funciona y la falsa no", async () => {
    expect((await app.request("http://localhost/api/v1/public/trial-emails/unsubscribe?u=u-nueva&t=falso")).status).toBe(400);
    const t = await unsubscribeToken("test-secret", "u-nueva");
    const res = await app.request(`http://localhost/api/v1/public/trial-emails/unsubscribe?u=u-nueva&t=${t}`);
    expect(res.status).toBe(200);
    const filas = await db.select().from(trialEmails);
    expect(filas.some((f) => f.userId === "u-nueva" && f.step === "baja")).toBe(true);
  });
});
