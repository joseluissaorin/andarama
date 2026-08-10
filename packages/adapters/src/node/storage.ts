import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Readable, Writable } from "node:stream";
import type { PresignedUpload, StorageAdapter, StorageObjectMeta, StoragePutOptions } from "../types.js";
import { S3Presigner, type S3Config } from "../shared/s3.js";
import { signUploadUrl } from "../shared/hmac.js";

export interface FsStorageOptions {
  rootDir: string;
  hmacSecret: string;
  publicUrl: string;
  /** S3/MinIO opcional: si se configura, las subidas se prefirman contra el. */
  s3?: S3Config;
}

/**
 * StorageAdapter sobre el sistema de ficheros local (self-host). Las subidas
 * del navegador van firmadas HMAC contra la propia API (streaming a disco),
 * o prefirmadas contra S3/MinIO si esta configurado.
 */
export function createFsStorage(opts: FsStorageOptions): StorageAdapter {
  const root = resolve(opts.rootDir);
  const presigner = opts.s3 != null ? new S3Presigner(opts.s3) : null;

  const safePath = (key: string): string => {
    const p = resolve(join(root, key));
    if (!p.startsWith(root + sep) && p !== root) throw new Error(`Clave de almacenamiento inválida: ${key}`);
    return p;
  };

  const metaOf = async (key: string): Promise<StorageObjectMeta | null> => {
    try {
      const s = await stat(safePath(key));
      if (!s.isFile()) return null;
      return { key, size: s.size, uploadedAt: s.mtimeMs };
    } catch {
      return null;
    }
  };

  return {
    async put(key, body, _opts?: StoragePutOptions) {
      const path = safePath(key);
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp-${Math.random().toString(36).slice(2)}`;
      if (typeof body === "string" || body instanceof Uint8Array) {
        await writeFile(tmp, body);
      } else if (body instanceof ArrayBuffer) {
        await writeFile(tmp, new Uint8Array(body));
      } else {
        const nodeStream = Readable.fromWeb(body as import("node:stream/web").ReadableStream);
        await new Promise<void>((resolvePromise, reject) => {
          const ws = createWriteStream(tmp);
          nodeStream.pipe(ws);
          ws.on("finish", () => resolvePromise());
          ws.on("error", reject);
          nodeStream.on("error", reject);
        });
      }
      await rename(tmp, path);
    },

    async get(key) {
      const meta = await metaOf(key);
      if (meta == null) return null;
      const nodeStream = createReadStream(safePath(key));
      const body = Readable.toWeb(nodeStream) as unknown as ReadableStream;
      return { body, meta };
    },

    async getBytes(key) {
      try {
        const buf = await readFile(safePath(key));
        return new Uint8Array(buf);
      } catch {
        return null;
      }
    },

    head(key) {
      return metaOf(key);
    },

    async delete(key) {
      await rm(safePath(key), { force: true });
    },

    async deletePrefix(prefix) {
      const path = safePath(prefix);
      let count = 0;
      try {
        const walk = async (dir: string): Promise<void> => {
          for (const entry of await readdir(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) await walk(full);
            else count++;
          }
        };
        await walk(path);
        await rm(path, { recursive: true, force: true });
      } catch {
        // prefijo inexistente
      }
      return count;
    },

    async list(prefix, listOpts) {
      const out: StorageObjectMeta[] = [];
      const limit = listOpts?.limit ?? 100;
      const startAfter = listOpts?.cursor;
      const base = safePath(prefix);
      const collect = async (dir: string): Promise<void> => {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          if (out.length > limit) return;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await collect(full);
          } else {
            const key = relative(root, full).split(sep).join("/");
            if (startAfter != null && key <= startAfter) continue;
            const s = await stat(full);
            out.push({ key, size: s.size, uploadedAt: s.mtimeMs });
          }
        }
      };
      await collect(base);
      const truncated = out.length > limit;
      const objects = out.slice(0, limit);
      return { objects, truncated, cursor: truncated ? objects[objects.length - 1]?.key : undefined };
    },

    async createPresignedUpload(key, upOpts): Promise<PresignedUpload> {
      if (presigner != null) {
        const multipart = upOpts.multipart === true || (upOpts.contentLength ?? 0) > 100 * 1024 * 1024;
        if (multipart) {
          const uploadId = await presigner.createMultipartUpload(key, upOpts.contentType);
          return { kind: "multipart", key, uploadId, partSize: 10 * 1024 * 1024 };
        }
        return { kind: "simple", key, url: await presigner.presignPut(key) };
      }
      // Local: subida pass-through firmada. Para ficheros grandes se trocea
      // en partes que la API concatena en complete.
      const multipart = upOpts.multipart === true || (upOpts.contentLength ?? 0) > 100 * 1024 * 1024;
      if (multipart) {
        const uploadId = `local-${Math.random().toString(36).slice(2)}`;
        return { kind: "multipart", key, uploadId, partSize: 10 * 1024 * 1024 };
      }
      return { kind: "simple", key, url: await signUploadUrl(opts.hmacSecret, opts.publicUrl, key) };
    },

    async presignUploadPart(key, uploadId, partNumber) {
      if (presigner != null) return presigner.presignUploadPart(key, uploadId, partNumber);
      return signUploadUrl(opts.hmacSecret, opts.publicUrl, key, { part: partNumber, uploadId });
    },

    async completeMultipart(key, uploadId, parts) {
      if (presigner != null) {
        await presigner.completeMultipart(key, uploadId, parts);
        return;
      }
      // Concatena las partes locales subidas como {key}.part-N
      const path = safePath(key);
      await mkdir(dirname(path), { recursive: true });
      const ws = createWriteStream(path);
      const writable = Writable.toWeb(ws);
      const writer = (writable as WritableStream).getWriter();
      for (const part of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
        const partPath = safePath(`${key}.part-${part.partNumber}`);
        const data = await readFile(partPath);
        await writer.write(data);
      }
      await writer.close();
      for (const part of parts) {
        await rm(safePath(`${key}.part-${part.partNumber}`), { force: true });
      }
    },

    async abortMultipart(key, uploadId) {
      if (presigner != null) {
        await presigner.abortMultipart(key, uploadId);
        return;
      }
      const dir = dirname(safePath(key));
      try {
        for (const entry of await readdir(dir)) {
          if (entry.startsWith(`${key.split("/").pop()}.part-`)) {
            await rm(join(dir, entry), { force: true });
          }
        }
      } catch {
        // nada que abortar
      }
    },
  };
}
