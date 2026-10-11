import type { Tour } from "@andarama/schema";
import {
  fetchBytes,
  runExport,
  withRetry,
  ZipWriter,
  type AssetProvider,
  type ExportOptions,
  type ExportProgress,
  type ExportResult,
} from "@andarama/exporter";

/**
 * El trabajo de exportar, sin nada de la interfaz: lo ejecuta el Web Worker
 * (exportWorker.ts) para no congelar el editor mientras se descargan miles de
 * teselas y se arma el ZIP, y el hilo principal si el navegador no deja crear
 * el worker.
 */
export interface ExportJob {
  projectId: string;
  tour: Tour;
  /** Ruta dentro del paquete y clave de almacenamiento de cada asset. */
  assets: { rel: string; key: string }[];
  /**
   * Vale firmado de POST /export: cada fichero se descarga sin sesión ni
   * consultas por fichero. Sin él (API anterior) se usa la vista previa.
   */
  token?: string;
  options: ExportOptions;
}

export interface ExportJobHooks {
  /** Cabeceras de autenticación frescas (el token de sesión caduca en minutos). */
  getHeaders: () => Promise<Record<string, string>>;
  /** Cada trozo del ZIP según se escribe: se puede volcar a disco sin acumularlo. */
  onChunk: (chunk: Uint8Array) => void | Promise<void>;
  onProgress: (p: ExportProgress) => void;
}

export async function runExportJob(job: ExportJob, hooks: ExportJobHooks): Promise<ExportResult> {
  // Ficheros del visor. Los sourcemaps no se publican: ahorran ~1,5 MB.
  const viewerList = await fetch("/viewer/files.json").then((r) => (r.ok ? (r.json() as Promise<string[]>) : []));
  const viewerFiles = await Promise.all(
    viewerList
      .filter((path) => !path.endsWith(".map"))
      .map(async (path) => ({
        path,
        data: await withRetry(() => fetchBytes(`/viewer/${path}`, `viewer/${path}`)),
      })),
  );
  const keys = new Map(job.assets.map((a) => [a.rel, a.key]));
  const provider: AssetProvider = {
    list: async () => job.assets.map((a) => a.rel),
    read: async (rel) => {
      const key = keys.get(rel);
      if (job.token != null && key != null) {
        const q = new URLSearchParams({ k: key, t: job.token });
        return fetchBytes(`/api/v1/projects/${job.projectId}/export/blob?${q.toString()}`, rel, { credentials: "omit" });
      }
      return fetchBytes(`/api/v1/projects/${job.projectId}/preview/${rel}`, rel, {
        credentials: "same-origin",
        headers: await hooks.getHeaders(),
      });
    },
  };
  const writer = new ZipWriter(hooks.onChunk);
  return runExport(job.tour, viewerFiles, provider, job.options, writer, hooks.onProgress);
}
