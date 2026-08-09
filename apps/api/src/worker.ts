import { drizzle } from "drizzle-orm/d1";
import * as schema from "@ull360/db";
import {
  cfPasswordHasher,
  createAeAnalytics,
  createCfKv,
  createCfQueue,
  createFetchEmail,
  createR2Storage,
  createSqlAnalytics,
  type AnalyticsEngineDatasetLike,
  type KVNamespaceLike,
  type QueueLike,
  type R2BucketLike,
} from "@ull360/adapters/cloudflare";
import type { PlatformRuntime } from "@ull360/adapters";
import { createApp } from "./app.js";
import type { AppConfig, Db } from "./lib/context.js";
import { purgeExpiredSessions } from "./lib/session.js";
import { purgeTrashedProjects } from "./routes/projects.js";
import { getSettings } from "./lib/helpers.js";

export { LiveTourRoomDO, ProjectPresenceDO } from "@ull360/realtime/durable-objects";

/**
 * Entrada Cloudflare Workers: construye el PlatformRuntime a partir de los
 * bindings y delega en la app Hono compartida. Los WebSockets de tiempo
 * real van a los Durable Objects; los assets estaticos (Studio + visor) los
 * sirve Workers Assets.
 */

interface Env {
  DB: unknown;
  BUCKET: R2BucketLike;
  KV: KVNamespaceLike;
  QUEUE?: QueueLike;
  ANALYTICS?: AnalyticsEngineDatasetLike;
  LIVE_DO: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request) : Promise<Response> } };
  PRESENCE_DO: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } };
  ASSETS?: { fetch(req: Request): Promise<Response> };
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  PUBLIC_URL?: string;
  APP_SECRET: string;
  EMAIL_FROM?: string;
  EMAIL_WEBHOOK_URL?: string;
  EMAIL_WEBHOOK_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_ALLOWED_DOMAINS?: string;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  ANALYTICS_BACKEND?: string;
  ANALYTICS_DATASET?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  STREAM_ACCOUNT_ID?: string;
  STREAM_API_TOKEN?: string;
}

function buildRuntime(env: Env, publicUrl: string, waitUntil: (p: Promise<unknown>) => void): PlatformRuntime {
  const db = drizzle(env.DB as never, { schema }) as unknown as Db;
  const kv = createCfKv(env.KV);
  const useAe = env.ANALYTICS != null && env.ANALYTICS_BACKEND !== "d1";
  const analytics = useAe
    ? createAeAnalytics(
        env.ANALYTICS!,
        env.CF_ACCOUNT_ID != null && env.CF_ANALYTICS_TOKEN != null
          ? { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_ANALYTICS_TOKEN, datasetName: env.ANALYTICS_DATASET ?? "ull360_events" }
          : null,
      )
    : createSqlAnalytics(db);
  return {
    platform: "cloudflare",
    publicUrl,
    db,
    kv,
    storage: createR2Storage(env.BUCKET, {
      hmacSecret: env.APP_SECRET,
      publicUrl,
      s3:
        env.CF_ACCOUNT_ID != null && env.R2_ACCESS_KEY_ID != null && env.R2_SECRET_ACCESS_KEY != null && env.R2_BUCKET_NAME != null
          ? {
              accountId: env.CF_ACCOUNT_ID,
              bucket: env.R2_BUCKET_NAME,
              accessKeyId: env.R2_ACCESS_KEY_ID,
              secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            }
          : undefined,
    }),
    queue: createCfQueue(env.QUEUE),
    analytics,
    passwords: cfPasswordHasher,
    email: createFetchEmail({
      webhookUrl: env.EMAIL_WEBHOOK_URL,
      apiKey: env.EMAIL_WEBHOOK_KEY,
      from: env.EMAIL_FROM ?? "ull360@localhost",
    }),
    deferred: waitUntil,
  };
}

