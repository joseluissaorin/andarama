import type { EditorSnapshot, HotspotRow, SceneRow } from "../../stores";

/**
 * Fusión a tres bandas del tour del editor.
 *
 *  - `base`: lo último que se sabe guardado en el servidor (la base del diff
 *    del autoguardado).
 *  - `local`: lo que hay en pantalla, con lo que se está escribiendo.
 *  - `remote`: lo que el servidor tiene ahora (la base más los cambios de
 *    otras personas).
 *
 * Regla: lo que solo cambió una parte, se queda; lo que cambiaron las dos,
 * gana lo local, porque es lo que la persona tiene delante y aún no ha
 * guardado. Se baja hasta las claves de los JSON (contenido de un punto,
 * metadatos de una escena, ajustes): dos personas que tocan campos distintos
 * del mismo punto no se pisan. Un borrado gana a una edición: si alguien
 * borra lo que otro estaba tocando, el bloqueo blando ya avisaba.
 *
 * Todo es puro y determinista para poder probarlo sin navegador.
 */

type Json = unknown;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Igualdad profunda de JSON sin importar el orden de las claves. */
export function sameJson(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null && a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameJson(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!sameJson(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** Fusión a tres bandas de un valor JSON. `undefined` es «la clave no está». */
export function merge3(base: Json, local: Json, remote: Json): Json {
  if (sameJson(local, base)) return remote;
  if (sameJson(remote, base) || sameJson(local, remote)) return local;
  if (isPlainObject(local) && isPlainObject(remote)) {
    const b = isPlainObject(base) ? base : {};
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const v = merge3(b[key], local[key], remote[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  // Los dos cambiaron lo mismo: gana lo que se está escribiendo
  return local;
}

function parseJsonField(text: unknown): Record<string, unknown> | null {
  if (typeof text !== "string") return null;
  try {
    const v = JSON.parse(text) as unknown;
    return isPlainObject(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Fusiona una fila (escena o punto). Los campos `*Json` son JSON guardado
 * como texto: si las dos partes lo cambiaron, se fusiona por claves.
 */
export function mergeRow<T extends object>(base: T, local: T, remote: T): T {
  const b = base as Record<string, unknown>;
  const l = local as Record<string, unknown>;
  const r = remote as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const bv = b[key];
    const lv = l[key];
    const rv = r[key];
    if (lv === bv || sameJsonText(lv, bv)) out[key] = rv;
    else if (rv === bv || rv === lv || sameJsonText(rv, bv)) out[key] = lv;
    else if (key.endsWith("Json")) {
      const pl = parseJsonField(lv);
      const pr = parseJsonField(rv);
      if (pl != null && pr != null) out[key] = JSON.stringify(merge3(parseJsonField(bv) ?? {}, pl, pr));
      else out[key] = lv;
    } else out[key] = lv;
  }
  return out as T;
}

/** Dos textos JSON que dicen lo mismo con las claves en otro orden. */
function sameJsonText(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a === b) return true;
  if ((a[0] !== "{" && a[0] !== "[") || (b[0] !== "{" && b[0] !== "[")) return false;
  try {
    return sameJson(JSON.parse(a), JSON.parse(b));
  } catch {
    return false;
  }
}

/** Qué ha cambiado en el servidor: limita la fusión a eso (todo, si se recarga). */
export interface Touched {
  scenes: Set<string> | "all";
  hotspots: Set<string> | "all";
  settings: boolean;
  order: boolean;
}

export const TOUCHED_ALL: Touched = { scenes: "all", hotspots: "all", settings: true, order: true };

const touches = (set: Set<string> | "all", id: string): boolean => set === "all" || set.has(id);

function mergeEntities<T extends { id: string }>(base: T[], local: T[], remote: T[], touched: Set<string> | "all"): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const lr of local) {
    if (!touches(touched, lr.id)) {
      out.push(lr);
      continue;
    }
    const br = b.get(lr.id);
    const rr = r.get(lr.id);
    if (rr == null) {
      // Estaba guardado y ya no está: alguien lo borró. Si no estaba, es nuevo
      // de aquí y aún no se ha guardado.
      if (br == null) out.push(lr);
      continue;
    }
    out.push(br == null ? lr : mergeRow(br, lr, rr));
  }
  for (const rr of remote) {
    if (l.has(rr.id) || !touches(touched, rr.id)) continue;
    // Lo había y aquí se borró: el borrado está pendiente de guardarse
    if (b.has(rr.id)) continue;
    out.push(rr);
  }
  return out;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Orden de escenas: si aquí no se reordenó, manda el del servidor. */
function mergeOrder(base: SceneRow[], local: SceneRow[], remote: SceneRow[], merged: SceneRow[]): SceneRow[] {
  const byId = new Map(merged.map((s) => [s.id, s]));
  const baseIds = base.map((s) => s.id);
  const localIds = local.map((s) => s.id);
  const inBoth = new Set(baseIds.filter((id) => localIds.includes(id)));
  const localReordered = !sameList(
    localIds.filter((id) => inBoth.has(id)),
    baseIds.filter((id) => inBoth.has(id)),
  );
  const order: string[] = [];
  const seen = new Set<string>();
  const push = (id: string): void => {
    if (seen.has(id) || !byId.has(id)) return;
    seen.add(id);
    order.push(id);
  };
  if (localReordered) {
    for (const id of localIds) push(id);
    for (const s of remote) push(s.id);
  } else {
    const remoteIds = remote.map((s) => s.id);
    for (const id of remoteIds) push(id);
    // Lo nuevo de aquí va detrás de quien lo precedía en pantalla
    const remoteSet = new Set(remoteIds);
    for (let i = 0; i < localIds.length; i++) {
      const id = localIds[i]!;
      if (remoteSet.has(id) || seen.has(id) || !byId.has(id)) continue;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = order.indexOf(localIds[j]!);
        if (k >= 0) {
          at = k + 1;
          break;
        }
      }
      order.splice(at, 0, id);
      seen.add(id);
    }
  }
  for (const s of merged) push(s.id);
  return order.map((id) => byId.get(id)!);
}

/**
 * Fusiona `local` con lo que cambió entre `base` y `remote`. Con `touched`
 * solo mira esas entidades: todo lo demás queda como está en pantalla (si el
 * servidor no lo cambió, la fusión daría lo local de todos modos).
 */
export function mergeSnapshots(base: EditorSnapshot, local: EditorSnapshot, remote: EditorSnapshot, touched: Touched = TOUCHED_ALL): EditorSnapshot {
  const sceneTouched = touched.scenes;
  let scenes =
    sceneTouched === "all" || sceneTouched.size > 0 ? mergeEntities(base.scenes, local.scenes, remote.scenes, sceneTouched) : local.scenes;
  if (touched.order || sceneTouched === "all" || sceneTouched.size > 0) scenes = mergeOrder(base.scenes, local.scenes, remote.scenes, scenes);
  const hsTouched = touched.hotspots;
  let hotspots: HotspotRow[] =
    hsTouched === "all" || hsTouched.size > 0 ? mergeEntities(base.hotspots, local.hotspots, remote.hotspots, hsTouched) : local.hotspots;
  // Un punto no vive sin su escena (borrarla los borra en cascada)
  const sceneIds = new Set(scenes.map((s) => s.id));
  if (hotspots.some((h) => !sceneIds.has(h.sceneId))) hotspots = hotspots.filter((h) => sceneIds.has(h.sceneId));
  const settings = touched.settings ? (merge3(base.settings, local.settings, remote.settings) as Record<string, unknown>) ?? {} : local.settings;
  return { scenes, hotspots, settings };
}

/** ¿Dicen lo mismo dos tours? (para saber si queda algo por guardar). */
export function sameSnapshot(a: EditorSnapshot, b: EditorSnapshot): boolean {
  if (a.scenes.length !== b.scenes.length || a.hotspots.length !== b.hotspots.length) return false;
  for (let i = 0; i < a.scenes.length; i++) {
    if (a.scenes[i]!.id !== b.scenes[i]!.id || !sameRow(a.scenes[i]!, b.scenes[i]!)) return false;
  }
  const bh = new Map(b.hotspots.map((h) => [h.id, h]));
  for (const h of a.hotspots) {
    const o = bh.get(h.id);
    if (o == null || !sameRow(h, o)) return false;
  }
  return sameJson(a.settings, b.settings);
}

function sameRow(a: object, b: object): boolean {
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const key of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (key === "sort") continue;
    const x = ra[key];
    const y = rb[key];
    if (x !== y && !sameJsonText(x, y) && !(x == null && y == null)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Avisos de la sala aplicados sobre la base
// ---------------------------------------------------------------------------

/** Aviso «changed» de la sala, tal como lo manda la API. */
export interface ChangeEvent {
  kind: string;
  op?: "upsert" | "delete";
  id?: string;
  sceneId?: string;
  row?: Record<string, unknown>;
  order?: string[];
  settings?: Record<string, unknown>;
  version?: number;
  title?: string;
  origin?: string | null;
  by?: string | null;
  byUserId?: string | null;
}

/** Versión conocida de cada elemento: `scene:id`, `hotspot:id` y `settings`. */
export type VersionBook = Map<string, number>;

const SCENE_FIELDS: (keyof SceneRow)[] = [
  "id", "projectId", "sort", "title", "type", "mediaId", "sourceJson", "initialViewJson", "limitsJson", "audioJson", "mapJson", "metaJson",
];
const HOTSPOT_FIELDS: (keyof HotspotRow)[] = ["id", "sceneId", "type", "positionJson", "styleJson", "contentJson", "conditionsJson", "sort"];

function pick<T>(row: Record<string, unknown>, fields: (keyof T)[]): T {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f as string] = row[f as string] ?? null;
  return out as T;
}

/** Fila de escena del servidor sin lo que el editor no guarda (la versión va aparte). */
export function sceneFromServer(row: Record<string, unknown>): SceneRow {
  const s = pick<SceneRow>(row, SCENE_FIELDS);
  if (s.metaJson == null) s.metaJson = "{}";
  return s;
}

export function hotspotFromServer(row: Record<string, unknown>): HotspotRow {
  const h = pick<HotspotRow>(row, HOTSPOT_FIELDS);
  if (h.positionJson == null) h.positionJson = "{}";
  if (h.contentJson == null) h.contentJson = "{}";
  return h;
}

/** Contenido de `GET /scenes` + ajustes, con las versiones separadas. */
export function snapshotFromServer(
  content: { scenes: Record<string, unknown>[]; hotspots: Record<string, unknown>[] },
  settings: Record<string, unknown>,
  settingsVersion: number | undefined,
): { snapshot: EditorSnapshot; versions: VersionBook } {
  const versions: VersionBook = new Map();
  for (const s of content.scenes) if (typeof s.version === "number") versions.set(`scene:${String(s.id)}`, s.version);
  for (const h of content.hotspots) if (typeof h.version === "number") versions.set(`hotspot:${String(h.id)}`, h.version);
  if (typeof settingsVersion === "number") versions.set("settings", settingsVersion);
  return {
    snapshot: { scenes: content.scenes.map(sceneFromServer), hotspots: content.hotspots.map(hotspotFromServer), settings: settings ?? {} },
    versions,
  };
}

/**
 * Aplica avisos a la base: devuelve la base nueva (lo que el servidor tiene
 * ahora) y qué tocaron, para fusionar solo eso. Los avisos ya vistos (versión
 * igual o anterior a la conocida) no hacen nada.
 */
export function applyEvents(base: EditorSnapshot, events: ChangeEvent[], versions: VersionBook): { base: EditorSnapshot; touched: Touched; changed: boolean } {
  const scenes = [...base.scenes];
  let hotspots = [...base.hotspots];
  let settings = base.settings;
  const touched: Touched = { scenes: new Set(), hotspots: new Set(), settings: false, order: false };
  const ts = touched.scenes as Set<string>;
  const th = touched.hotspots as Set<string>;
  let changed = false;
  const newer = (key: string, version: unknown): boolean => {
    if (typeof version !== "number") return true;
    const known = versions.get(key);
    if (known != null && known >= version) return false;
    versions.set(key, version);
    return true;
  };
  for (const ev of events) {
    if (ev.kind === "scene" && ev.op === "upsert" && ev.row != null) {
      const id = String(ev.row.id);
      if (!newer(`scene:${id}`, ev.row.version)) continue;
      const row = sceneFromServer(ev.row);
      const i = scenes.findIndex((s) => s.id === id);
      if (i >= 0) scenes[i] = row;
      else scenes.push(row);
      ts.add(id);
      changed = true;
    } else if (ev.kind === "scene" && ev.op === "delete" && ev.id != null) {
      const id = ev.id;
      const i = scenes.findIndex((s) => s.id === id);
      if (i >= 0) scenes.splice(i, 1);
      versions.delete(`scene:${id}`);
      ts.add(id);
      for (const h of hotspots) if (h.sceneId === id) th.add(h.id);
      hotspots = hotspots.filter((h) => h.sceneId !== id);
      changed = true;
    } else if (ev.kind === "hotspot" && ev.op === "upsert" && ev.row != null) {
      const id = String(ev.row.id);
      if (!newer(`hotspot:${id}`, ev.row.version)) continue;
      const row = hotspotFromServer(ev.row);
      const i = hotspots.findIndex((h) => h.id === id);
      if (i >= 0) hotspots[i] = row;
      else hotspots.push(row);
      th.add(id);
      changed = true;
    } else if (ev.kind === "hotspot" && ev.op === "delete" && ev.id != null) {
      const id = ev.id;
      hotspots = hotspots.filter((h) => h.id !== id);
      versions.delete(`hotspot:${id}`);
      th.add(id);
      changed = true;
    } else if (ev.kind === "order" && Array.isArray(ev.order)) {
      const pos = new Map(ev.order.map((id, i) => [id, i]));
      scenes.sort((a, b) => (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      touched.order = true;
      changed = true;
    } else if (ev.kind === "settings" && ev.settings != null) {
      if (!newer("settings", ev.version)) continue;
      settings = ev.settings;
      touched.settings = true;
      changed = true;
    }
  }
  return { base: { scenes, hotspots, settings }, touched, changed };
}
