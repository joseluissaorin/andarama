import { runExportJob, type ExportJob } from "./exportJob";

/**
 * Web Worker del export: descarga los assets en paralelo, comprime el texto y
 * arma el ZIP fuera del hilo de la interfaz. Los trozos del ZIP se transfieren
 * al hilo principal según salen, que los vuelca a disco si puede.
 *
 * Protocolo:
 *   entrada  {type:"start", job}  ·  {type:"headers", id, headers}
 *   salida   {type:"headers", id} · {type:"chunk", data} · {type:"progress", p}
 *            {type:"done", result} · {type:"error", message}
 */

// Tipado mínimo del ámbito del worker (el proyecto compila con la lib DOM)
const ctx = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (e: MessageEvent) => void): void;
};

let nextId = 0;
const waiting = new Map<number, (headers: Record<string, string>) => void>();
let cached: { headers: Record<string, string>; at: number } | null = null;

/** El token se pide al hilo principal y se reutiliza unos segundos. */
async function getHeaders(): Promise<Record<string, string>> {
  if (cached != null && Date.now() - cached.at < 20_000) return cached.headers;
  const id = nextId++;
  const headers = await new Promise<Record<string, string>>((resolve) => {
    waiting.set(id, resolve);
    ctx.postMessage({ type: "headers", id });
  });
  cached = { headers, at: Date.now() };
  return headers;
}

ctx.addEventListener("message", (e: MessageEvent) => {
  const msg = e.data as { type: string; id?: number; headers?: Record<string, string>; job?: ExportJob };
  if (msg.type === "headers" && msg.id != null) {
    waiting.get(msg.id)?.(msg.headers ?? {});
    waiting.delete(msg.id);
    return;
  }
  if (msg.type !== "start" || msg.job == null) return;
  void runExportJob(msg.job, {
    getHeaders,
    onChunk: (chunk) => {
      // Se transfiere sin copiar; si el trozo es una vista sobre un buffer
      // mayor, se copia antes para no llevarse el resto
      const own = chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength ? chunk : chunk.slice();
      ctx.postMessage({ type: "chunk", data: own }, [own.buffer as ArrayBuffer]);
    },
    onProgress: (p) => ctx.postMessage({ type: "progress", p }),
  })
    .then((result) => ctx.postMessage({ type: "done", result }))
    .catch((err: unknown) => ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) }));
});
