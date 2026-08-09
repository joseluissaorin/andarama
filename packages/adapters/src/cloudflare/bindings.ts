/**
 * Tipos estructurales minimos de los bindings de Cloudflare que usamos.
 * Se declaran aqui (en lugar de importar @cloudflare/workers-types) para que
 * el paquete compile igual en cualquier plataforma y no contamine los tipos
 * DOM del resto del monorepo.
 */

export interface R2ObjectLike {
  key: string;
  size: number;
  etag: string;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
  body?: ReadableStream;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export interface R2BucketLike {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string; contentDisposition?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<(R2ObjectLike & { body: ReadableStream }) | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ objects: R2ObjectLike[]; truncated: boolean; cursor?: string }>;
  createMultipartUpload?(key: string, options?: unknown): Promise<{ uploadId: string }>;
  resumeMultipartUpload?(key: string, uploadId: string): {
    uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer): Promise<{ partNumber: number; etag: string }>;
    complete(parts: { partNumber: number; etag: string }[]): Promise<unknown>;
    abort(): Promise<void>;
  };
}

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface QueueLike {
  send(message: unknown): Promise<void>;
}

export interface AnalyticsEngineDatasetLike {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}
