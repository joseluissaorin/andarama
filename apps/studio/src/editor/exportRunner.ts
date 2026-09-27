import type { ExportProgress } from "@andarama/exporter";
import { runExportJob, type ExportJob } from "./exportJob";

/**
 * Lado de la interfaz del export: lanza el trabajo en un Web Worker y va
 * volcando el ZIP a su destino según llega.
 */

export interface ZipSink {
  write: (chunk: Uint8Array) => void;
  close: () => Promise<void>;
  abort: () => Promise<void>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }> }>;
}

/**
 * Destino del ZIP. Donde el navegador lo permite (Chrome, Edge) se escribe
 * directamente en el fichero que elige el usuario, sin retener el paquete en
 * memoria; en los demás se juntan los trozos y se descarga al final.
 * Devuelve null si el usuario cancela el diálogo de guardar.
 */
export async function openZipSink(fileName: string): Promise<ZipSink | null> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (picker != null) {
    try {
      const handle = await picker({ suggestedName: fileName, types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }] });
      const writable = await handle.createWritable();
      // Las escrituras se encadenan: el orden de los trozos es el del ZIP
      let queue: Promise<void> = Promise.resolve();
      return {
        write: (chunk) => {
          queue = queue.then(() => writable.write(chunk as BlobPart));
        },
        close: async () => {
          await queue;
          await writable.close();
        },
        abort: async () => {
          await queue.catch(() => {});
          await writable.abort().catch(() => {});
        },
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // Sin permiso o sin soporte real: se cae a la descarga normal
    }
  }
  const chunks: Uint8Array[] = [];
  return {
    write: (chunk) => {
      chunks.push(chunk);
    },
    close: async () => {
      const blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
      chunks.length = 0;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    },
    abort: async () => {
      chunks.length = 0;
    },
  };
}

/**
 * Ejecuta el export en un Web Worker. Si el navegador no deja crearlo, se
 * hace en el hilo principal con el mismo código.
 */
export function runExportInWorker(
  job: ExportJob,
  hooks: {
    getHeaders: () => Promise<Record<string, string>>;
    onChunk: (chunk: Uint8Array) => void;
    onProgress: (p: ExportProgress) => void;
  },
): Promise<{ files: number; bytes: number }> {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./exportWorker.ts", import.meta.url), { type: "module" });
  } catch {
    return runExportJob(job, hooks);
  }
  return new Promise((resolve, reject) => {
    worker.addEventListener("message", (e: MessageEvent) => {
      const msg = e.data as { type: string; id?: number; data?: Uint8Array; p?: ExportProgress; result?: { files: number; bytes: number }; message?: string };
      switch (msg.type) {
        case "headers":
          void hooks.getHeaders().then((headers) => worker.postMessage({ type: "headers", id: msg.id, headers }));
          break;
        case "chunk":
          if (msg.data != null) hooks.onChunk(msg.data);
          break;
        case "progress":
          if (msg.p != null) hooks.onProgress(msg.p);
          break;
        case "done":
          worker.terminate();
          resolve(msg.result!);
          break;
        case "error":
          worker.terminate();
          reject(new Error(msg.message ?? "Error en el export"));
          break;
      }
    });
    worker.addEventListener("error", (e) => {
      worker.terminate();
      reject(new Error(e.message || "El worker del export ha fallado"));
    });
    worker.postMessage({ type: "start", job });
  });
}
