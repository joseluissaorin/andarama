import { api } from "../api";
import type { EditorSnapshot, HotspotRow, SceneRow } from "../stores";

/** ID aleatorio de cliente (mismo alfabeto no adivinable que el servidor). */
export function clientId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  let id = "";
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return id;
}

export async function loadSnapshot(projectId: string): Promise<{ snapshot: EditorSnapshot; project: Record<string, unknown> }> {
  const [content, project] = await Promise.all([
    api<{ scenes: SceneRow[]; hotspots: HotspotRow[] }>(`/projects/${projectId}/scenes`),
    api<Record<string, unknown> & { settings: Record<string, unknown> }>(`/projects/${projectId}`),
  ]);
  return {
    snapshot: {
      scenes: content.scenes,
      hotspots: content.hotspots,
      settings: project.settings ?? {},
    },
    project,
  };
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
): Promise<void> {
  const syncedScenes = new Map(synced.scenes.map((s) => [s.id, s]));
  const currentScenes = new Map(current.scenes.map((s) => [s.id, s]));
  const syncedHs = new Map(synced.hotspots.map((h) => [h.id, h]));
  const currentHs = new Map(current.hotspots.map((h) => [h.id, h]));

  // Escenas eliminadas (sus hotspots caen en cascada)
  for (const [id] of syncedScenes) {
    if (!currentScenes.has(id)) {
      await api(`/projects/${projectId}/scenes/${id}`, { method: "DELETE" });
    }
  }
  // Escenas nuevas y modificadas
  for (const scene of current.scenes) {
    const prev = syncedScenes.get(scene.id);
    if (prev == null) {
      await api(`/projects/${projectId}/scenes`, {
        method: "POST",
        body: {
          id: scene.id,
          title: scene.title,
          type: scene.type,
          mediaId: scene.mediaId,
          sourceJson: scene.sourceJson != null ? JSON.parse(scene.sourceJson) : undefined,
        },
      });
      await patchScene(projectId, scene, null);
    } else if (JSON.stringify(prev) !== JSON.stringify(scene)) {
      await patchScene(projectId, scene, prev);
    }
  }
  // Reordenacion
  const orderChanged =
    synced.scenes.map((s) => s.id).join(",") !== current.scenes.map((s) => s.id).join(",");
  if (orderChanged) {
    await api(`/projects/${projectId}/scenes/reorder`, {
      method: "POST",
      body: { order: current.scenes.map((s) => s.id) },
    });
  }

  // Hotspots
  for (const [id, prev] of syncedHs) {
    if (!currentHs.has(id) && currentScenes.has(prev.sceneId)) {
      await api(`/projects/${projectId}/hotspots/${id}`, { method: "DELETE" });
    }
  }
  for (const hs of current.hotspots) {
    if (!currentScenes.has(hs.sceneId)) continue;
    const prev = syncedHs.get(hs.id);
    if (prev == null) {
      await api(`/projects/${projectId}/scenes/${hs.sceneId}/hotspots`, {
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
      });
    } else if (JSON.stringify(prev) !== JSON.stringify(hs)) {
      await api(`/projects/${projectId}/hotspots/${hs.id}`, {
        method: "PATCH",
        body: {
          type: hs.type,
          position: JSON.parse(hs.positionJson),
          style: hs.styleJson != null ? JSON.parse(hs.styleJson) : null,
          content: JSON.parse(hs.contentJson),
          conditions: hs.conditionsJson != null ? JSON.parse(hs.conditionsJson) : null,
          sort: hs.sort,
        },
      });
    }
  }

  // Ajustes del tour
  if (JSON.stringify(synced.settings) !== JSON.stringify(current.settings)) {
    await api(`/projects/${projectId}`, { method: "PATCH", body: { settings: current.settings } });
  }
}

async function patchScene(projectId: string, scene: SceneRow, prev: SceneRow | null): Promise<void> {
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
  await api(`/projects/${projectId}/scenes/${scene.id}`, { method: "PATCH", body });
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
