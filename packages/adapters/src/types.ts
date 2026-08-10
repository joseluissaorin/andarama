/**
 * Interfaces de plataforma de Andarama.
 *
 * Regla de arquitectura (§5.1): ningun modulo de dominio importa APIs de
 * Cloudflare ni de Node directamente; todo pasa por estas interfaces.
 * `./cloudflare` y `./node` proporcionan las implementaciones.
 */

// ---------------------------------------------------------------------------
// Almacenamiento de objetos (R2 / FS / S3)
// ---------------------------------------------------------------------------

export interface StorageObjectMeta {
  key: string;
  size: number;
  etag?: string;
  contentType?: string;
  uploadedAt?: number;
}

export interface StoragePutOptions {
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
}

export interface PresignedUpload {
  /** simple: un solo PUT; multipart: varias partes + complete. */
  kind: "simple" | "multipart";
  key: string;
  /** URL para PUT directo (kind=simple). */
  url?: string;
  /** Identificador de subida multiparte (kind=multipart). */
  uploadId?: string;
  /** Tamano de parte recomendado en bytes. */
  partSize?: number;
  /** Cabeceras a incluir en cada PUT. */
  headers?: Record<string, string>;
}

export interface StorageAdapter {
  put(key: string, body: ReadableStream | ArrayBuffer | Uint8Array | string, opts?: StoragePutOptions): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; meta: StorageObjectMeta } | null>;
  getBytes(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<StorageObjectMeta | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
  list(prefix: string, opts?: { limit?: number; cursor?: string }): Promise<{
    objects: StorageObjectMeta[];
    cursor?: string;
    truncated: boolean;
  }>;
  /**
   * Prepara una subida directa del navegador al almacenamiento.
   * En R2/S3 devuelve URLs prefirmadas (el binario nunca pasa por la API);
   * si no hay credenciales S3 configuradas, devuelve URLs firmadas HMAC
   * servidas por la propia API en modo streaming pass-through.
   */
  createPresignedUpload(key: string, opts: {
    contentType?: string;
    contentLength?: number;
    multipart?: boolean;
  }): Promise<PresignedUpload>;
  /** URL prefirmada de una parte multiparte (1-indexed). */
  presignUploadPart(key: string, uploadId: string, partNumber: number): Promise<string>;
  completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// KV (cache, rate limit, sesiones calientes)
// ---------------------------------------------------------------------------

export interface KVAdapter {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Colas de trabajo
// ---------------------------------------------------------------------------

export interface JobMessage {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  orgId: string;
}

export interface QueueAdapter {
  /** Encola un trabajo. La fila en `jobs` la crea la capa de API. */
  enqueue(message: JobMessage): Promise<void>;
}

// ---------------------------------------------------------------------------
// Analitica sin cookies
// ---------------------------------------------------------------------------

export interface AnalyticsEvent {
  tourSlug: string;
  event: "view" | "scene" | "hotspot" | "duration" | "quiz" | "form" | "share" | "vr" | "heartbeat";
  sceneId?: string;
  hotspotId?: string;
  lang?: string;
  device?: string;
  country?: string;
  refererHost?: string;
  sessionHash?: string;
  durationMs?: number;
  yawBucket?: number;
  pitchBucket?: number;
}

export interface AnalyticsSummary {
  visits: number;
  uniqueSessions: number;
  sceneViews: { sceneId: string; views: number; avgDurationMs: number }[];
  hotspotClicks: { sceneId: string; hotspotId: string; clicks: number }[];
  devices: { device: string; count: number }[];
  countries: { country: string; count: number }[];
  referers: { host: string; count: number }[];
  languages: { lang: string; count: number }[];
  /** Mapa de calor: buckets de orientacion por escena. */
  heatmap: { sceneId: string; yawBucket: number; pitchBucket: number; count: number }[];
  timeseries: { day: string; visits: number }[];
}

export interface AnalyticsAdapter {
  write(event: AnalyticsEvent): Promise<void>;
  query(tourSlug: string, opts: { from: number; to: number }): Promise<AnalyticsSummary>;
}

// ---------------------------------------------------------------------------
// Contrasenas
// ---------------------------------------------------------------------------

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, phcHash: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Email transaccional
// ---------------------------------------------------------------------------

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailAdapter {
  /** false => no hay transporte configurado (modo log). */
  configured: boolean;
  send(message: MailMessage): Promise<void>;
}

// ---------------------------------------------------------------------------
// Entorno agregado que recibe la API
// ---------------------------------------------------------------------------

export interface PlatformRuntime {
  storage: StorageAdapter;
  kv: KVAdapter;
  queue: QueueAdapter;
  analytics: AnalyticsAdapter;
  passwords: PasswordHasher;
  email: EmailAdapter;
  /** Instancia drizzle tipada con el esquema de @andarama/db. */
  db: unknown;
  /** "cloudflare" | "node" */
  platform: "cloudflare" | "node";
  /** URL publica base de la instancia. */
  publicUrl: string;
  /** Ejecuta trabajo despues de responder (waitUntil en Workers). */
  deferred(promise: Promise<unknown>): void;
}
