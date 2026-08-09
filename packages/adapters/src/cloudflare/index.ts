import type {
  AnalyticsAdapter,
  AnalyticsEvent,
  AnalyticsSummary,
  EmailAdapter,
  JobMessage,
  KVAdapter,
  MailMessage,
  PasswordHasher,
  QueueAdapter,
} from "../types.js";
import { pbkdf2Hasher } from "../shared/pbkdf2.js";
import { createSqlAnalytics } from "../shared/analytics-sql.js";
import type { AnalyticsEngineDatasetLike, KVNamespaceLike, QueueLike } from "./bindings.js";

export { createR2Storage, type R2StorageOptions } from "./storage.js";
export type { AnalyticsEngineDatasetLike, KVNamespaceLike, QueueLike, R2BucketLike } from "./bindings.js";
export { pbkdf2Hasher };
export { createSqlAnalytics };

export function createCfKv(ns: KVNamespaceLike): KVAdapter {
  return {
    get: (key) => ns.get(key),
    put: async (key, value, opts) => {
      await ns.put(key, value, opts?.ttlSeconds != null ? { expirationTtl: Math.max(60, opts.ttlSeconds) } : undefined);
    },
    delete: (key) => ns.delete(key),
  };
}

/**
 * Cola sobre Cloudflare Queues. Si el binding no existe (cuenta free sin
 * Queues), la cola es "solo tabla": la fila en `jobs` queda en estado
 * queued y la procesa el cron trigger del Worker o el contenedor externo.
 */
export function createCfQueue(queue: QueueLike | undefined): QueueAdapter {
  return {
    async enqueue(message: JobMessage) {
      if (queue != null) {
        await queue.send(message);
      }
      // Sin binding: no-op; el trabajo queda en la tabla jobs y lo recoge
      // el scheduled handler (cron) o un runner externo.
    },
  };
}

/**
 * Analitica sobre Workers Analytics Engine.
 * Esquema del data point:
 *   indexes[0] = tourSlug
 *   blobs = [event, sceneId, hotspotId, lang, device, country, refererHost, sessionHash]
 *   doubles = [durationMs, yawBucket, pitchBucket]
 * Las consultas usan la API SQL de AE (requiere token de API con permiso
 * Account Analytics Read, configurado como secreto).
 */
