import type { EditorSnapshot, SceneRow } from "../stores";
import { clientId, readJson } from "./editorApi";

/**
 * Áreas: una sola cosa para la planta, la zona y la categoría.
 *
 * Antes había tres conceptos separados que respondían a la misma pregunta —«¿de
 * qué parte del edificio es esta sala?»—: el plano de planta (`floorplans` en
 * los ajustes), la categoría del menú de escenas (una cadena suelta en el meta
 * de cada escena) y la posición del nodo en el grafo (píxeles arbitrarios). Se
 * colocaba lo mismo dos veces y nada se hablaba entre sí.
 *
 * Ahora un **área** es un grupo de escenas con nombre y color. Puede tener un
 * **plano** (entonces es una planta o un sector con imagen y aparece en el
 * minimapa del visitante) y puede tener un **nivel** (entonces ordena el
 * selector de plantas). Sin plano es simplemente un marco del grafo, que es lo
 * que necesita quien no tiene planos.
 *
 * La pertenencia vive en `meta.area` de la escena, y el título del área se
 * replica en `meta.category` para que el menú de escenas del visor siga
 * agrupando exactamente igual sin tocar el visor.
 */

export interface AreaPlan {
  /** Referencia «media:{id}» o URL de la imagen del plano. */
  url: string;
  /** Opacidad del calco bajo el grafo (0..1). */
  opacity?: number;
  /**
   * Calibración: metros que mide el ancho completo del plano. Se obtiene
   * midiendo un tramo conocido, y con ella el editor sabe distancias reales.
   */
  widthMeters?: number;
}

export interface Area {
  id: string;
  title: string;
  /** Color del marco en el grafo. */
  color?: string;
  /** Planta: ordena el selector de nivel del visitante (-1, 0, 1...). */
  level?: number;
  /** Área contenedora, para «Planta 0 › Ala oeste». Un solo nivel. */
  parent?: string;
  plan?: AreaPlan;
  collapsed?: boolean;
}

/** Colores del marco, legibles en claro y en oscuro. */
export const AREA_COLORS = ["#7c3aed", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#db2777", "#4f46e5", "#0d9488"] as const;

export function readAreas(settings: Record<string, unknown>): Area[] {
  const list = settings.areas;
  if (!Array.isArray(list)) return [];
  return list
    .filter((a): a is Record<string, unknown> => a != null && typeof a === "object" && typeof a.id === "string")
    .map((a) => ({
      id: a.id as string,
      title: typeof a.title === "string" ? a.title : "",
      color: typeof a.color === "string" ? a.color : undefined,
      level: typeof a.level === "number" && Number.isFinite(a.level) ? a.level : undefined,
      parent: typeof a.parent === "string" && a.parent !== "" ? a.parent : undefined,
      plan: readPlan(a.plan),
      collapsed: a.collapsed === true ? true : undefined,
    }));
}

function readPlan(value: unknown): AreaPlan | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const p = value as Record<string, unknown>;
  if (typeof p.url !== "string" || p.url === "") return undefined;
  return {
    url: p.url,
    opacity: typeof p.opacity === "number" && Number.isFinite(p.opacity) ? p.opacity : undefined,
    widthMeters: typeof p.widthMeters === "number" && Number.isFinite(p.widthMeters) && p.widthMeters > 0 ? p.widthMeters : undefined,
  };
}

function writeAreas(settings: Record<string, unknown>, areas: Area[]): void {
  if (areas.length === 0) delete settings.areas;
  else settings.areas = areas.map(cleanArea);
}

