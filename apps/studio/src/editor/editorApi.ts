import { api, ApiRequestError } from "../api";
import type { EditorSnapshot, SceneRow } from "../stores";
import { snapshotFromServer, type VersionBook } from "./collab/merge";

/** ID aleatorio de cliente (mismo alfabeto no adivinable que el servidor). */
export function clientId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  let id = "";
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return id;
}

export async function loadSnapshot(
  projectId: string,
): Promise<{ snapshot: EditorSnapshot; project: Record<string, unknown>; versions: VersionBook }> {
  const [content, project] = await Promise.all([
    api<{ scenes: Record<string, unknown>[]; hotspots: Record<string, unknown>[] }>(`/projects/${projectId}/scenes`),
    api<Record<string, unknown> & { settings: Record<string, unknown>; settingsVersion?: number }>(`/projects/${projectId}`),
  ]);
  // Las versiones (edición en grupo) van aparte: no son contenido, y así el
  // diff del autoguardado y deshacer/rehacer no las ven
  const { snapshot, versions } = snapshotFromServer(content, project.settings ?? {}, project.settingsVersion);
  return { snapshot, project, versions };
}

/**
 * Otra persona guardó antes lo mismo (409) o lo borró (404 al cambiarlo). El
 * autoguardado lo resuelve: trae lo vigente, fusiona sin perder lo que se está
 * escribiendo y vuelve a guardar.
 */
export class SaveConflictError extends Error {
  constructor(
    public entity: string,
    public entityId: string | null,
  ) {
    super(`conflict:${entity}`);
    this.name = "SaveConflictError";
  }
}

/** Lo que el guardado necesita de la edición en grupo (todo opcional). */
export interface SyncContext {
  /** Versión conocida de cada elemento; se manda y se actualiza con cada respuesta. */
  versions?: VersionBook;
  /** Conexión de la sala desde la que se escribe (los avisos la llevan en `origin`). */
  connectionId?: () => string | null;
}

/**
 * Sincronizacion por diferencias: compara la instantanea actual con la
 * ultima sincronizada y emite las llamadas minimas a la API. Determinista,
 * compatible con deshacer/rehacer (el estado local es la fuente de verdad
 * del borrador durante la sesion).
 */
export async function syncSnapshot(
  projectId: string,
  synced: EditorSnapshot,
  current: EditorSnapshot,
  ctx: SyncContext = {},
): Promise<void> {
  const versions = ctx.versions;
  const call = async <T = unknown>(
    path: string,
    opts: { method: string; body?: unknown },
    entity: { kind: string; id: string | null },
  ): Promise<T> => {
    const conn = ctx.connectionId?.();
    try {
      return await api<T>(path, { ...opts, headers: conn != null ? { "x-andarama-conn": conn } : undefined });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        // Borrar lo que otro ya borró no es un error
        if (err.status === 404 && opts.method === "DELETE") return {} as T;
        if (err.status === 409 && err.extra?.code === "version_conflict") throw new SaveConflictError(entity.kind, entity.id);
        if (err.status === 404 && opts.method === "PATCH") throw new SaveConflictError(entity.kind, entity.id);
      }
      throw err;
    }
  };
  const remember = (key: string, version: unknown): void => {
    if (versions != null && typeof version === "number") versions.set(key, version);
  };
  const syncedScenes = new Map(synced.scenes.map((s) => [s.id, s]));
  const currentScenes = new Map(current.scenes.map((s) => [s.id, s]));
  const syncedHs = new Map(synced.hotspots.map((h) => [h.id, h]));
  const currentHs = new Map(current.hotspots.map((h) => [h.id, h]));

  // Escenas eliminadas (sus hotspots caen en cascada)
  for (const [id] of syncedScenes) {
    if (!currentScenes.has(id)) {
      await call(`/projects/${projectId}/scenes/${id}`, { method: "DELETE" }, { kind: "scene", id });
      versions?.delete(`scene:${id}`);
    }
  }
  // Escenas nuevas y modificadas
  for (const scene of current.scenes) {
    const prev = syncedScenes.get(scene.id);
    if (prev == null) {
      const created = await call<{ version?: number }>(
        `/projects/${projectId}/scenes`,
        {
          method: "POST",
          body: {
            id: scene.id,
            title: scene.title,
            type: scene.type,
            mediaId: scene.mediaId,
            sourceJson: scene.sourceJson != null ? JSON.parse(scene.sourceJson) : undefined,
          },
        },
        { kind: "scene", id: scene.id },
      );
      remember(`scene:${scene.id}`, created.version);
      await patchScene(projectId, scene, null, call, versions);
    } else if (JSON.stringify(prev) !== JSON.stringify(scene)) {
      await patchScene(projectId, scene, prev, call, versions);
    }
  }
  // Reordenacion
  const orderChanged =
    synced.scenes.map((s) => s.id).join(",") !== current.scenes.map((s) => s.id).join(",");
  if (orderChanged) {
    await call(`/projects/${projectId}/scenes/reorder`, { method: "POST", body: { order: current.scenes.map((s) => s.id) } }, { kind: "order", id: null });
  }

  // Hotspots
  for (const [id, prev] of syncedHs) {
    if (!currentHs.has(id) && currentScenes.has(prev.sceneId)) {
      await call(`/projects/${projectId}/hotspots/${id}`, { method: "DELETE" }, { kind: "hotspot", id });
      versions?.delete(`hotspot:${id}`);
    }
  }
  for (const hs of current.hotspots) {
    if (!currentScenes.has(hs.sceneId)) continue;
    const prev = syncedHs.get(hs.id);
    if (prev == null) {
      const created = await call<{ version?: number }>(`/projects/${projectId}/scenes/${hs.sceneId}/hotspots`, {
        method: "POST",
        body: {
          id: hs.id,
          type: hs.type,
          position: JSON.parse(hs.positionJson),
          style: hs.styleJson != null ? JSON.parse(hs.styleJson) : undefined,
          content: JSON.parse(hs.contentJson),
          conditions: hs.conditionsJson != null ? JSON.parse(hs.conditionsJson) : undefined,
          sort: hs.sort,
        },
      }, { kind: "hotspot", id: hs.id });
      remember(`hotspot:${hs.id}`, created.version);
    } else if (JSON.stringify(prev) !== JSON.stringify(hs)) {
      const res = await call<{ version?: number }>(`/projects/${projectId}/hotspots/${hs.id}`, {
        method: "PATCH",
        body: {
          type: hs.type,
          position: JSON.parse(hs.positionJson),
          style: hs.styleJson != null ? JSON.parse(hs.styleJson) : null,
          content: JSON.parse(hs.contentJson),
          conditions: hs.conditionsJson != null ? JSON.parse(hs.conditionsJson) : null,
          sort: hs.sort,
          baseVersion: versions?.get(`hotspot:${hs.id}`),
        },
      }, { kind: "hotspot", id: hs.id });
      remember(`hotspot:${hs.id}`, res.version);
    }
  }

  // Ajustes del tour
  if (JSON.stringify(synced.settings) !== JSON.stringify(current.settings)) {
    const res = await call<{ settingsVersion?: number }>(
      `/projects/${projectId}`,
      { method: "PATCH", body: { settings: current.settings, baseSettingsVersion: versions?.get("settings") } },
      { kind: "settings", id: null },
    );
    remember("settings", res.settingsVersion);
  }
}