export function createAeAnalytics(
  dataset: AnalyticsEngineDatasetLike,
  query: { accountId: string; apiToken: string; datasetName: string } | null,
): AnalyticsAdapter {
  return {
    async write(event: AnalyticsEvent) {
      dataset.writeDataPoint({
        indexes: [event.tourSlug],
        blobs: [
          event.event,
          event.sceneId ?? "",
          event.hotspotId ?? "",
          event.lang ?? "",
          event.device ?? "",
          event.country ?? "",
          event.refererHost ?? "",
          event.sessionHash ?? "",
        ],
        doubles: [event.durationMs ?? 0, event.yawBucket ?? -1, event.pitchBucket ?? -1],
      });
    },

    async query(tourSlug: string, opts: { from: number; to: number }): Promise<AnalyticsSummary> {
      if (query == null) {
        throw new Error(
          "Analytics Engine no tiene token de consulta configurado (CF_ANALYTICS_TOKEN); configura el secreto o usa ANALYTICS_BACKEND=d1",
        );
      }
      const run = async (sql: string): Promise<Record<string, unknown>[]> => {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${query.accountId}/analytics_engine/sql`, {
          method: "POST",
          headers: { authorization: `Bearer ${query.apiToken}` },
          body: sql,
        });
        if (!res.ok) throw new Error(`Consulta AE fallo: ${res.status} ${await res.text()}`);
        const data = (await res.json()) as { data: Record<string, unknown>[] };
        return data.data;
      };
      const ds = query.datasetName;
      const fromIso = new Date(opts.from).toISOString();
      const toIso = new Date(opts.to).toISOString();
      const base = `FROM ${ds} WHERE index1 = '${tourSlug.replaceAll("'", "''")}' AND timestamp >= toDateTime('${fromIso}') AND timestamp <= toDateTime('${toIso}')`;

      const [visits, uniq, sceneViews, durations, hotspotClicks, devices, countries, referers, languages, heatmap, timeseries] =
        await Promise.all([
          run(`SELECT sum(_sample_interval) AS c ${base} AND blob1 = 'view'`),
          run(`SELECT count(DISTINCT blob8) AS c ${base} AND blob1 = 'view'`),
          run(`SELECT blob2 AS sceneId, sum(_sample_interval) AS v ${base} AND blob1 = 'scene' GROUP BY blob2`),
          run(`SELECT blob2 AS sceneId, avg(double1) AS adm ${base} AND blob1 = 'duration' GROUP BY blob2`),
          run(
            `SELECT blob2 AS sceneId, blob3 AS hotspotId, sum(_sample_interval) AS c ${base} AND blob1 = 'hotspot' GROUP BY blob2, blob3`,
          ),
          run(`SELECT blob5 AS device, sum(_sample_interval) AS c ${base} AND blob1 = 'view' GROUP BY blob5`),
          run(`SELECT blob6 AS country, sum(_sample_interval) AS c ${base} AND blob1 = 'view' GROUP BY blob6`),
          run(`SELECT blob7 AS host, sum(_sample_interval) AS c ${base} AND blob1 = 'view' GROUP BY blob7`),
          run(`SELECT blob4 AS lang, sum(_sample_interval) AS c ${base} AND blob1 = 'view' GROUP BY blob4`),
          run(
            `SELECT blob2 AS sceneId, double2 AS yawBucket, double3 AS pitchBucket, sum(_sample_interval) AS c ${base} AND blob1 = 'heartbeat' GROUP BY blob2, double2, double3`,
          ),
          run(
            `SELECT toDate(timestamp) AS day, sum(_sample_interval) AS c ${base} AND blob1 = 'view' GROUP BY day ORDER BY day`,
          ),
        ]);

      const durationByScene = new Map(durations.map((r) => [String(r.sceneId), Number(r.adm ?? 0)]));
      return {
        visits: Number(visits[0]?.c ?? 0),
        uniqueSessions: Number(uniq[0]?.c ?? 0),
        sceneViews: sceneViews
          .filter((r) => r.sceneId !== "")
          .map((r) => ({
            sceneId: String(r.sceneId),
            views: Number(r.v ?? 0),
            avgDurationMs: durationByScene.get(String(r.sceneId)) ?? 0,
          })),
        hotspotClicks: hotspotClicks
          .filter((r) => r.hotspotId !== "")
          .map((r) => ({ sceneId: String(r.sceneId), hotspotId: String(r.hotspotId), clicks: Number(r.c ?? 0) })),
        devices: devices.filter((r) => r.device !== "").map((r) => ({ device: String(r.device), count: Number(r.c ?? 0) })),
        countries: countries
          .filter((r) => r.country !== "")
          .map((r) => ({ country: String(r.country), count: Number(r.c ?? 0) })),
        referers: referers.filter((r) => r.host !== "").map((r) => ({ host: String(r.host), count: Number(r.c ?? 0) })),
        languages: languages.filter((r) => r.lang !== "").map((r) => ({ lang: String(r.lang), count: Number(r.c ?? 0) })),
        heatmap: heatmap
          .filter((r) => Number(r.yawBucket) >= 0)
          .map((r) => ({
            sceneId: String(r.sceneId),
            yawBucket: Number(r.yawBucket),
            pitchBucket: Number(r.pitchBucket),
            count: Number(r.c ?? 0),
          })),
        timeseries: timeseries.map((r) => ({ day: String(r.day), visits: Number(r.c ?? 0) })),
      };
    },
  };
}

/**
 * Email en Workers: sin transporte nativo, se usa un webhook HTTP generico
 * (compatible con Resend u otro proveedor via EMAIL_WEBHOOK_URL/KEY) o el
 * binding send_email de Cloudflare si se configura en el Worker.
 */
export function createFetchEmail(opts: { webhookUrl?: string; apiKey?: string; from: string }): EmailAdapter {
  const configured = opts.webhookUrl != null && opts.webhookUrl !== "";
  return {
    configured,
    async send(message: MailMessage) {
      if (!configured) {
        console.log(`[email:log] para=${message.to} asunto="${message.subject}"\n${message.text}`);
        return;
      }
      const res = await fetch(opts.webhookUrl!, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.apiKey != null ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          from: opts.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!res.ok) throw new Error(`Envio de email fallo: ${res.status} ${await res.text()}`);
    },
  };
}

export const cfPasswordHasher: PasswordHasher = pbkdf2Hasher;