/** Quita los campos vacíos: los ajustes viajan enteros en cada guardado. */
function cleanArea(area: Area): Record<string, unknown> {
  const out: Record<string, unknown> = { id: area.id, title: area.title };
  if (area.color != null) out.color = area.color;
  if (area.level != null && Number.isFinite(area.level)) out.level = area.level;
  if (area.parent != null && area.parent !== "") out.parent = area.parent;
  if (area.collapsed === true) out.collapsed = true;
  if (area.plan != null) {
    const plan: Record<string, unknown> = { url: area.plan.url };
    if (area.plan.opacity != null) plan.opacity = area.plan.opacity;
    if (area.plan.widthMeters != null) plan.widthMeters = area.plan.widthMeters;
    out.plan = plan;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Migración de lo antiguo
// ---------------------------------------------------------------------------

/**
 * Identificador estable del área que sale de una categoría antigua.
 *
 * Es determinista a propósito: quien no puede editar el tour no dispara la
 * conversión, y aun así tiene que ver las mismas áreas que verá el que sí. Con
 * un identificador al azar, cada uno vería un grafo distinto.
 */
export function legacyAreaId(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `cat-${slug === "" ? "sin-nombre" : slug}`;
}

/**
 * Áreas del tour tal como hay que enseñarlas: las guardadas o, si el tour
 * todavía no se ha convertido, las que se deducen de sus planos y categorías.
 */
export function areasOf(snapshot: EditorSnapshot): Area[] {
  const stored = readAreas(snapshot.settings);
  if (stored.length > 0 || snapshot.settings.areas != null) return stored;
  const out: Area[] = [];
  const legacy = Array.isArray(snapshot.settings.floorplans) ? (snapshot.settings.floorplans as Record<string, unknown>[]) : [];
  for (const fp of legacy) {
    if (typeof fp?.id !== "string") continue;
    out.push({
      id: fp.id,
      title: typeof fp.title === "string" && fp.title !== "" ? fp.title : fp.id,
      color: AREA_COLORS[out.length % AREA_COLORS.length],
      level: typeof fp.level === "number" && Number.isFinite(fp.level) ? fp.level : undefined,
      plan: typeof fp.url === "string" && fp.url !== "" ? { url: fp.url } : undefined,
    });
  }
  const seen = new Set(out.map((a) => a.title.trim().toLowerCase()));
  for (const scene of snapshot.scenes) {
    const meta = readJson<Record<string, unknown>>(scene.metaJson, {});
    const category = typeof meta.category === "string" ? meta.category.trim() : "";
    if (category === "" || seen.has(category.toLowerCase())) continue;
    seen.add(category.toLowerCase());
    out.push({ id: legacyAreaId(category), title: category, color: AREA_COLORS[out.length % AREA_COLORS.length] });
  }
  return out;
}

/** ¿Hay planos o categorías del modelo viejo todavía sin convertir? */
export function needsAreaMigration(snapshot: EditorSnapshot): boolean {
  if (Array.isArray(snapshot.settings.floorplans) && (snapshot.settings.floorplans as unknown[]).length > 0) return true;
  return snapshot.scenes.some((s) => {
    const meta = readJson<Record<string, unknown>>(s.metaJson, {});
    return meta.area == null && typeof meta.category === "string" && meta.category.trim() !== "";
  });
}

/**
 * Convierte planos y categorías sueltas en áreas. Se ejecuta una sola vez, al
 * abrir el grafo, y conserva los identificadores de los planos para que las
 * escenas ya colocadas (`map.floorplan`) sigan apuntando a su sitio.
 */
export function migrateAreas(draft: EditorSnapshot): void {
  const areas = readAreas(draft.settings);
  const byTitle = new Map(areas.map((a) => [a.title.trim().toLowerCase(), a]));

  const legacy = Array.isArray(draft.settings.floorplans) ? (draft.settings.floorplans as Record<string, unknown>[]) : [];
  for (const fp of legacy) {
    if (typeof fp?.id !== "string") continue;
    if (areas.some((a) => a.id === fp.id)) continue;
    const title = typeof fp.title === "string" && fp.title !== "" ? fp.title : fp.id;
    const area: Area = {
      id: fp.id,
      title,
      color: AREA_COLORS[areas.length % AREA_COLORS.length],
      level: typeof fp.level === "number" && Number.isFinite(fp.level) ? fp.level : undefined,
      plan: typeof fp.url === "string" && fp.url !== "" ? { url: fp.url } : undefined,
    };
    areas.push(area);
    byTitle.set(title.trim().toLowerCase(), area);
  }
  delete draft.settings.floorplans;

  for (const scene of draft.scenes) {
    const meta = readJson<Record<string, unknown>>(scene.metaJson, {});
    if (meta.area != null) continue;
    // Una escena ya colocada en un plano pertenece a ese plano
    const placement = readJson<{ floorplan?: string }>(scene.mapJson, {});
    const placed = placement.floorplan != null ? areas.find((a) => a.id === placement.floorplan) : undefined;
    const category = typeof meta.category === "string" ? meta.category.trim() : "";
    let area = placed;
    if (area == null && category !== "") {
      area = byTitle.get(category.toLowerCase());
      if (area == null) {
        // Mismo identificador que deduce `areasOf`, para que lo que veía quien
        // no puede editar siga siendo lo mismo después de convertirlo
        area = { id: legacyAreaId(category), title: category, color: AREA_COLORS[areas.length % AREA_COLORS.length] };
        areas.push(area);
        byTitle.set(category.toLowerCase(), area);
      }
    }
    if (area == null) continue;
    meta.area = area.id;
    meta.category = area.title;
    scene.metaJson = JSON.stringify(meta);
  }

  writeAreas(draft.settings, areas);
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

/**
 * Área a la que pertenece la escena, o null. Si el tour aún no se ha
 * convertido, la categoría antigua vale como área.
 */
export function areaOfScene(scene: SceneRow): string | null {
  const meta = readJson<Record<string, unknown>>(scene.metaJson, {});
  if (typeof meta.area === "string" && meta.area !== "") return meta.area;
  const placement = readJson<{ floorplan?: string }>(scene.mapJson, {});
  if (typeof placement.floorplan === "string" && placement.floorplan !== "") return placement.floorplan;
  if (typeof meta.category === "string" && meta.category.trim() !== "") return legacyAreaId(meta.category.trim());
  return null;
}

export function scenesInArea(snapshot: EditorSnapshot, areaId: string): SceneRow[] {
  return snapshot.scenes.filter((s) => areaOfScene(s) === areaId);
}

/** Colocación de la escena sobre el plano de su área. */
export interface Placement {
  area: string;
  x: number;
  y: number;
  north?: number;
}

export function placementOf(scene: SceneRow): Placement | null {
  const map = readJson<{ floorplan?: string; x?: number; y?: number; north?: number }>(scene.mapJson, {});
  if (map.floorplan == null || map.floorplan === "" || typeof map.x !== "number" || typeof map.y !== "number") return null;
  return { area: map.floorplan, x: map.x, y: map.y, north: typeof map.north === "number" ? map.north : undefined };
}

/** Áreas con plano, ordenadas por nivel descendente (como el visor). */
export function areasWithPlan(settings: Record<string, unknown>): Area[] {
  return readAreas(settings)
    .filter((a) => a.plan != null)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
}

/** Árbol de áreas: las de primer nivel con sus hijas. */
export function areaTree(areas: Area[]): { area: Area; children: Area[] }[] {
  const roots = areas.filter((a) => a.parent == null || !areas.some((p) => p.id === a.parent));
  return roots.map((area) => ({ area, children: areas.filter((c) => c.parent === area.id) }));
}

/** Nombre libre que no choque con los existentes. */
export function nextAreaTitle(areas: Area[], base: string): string {
  const taken = new Set(areas.map((a) => a.title.trim().toLowerCase()));
  if (!taken.has(base.trim().toLowerCase())) return base;
  for (let i = 2; i < 200; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Edición
// ---------------------------------------------------------------------------

export function createArea(draft: EditorSnapshot, title: string, opts: { color?: string; level?: number; parent?: string } = {}): string {
  const areas = readAreas(draft.settings);
  const id = clientId().slice(0, 10);
  areas.push({
    id,
    title: nextAreaTitle(areas, title.trim() === "" ? "Área" : title.trim()),
    color: opts.color ?? AREA_COLORS[areas.length % AREA_COLORS.length],
    level: opts.level,
    // Un solo nivel de anidamiento: una zona dentro de una planta, y ahí acaba
    parent: opts.parent != null && areas.find((a) => a.id === opts.parent)?.parent == null ? opts.parent : undefined,
  });
  writeAreas(draft.settings, areas);
  return id;
}

/** Renombrar arrastra la categoría de todas sus escenas: son la misma cosa. */
export function renameArea(draft: EditorSnapshot, areaId: string, title: string): void {
  const areas = readAreas(draft.settings);
  const area = areas.find((a) => a.id === areaId);
  if (area == null) return;
  area.title = title;
  writeAreas(draft.settings, areas);
  syncCategories(draft);
}

export function patchArea(draft: EditorSnapshot, areaId: string, patch: Partial<Omit<Area, "id">>): void {
  const areas = readAreas(draft.settings);
  const area = areas.find((a) => a.id === areaId);
  if (area == null) return;
  Object.assign(area, patch);
  if (patch.title != null) {
    writeAreas(draft.settings, areas);
    syncCategories(draft);
    return;
  }
  writeAreas(draft.settings, areas);
}

export function setAreaPlan(draft: EditorSnapshot, areaId: string, plan: AreaPlan | null): void {
  const areas = readAreas(draft.settings);
  const area = areas.find((a) => a.id === areaId);
  if (area == null) return;
  area.plan = plan ?? undefined;
  writeAreas(draft.settings, areas);
  if (plan == null) {
    // Sin plano no hay dónde estar colocado
    for (const scene of draft.scenes) {
      if (placementOf(scene)?.area === areaId) clearPlacement(draft, scene.id);
    }
  }
}

/**
 * Borra el área. Las escenas no se borran: se quedan sin área, y si estaban
 * colocadas sobre su plano pierden la colocación, que ya no significa nada.
 */
export function deleteArea(draft: EditorSnapshot, areaId: string): void {
  const areas = readAreas(draft.settings).filter((a) => a.id !== areaId);
  for (const a of areas) if (a.parent === areaId) a.parent = undefined;
  writeAreas(draft.settings, areas);
  for (const scene of draft.scenes) {
    if (areaOfScene(scene) === areaId) assignScene(draft, scene.id, null);
    if (placementOf(scene)?.area === areaId) clearPlacement(draft, scene.id);
  }
}

/** Mete la escena en un área (o la saca). Sincroniza la categoría del visor. */
export function assignScene(draft: EditorSnapshot, sceneId: string, areaId: string | null): void {
  const scene = draft.scenes.find((s) => s.id === sceneId);
  if (scene == null) return;
  const areas = readAreas(draft.settings);
  const area = areaId != null ? areas.find((a) => a.id === areaId) : null;
  const meta = readJson<Record<string, unknown>>(scene.metaJson, {});
  if (area == null) {
    delete meta.area;
    delete meta.category;
  } else {
    meta.area = area.id;
    meta.category = area.title;
  }
  scene.metaJson = JSON.stringify(meta);
  // Cambiar de área invalida una colocación en el plano de la anterior
  const placement = placementOf(scene);
  if (placement != null && placement.area !== area?.id) clearPlacement(draft, sceneId);
}

/** Coloca la escena sobre el plano de un área; eso la mete también en ella. */
export function placeScene(draft: EditorSnapshot, sceneId: string, areaId: string, x: number, y: number): void {
  const scene = draft.scenes.find((s) => s.id === sceneId);
  if (scene == null) return;
  if (readAreas(draft.settings).find((a) => a.id === areaId) == null) return;
  if (areaOfScene(scene) !== areaId) assignScene(draft, sceneId, areaId);
  const map = readJson<Record<string, unknown>>(scene.mapJson, {});
  map.floorplan = areaId;
  map.x = clamp01(Math.round(x * 10000) / 10000);
  map.y = clamp01(Math.round(y * 10000) / 10000);
  scene.mapJson = JSON.stringify(map);
}

export function clearPlacement(draft: EditorSnapshot, sceneId: string): void {
  const scene = draft.scenes.find((s) => s.id === sceneId);
  if (scene == null) return;
  const map = readJson<Record<string, unknown>>(scene.mapJson, {});
  delete map.floorplan;
  delete map.x;
  delete map.y;
  scene.mapJson = Object.keys(map).length > 0 ? JSON.stringify(map) : null;
}

/** Rumbo del norte del panorama respecto al plano, en radianes. */
export function setNorth(draft: EditorSnapshot, sceneId: string, north: number): void {
  const scene = draft.scenes.find((s) => s.id === sceneId);
  if (scene == null) return;
  const map = readJson<Record<string, unknown>>(scene.mapJson, {});
  map.north = Math.round(normalizeAngle(north) * 10000) / 10000;
  scene.mapJson = JSON.stringify(map);
}

/** Coordenadas geográficas de la escena (modo mapa). */
export function setGeo(draft: EditorSnapshot, sceneId: string, lat: number, lng: number): void {
  const scene = draft.scenes.find((s) => s.id === sceneId);
  if (scene == null) return;
  const map = readJson<Record<string, unknown>>(scene.mapJson, {});
  map.lat = Math.round(lat * 1e6) / 1e6;
  map.lng = Math.round(lng * 1e6) / 1e6;
  scene.mapJson = JSON.stringify(map);
}

export function geoOf(scene: SceneRow): { lat: number; lng: number } | null {
  const map = readJson<{ lat?: number; lng?: number }>(scene.mapJson, {});
  if (typeof map.lat !== "number" || typeof map.lng !== "number") return null;
  return { lat: map.lat, lng: map.lng };
}

/**
 * Distancia real entre dos escenas colocadas sobre el mismo plano calibrado.
 * Sin calibración no hay metros que dar: devuelve null en vez de inventárselos.
 */
export function distanceMeters(a: SceneRow, b: SceneRow, areas: Area[]): number | null {
  const pa = placementOf(a);
  const pb = placementOf(b);
  if (pa == null || pb == null || pa.area !== pb.area) return null;
  const width = areas.find((x) => x.id === pa.area)?.plan?.widthMeters;
  if (width == null) return null;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) * width;
}

/** Vuelve a copiar el título del área en la categoría de cada escena. */
function syncCategories(draft: EditorSnapshot): void {
  const areas = readAreas(draft.settings);
  for (const scene of draft.scenes) {
    const meta = readJson<Record<string, unknown>>(scene.metaJson, {});
    if (typeof meta.area !== "string") continue;
    const area = areas.find((a) => a.id === meta.area);
    const next = area?.title ?? undefined;
    if (meta.category === next) continue;
    if (next == null) delete meta.category;
    else meta.category = next;
    scene.metaJson = JSON.stringify(meta);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function normalizeAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}