function buildConfig(env: Env, publicUrl: string): AppConfig {
  return {
    publicUrl,
    secret: env.APP_SECRET,
    emailFrom: env.EMAIL_FROM ?? "ull360@localhost",
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
    turnstileSecret: env.TURNSTILE_SECRET,
    maxUploadBytes: 512 * 1024 * 1024,
    oidc:
      env.OIDC_ISSUER != null && env.OIDC_CLIENT_ID != null && env.OIDC_CLIENT_SECRET != null
        ? {
            issuer: env.OIDC_ISSUER,
            clientId: env.OIDC_CLIENT_ID,
            clientSecret: env.OIDC_CLIENT_SECRET,
            allowedDomains: env.OIDC_ALLOWED_DOMAINS?.split(",").map((d) => d.trim()).filter((d) => d !== ""),
          }
        : undefined,
    stream:
      env.STREAM_ACCOUNT_ID != null && env.STREAM_API_TOKEN != null
        ? { accountId: env.STREAM_ACCOUNT_ID, apiToken: env.STREAM_API_TOKEN }
        : undefined,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    const publicUrl = env.PUBLIC_URL ?? `${url.protocol}//${url.host}`;

    // Tiempo real -> Durable Objects
    const liveMatch = /^\/rt\/live\/([A-Za-z0-9-]+)/.exec(url.pathname);
    if (liveMatch != null) {
      const stub = env.LIVE_DO.get(env.LIVE_DO.idFromName(liveMatch[1]!));
      return stub.fetch(request);
    }
    const projectMatch = /^\/rt\/project\/([A-Za-z0-9_-]+)/.exec(url.pathname);
    if (projectMatch != null) {
      const stub = env.PRESENCE_DO.get(env.PRESENCE_DO.idFromName(projectMatch[1]!));
      return stub.fetch(request);
    }

    const runtime = buildRuntime(env, publicUrl, (p) => ctx.waitUntil(p));
    const app = createApp({
      runtime,
      config: buildConfig(env, publicUrl),
      getAi: () => env.AI ?? null,
      createLiveRoom: async () => {
        const code = randomRoomCode();
        const stub = env.LIVE_DO.get(env.LIVE_DO.idFromName(code));
        const res = await stub.fetch(new Request(`https://do/rt/live/${code}/guide-key`));
        const { guideKey } = (await res.json()) as { guideKey: string };
        return { code, guideKey };
      },
    });

    if (url.pathname === "/") {
      return Response.redirect(`${publicUrl}/studio/`, 302);
    }

    const response = await app.fetch(request, env as never, ctx as never);
    // Rutas no manejadas: assets estaticos (Studio + visor)
    if (response.status === 404 && env.ASSETS != null && request.method === "GET" && !url.pathname.startsWith("/api/")) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) return assetRes;
      // SPA fallback del Studio
      if (url.pathname.startsWith("/studio")) {
        return env.ASSETS.fetch(new Request(`${url.origin}/studio/index.html`, { headers: request.headers }));
      }
    }
    return response;
  },

  /** Cron: limpieza de sesiones, papelera y trabajos pendientes. */
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    const publicUrl = env.PUBLIC_URL ?? "https://localhost";
    const runtime = buildRuntime(env, publicUrl, (p) => ctx.waitUntil(p));
    const db = runtime.db as Db;
    await purgeExpiredSessions(db);
    const settings = await getSettings(db);
    const purged = await purgeTrashedProjects(db, settings.trashRetentionDays);
    if (purged > 0) console.log(`[cron] papelera: ${purged} proyectos eliminados definitivamente`);
  },

  /** Consumidor de Cloudflare Queues: en Workers los trabajos pesados se
   *  delegan al contenedor externo; aqui solo se marca su estado. */
  async queue(batch: { messages: { body: unknown; ack(): void }[] }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    const publicUrl = env.PUBLIC_URL ?? "https://localhost";
    const runtime = buildRuntime(env, publicUrl, (p) => ctx.waitUntil(p));
    const { processJob } = await import("./jobs.js");
    for (const msg of batch.messages) {
      const body = msg.body as { id?: string };
      if (body?.id != null) {
        await processJob({ db: runtime.db as Db, runtime, heavyCapable: false }, body.id);
      }
      msg.ack();
    }
  },
};

function randomRoomCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
