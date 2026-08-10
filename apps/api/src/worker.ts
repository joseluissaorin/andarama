import { drizzle } from "drizzle-orm/d1";
import * as schema from "@andarama/db";
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
} from "@andarama/adapters/cloudflare";
import type { PlatformRuntime } from "@andarama/adapters";
import { createApp } from "./app.js";
import type { AppConfig, Db } from "./lib/context.js";
import { purgeExpiredSessions } from "./lib/session.js";
import { purgeTrashedProjects } from "./routes/projects.js";
import { getSettings } from "./lib/helpers.js";

export { LiveTourRoomDO, ProjectPresenceDO } from "@andarama/realtime/durable-objects";

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
      from: env.EMAIL_FROM ?? "andarama@localhost",
    }),
    deferred: waitUntil,
  };
}

function buildConfig(env: Env, publicUrl: string): AppConfig {
  return {
    publicUrl,
    secret: env.APP_SECRET,
    emailFrom: env.EMAIL_FROM ?? "andarama@localhost",
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

    // -----------------------------------------------------------------------
    // Enrutado por host. El mismo worker sirve tres portadas:
    //   andarama.com        -> la landing (y los tours /t/... para compartir)
    //   app.andarama.com    -> el Studio, con URL limpias en la raiz
    //   docs.andarama.com   -> la documentacion, con URL limpias en la raiz
    // Los hosts *.workers.dev y el self-host siguen siendo por rutas (/studio,
    // /docs), que es lo que esperan los despliegues de un solo dominio.
    // -----------------------------------------------------------------------
    const apexHost = (() => {
      try {
        return new URL(publicUrl).host;
      } catch {
        return url.host;
      }
    })();
    const appHost = `app.${apexHost}`;
    const docsHost = `docs.${apexHost}`;
    const path = url.pathname;
    // Un fichero lleva extension; una pagina, no. Distinguirlo permite
    // redirigir las paginas a su URL limpia sin tocar los assets.
    const esPagina = !/\.[a-z0-9]+$/i.test(path.split("/").pop() ?? "");

    if (url.host === `www.${apexHost}`) {
      return Response.redirect(`https://${apexHost}${path}${url.search}`, 301);
    }

    if (url.host === apexHost) {
      // Las secciones viven en sus subdominios: las URL viejas acompanan
      if ((path === "/studio" || path.startsWith("/studio/")) && esPagina) {
        const resto = path.slice("/studio".length) || "/";
        return Response.redirect(`https://${appHost}${resto}${url.search}`, 301);
      }
      if ((path === "/docs" || path.startsWith("/docs/")) && esPagina) {
        const resto = path.slice("/docs".length) || "/";
        return Response.redirect(`https://${docsHost}${resto}${url.search}`, 301);
      }
    }
    if (url.host === appHost || url.host === docsHost) {
      const prefijo = url.host === appHost ? "/studio" : "/docs";
      if ((path === prefijo || path.startsWith(`${prefijo}/`)) && esPagina) {
        const resto = path.slice(prefijo.length) || "/";
        return Response.redirect(`https://${url.host}${resto}${url.search}`, 301);
      }
      // El manifiesto de la PWA cambia de ambito cuando el Studio vive en la
      // raiz: id, start_url y scope pasan a "/" (fichero gemelo pregenerado)
      if (url.host === appHost && path === "/studio/manifest.webmanifest" && env.ASSETS != null) {
        return env.ASSETS.fetch(new Request(`${url.origin}/studio/manifest-root.webmanifest`, { headers: request.headers }));
      }
    }

    // Dominio propio (CNAME): un host desconocido sirve su tour en la raiz
    let effectiveRequest = request;
    const esConocido =
      url.host === apexHost || url.host === appHost || url.host === docsHost ||
      url.host.endsWith(".workers.dev") || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!esConocido) {
      const passthrough =
        path.startsWith("/api/") || path.startsWith("/viewer/") || path.startsWith("/ingest/") || path.startsWith("/studio") ||
        path.startsWith("/rt/") || path.startsWith("/docs") || path.startsWith("/t/") || path.startsWith("/embed.js");
      if (!passthrough) {
        const slug = await env.KV.get(`domain:${url.host}`);
        if (slug != null) {
          const rewritten = new URL(url.toString());
          rewritten.pathname = `/t/${slug}${path === "/" ? "" : path}`;
          effectiveRequest = new Request(rewritten.toString(), request);
        }
      }
    }

    // La raiz de cada host: landing en el apex (y en workers.dev), Studio en
    // el subdominio de la app, documentacion en el suyo
    if (new URL(effectiveRequest.url).pathname === "/" && env.ASSETS != null) {
      const portada =
        url.host === appHost ? "/studio/index.html" : url.host === docsHost ? "/docs/index.html" : "/landing/index.html";
      return env.ASSETS.fetch(new Request(`${url.origin}${portada}`, { headers: request.headers }));
    }

    const response = await app.fetch(effectiveRequest, env as never, ctx as never);
    // Rutas no manejadas: assets estaticos (Studio + visor + docs + landing)
    if (response.status === 404 && env.ASSETS != null && request.method === "GET" && !path.startsWith("/api/")) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) return assetRes;
      // En los subdominios, las rutas limpias se resuelven contra su seccion
      const prefijo = url.host === appHost ? "/studio" : url.host === docsHost ? "/docs" : url.host === apexHost ? "/landing" : null;
      const esSeccion = path.startsWith("/studio") || path.startsWith("/docs") || path.startsWith("/viewer") || path.startsWith("/landing");
      if (prefijo != null && !esSeccion) {
        const traducida = await env.ASSETS.fetch(new Request(`${url.origin}${prefijo}${path}`, { headers: request.headers }));
        if (traducida.status !== 404) return traducida;
      }
      // SPA fallback del Studio (rutas del editor, tanto /studio/... como
      // limpias). Solo para paginas: un fichero con extension que no existe
      // debe ser un 404, no un index.html disfrazado.
      if (esPagina && (path.startsWith("/studio") || url.host === appHost)) {
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
