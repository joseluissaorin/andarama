import type { PresignedUpload, StorageAdapter, StorageObjectMeta, StoragePutOptions } from "../types.js";
import { S3Presigner } from "../shared/s3.js";
import { signUploadUrl } from "../shared/hmac.js";
import type { R2BucketLike } from "./bindings.js";

export interface R2StorageOptions {
  /** Credenciales S3 de R2 para prefirmar subidas directas (recomendado). */
  s3?: { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  /** Secreto HMAC + URL publica para el modo pass-through si no hay S3. */
  hmacSecret: string;
  publicUrl: string;
  /**
   * Origen contra el que el navegador sube.
   *
   * No siempre es `publicUrl`: el Studio vive en app.andarama.com y la URL
   * canónica es el apex, así que firmar contra `publicUrl` convertía cada
   * subida en una petición entre orígenes que el navegador bloqueaba. Lo que
   * hay que usar es el origen desde el que se pidió la subida.
   */
  uploadOrigin?: string;
}

const MULTIPART_PART_SIZE = 10 * 1024 * 1024;

/**
 * StorageAdapter sobre un bucket R2. Las operaciones de servidor usan el
 * binding; las subidas del navegador se prefirman contra el endpoint S3 de
 * R2 si hay credenciales (el binario nunca pasa por el Worker) o, en su
 * defecto, se firman HMAC contra la propia API en modo streaming.
 */
export function createR2Storage(bucket: R2BucketLike, opts: R2StorageOptions): StorageAdapter {
  const presigner =
    opts.s3 != null
      ? new S3Presigner({
          endpoint: `https://${opts.s3.accountId}.r2.cloudflarestorage.com`,
          bucket: opts.s3.bucket,
          accessKeyId: opts.s3.accessKeyId,
          secretAccessKey: opts.s3.secretAccessKey,
        })
      : null;

  const toMeta = (o: { key: string; size: number; etag: string; uploaded?: Date; httpMetadata?: { contentType?: string } }): StorageObjectMeta => ({
    key: o.key,
    size: o.size,
    etag: o.etag,
    contentType: o.httpMetadata?.contentType,
    uploadedAt: o.uploaded?.getTime(),
  });

  return {
    async put(key, body, putOpts?: StoragePutOptions) {
      await bucket.put(key, body, {
        httpMetadata: {
          contentType: putOpts?.contentType,
          cacheControl: putOpts?.cacheControl,
          contentDisposition: putOpts?.contentDisposition,
        },
      });
    },

    async get(key) {
      const obj = await bucket.get(key);
      if (obj == null) return null;
      return { body: obj.body, meta: toMeta(obj) };
    },

    async getBytes(key) {
      const obj = await bucket.get(key);
      if (obj == null) return null;
      const buf = await obj.arrayBuffer!();
      return new Uint8Array(buf);
    },

    async head(key) {
      const obj = await bucket.head(key);
      return obj == null ? null : toMeta(obj);
    },

    async delete(key) {
      await bucket.delete(key);
    },

    async deletePrefix(prefix) {
      let deleted = 0;
      let cursor: string | undefined;
      for (;;) {
        const page = await bucket.list({ prefix, limit: 500, cursor });
        const keys = page.objects.map((o) => o.key);
        if (keys.length > 0) {
          await bucket.delete(keys);
          deleted += keys.length;
        }
        if (!page.truncated || page.cursor == null) break;
        cursor = page.cursor;
      }
      return deleted;
    },

    async list(prefix, listOpts) {
      const page = await bucket.list({ prefix, limit: listOpts?.limit ?? 100, cursor: listOpts?.cursor });
      return { objects: page.objects.map(toMeta), cursor: page.cursor, truncated: page.truncated };
    },

    async createPresignedUpload(key, upOpts): Promise<PresignedUpload> {
      const multipart = upOpts.multipart === true || (upOpts.contentLength ?? 0) > 100 * 1024 * 1024;
      if (presigner != null) {
        if (multipart) {
          const uploadId = await presigner.createMultipartUpload(key, upOpts.contentType);
          return { kind: "multipart", key, uploadId, partSize: MULTIPART_PART_SIZE };
        }
        const url = await presigner.presignPut(key);
        return { kind: "simple", key, url, headers: upOpts.contentType != null ? { "content-type": upOpts.contentType } : undefined };
      }
      // Fallback pass-through por la API (streaming, sin buffering).
      if (multipart && bucket.createMultipartUpload != null) {
        const mp = await bucket.createMultipartUpload(key);
        return { kind: "multipart", key, uploadId: mp.uploadId, partSize: MULTIPART_PART_SIZE };
      }
      const url = await signUploadUrl(opts.hmacSecret, opts.uploadOrigin ?? opts.publicUrl, key);
      return { kind: "simple", key, url };
    },

    async presignUploadPart(key, uploadId, partNumber) {
      if (presigner != null) return presigner.presignUploadPart(key, uploadId, partNumber);
      return signUploadUrl(opts.hmacSecret, opts.uploadOrigin ?? opts.publicUrl, key, { part: partNumber, uploadId });
    },

    async completeMultipart(key, uploadId, parts) {
      if (presigner != null) {
        await presigner.completeMultipart(key, uploadId, parts);
        return;
      }
      if (bucket.resumeMultipartUpload == null) throw new Error("Multipart no soportado sin S3 en este entorno");
      await bucket.resumeMultipartUpload(key, uploadId).complete(parts);
    },

    async abortMultipart(key, uploadId) {
      if (presigner != null) {
        await presigner.abortMultipart(key, uploadId);
        return;
      }
      if (bucket.resumeMultipartUpload != null) {
        await bucket.resumeMultipartUpload(key, uploadId).abort();
      }
    },
  };
}