type SyncCall = <T = unknown>(path: string, opts: { method: string; body?: unknown }, entity: { kind: string; id: string | null }) => Promise<T>;

async function patchScene(projectId: string, scene: SceneRow, prev: SceneRow | null, call: SyncCall, versions?: VersionBook): Promise<void> {
  const body: Record<string, unknown> = {};
  if (prev == null || prev.title !== scene.title) body.title = scene.title;
  if (prev == null || prev.type !== scene.type) body.type = scene.type;
  if (prev == null || prev.mediaId !== scene.mediaId) body.mediaId = scene.mediaId;
  if (prev == null || prev.sourceJson !== scene.sourceJson)
    body.sourceJson = scene.sourceJson != null ? JSON.parse(scene.sourceJson) : null;
  if (prev == null || prev.initialViewJson !== scene.initialViewJson)
    body.initialView = scene.initialViewJson != null ? JSON.parse(scene.initialViewJson) : null;
  if (prev == null || prev.limitsJson !== scene.limitsJson)
    body.limits = scene.limitsJson != null ? JSON.parse(scene.limitsJson) : null;
  if (prev == null || prev.audioJson !== scene.audioJson)
    body.audio = scene.audioJson != null ? JSON.parse(scene.audioJson) : null;
  if (prev == null || prev.mapJson !== scene.mapJson)
    body.map = scene.mapJson != null ? JSON.parse(scene.mapJson) : null;
  if (prev == null || prev.metaJson !== scene.metaJson) body.meta = JSON.parse(scene.metaJson || "{}");
  if (Object.keys(body).length === 0) return;
  body.baseVersion = versions?.get(`scene:${scene.id}`);
  const res = await call<{ version?: number }>(`/projects/${projectId}/scenes/${scene.id}`, { method: "PATCH", body }, { kind: "scene", id: scene.id });
  if (versions != null && typeof res.version === "number") versions.set(`scene:${scene.id}`, res.version);
}

// ---------------------------------------------------------------------------
// Utilidades JSON de filas
// ---------------------------------------------------------------------------

export function readJson<T>(text: string | null | undefined, fallback: T): T {
  if (text == null || text === "") return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function sceneMeta(scene: SceneRow): Record<string, unknown> {
  return readJson(scene.metaJson, {});
}
