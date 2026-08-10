import type { EditorSnapshot, HotspotRow, SceneRow } from "../stores";
import { clientId, readJson } from "./editorApi";

/**
 * El grafo y el panorama son dos vistas del mismo dato: una arista **es** un
 * hotspot de navegación. Aquí vive esa equivalencia, aparte de la vista, para
 * poder probarla sin navegador.
 *
 * Antes existía una tabla de conexiones paralela: se dibujaba en el grafo, no
 * generaba ningún marcador y su orientación de entrada no la leía nadie. Se
 * eliminó; lo que queda es esto.
 */

export interface GraphEdge {
  /** Identificador del hotspot que produce la arista. */
  id: string;
  from: string;
  to: string;
  label: string;
  /** Colocado a ojo por el editor y aún sin ubicar en el panorama. */
  unplaced: boolean;
  entryMode: string;
  /** Paso de sentido único a propósito: no se avisa de que le falta la vuelta. */
  oneWay: boolean;
}

/** Yaw y pitch de un hotspot recién creado desde el grafo. */
export interface TempPlacement {
  yaw: number;
  pitch: number;
}

/**
 * Posición provisional: delante de la vista inicial de la escena y algo por
 * debajo del horizonte, que es donde cae un paso a otra sala. Si ya hay
 * hotspots de navegación se separa de ellos para que no se solapen.
 */
export function temporaryPlacement(scene: SceneRow | undefined, existing: HotspotRow[]): TempPlacement {
  const initial = readJson<{ yaw?: number }>(scene?.initialViewJson ?? null, {});
  const base = typeof initial.yaw === "number" ? initial.yaw : 0;
  const taken = existing
    .filter((h) => h.type === "navigation")
    .map((h) => readJson<{ yaw?: number }>(h.positionJson, {}).yaw ?? 0);
  const step = Math.PI / 6;
  for (let i = 0; i < 12; i++) {
    // Se abre en abanico a un lado y a otro de la vista inicial
    const yaw = normalizeYaw(base + (i % 2 === 0 ? 1 : -1) * step * Math.ceil(i / 2));
    if (!taken.some((t) => Math.abs(angleDelta(t, yaw)) < step * 0.8)) {
      return { yaw, pitch: -0.17 };
    }
  }
  return { yaw: base, pitch: -0.17 };
}

export function normalizeYaw(yaw: number): number {
  let y = yaw;
  while (y > Math.PI) y -= 2 * Math.PI;
  while (y < -Math.PI) y += 2 * Math.PI;
  return y;
}

export function angleDelta(a: number, b: number): number {
  return normalizeYaw(a - b);
}

/** Aristas del grafo: exactamente los hotspots de navegación con destino. */
export function graphEdges(snapshot: EditorSnapshot): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const h of snapshot.hotspots) {
    if (h.type !== "navigation") continue;
    const content = readJson<{ target?: string; label?: string; unplaced?: boolean; oneWay?: boolean; entry?: { mode?: string } }>(h.contentJson, {});
    if (content.target == null || content.target === "") continue;
    edges.push({
      id: h.id,
      from: h.sceneId,
      to: content.target,
      label: typeof content.label === "string" ? content.label : "",
      unplaced: content.unplaced === true,
      entryMode: content.entry?.mode ?? "relative",
      oneWay: content.oneWay === true,
    });
  }
  return edges;
}

/**
 * Marca el paso como de sentido único a propósito.
 *
 * El aviso «paso sin vuelta» daba la lata en recorridos que son de ida sola —una
 * salida de emergencia, un tobogán, un mirador al que se baja por otro sitio—.
 * Ahora se puede decir que es adrede y el aviso calla.
 */
export function setOneWay(draft: EditorSnapshot, hotspotId: string, oneWay: boolean): void {
  const hotspot = draft.hotspots.find((h) => h.id === hotspotId);
  if (hotspot == null) return;
  const content = readJson<Record<string, unknown>>(hotspot.contentJson, {});
  if (oneWay) content.oneWay = true;
  else delete content.oneWay;
  hotspot.contentJson = JSON.stringify(content);
}

/**
 * Crea el hotspot de navegación de una arista nueva. Devuelve su id, o null si
 * el paso ya existe: dos marcadores idénticos en la misma escena solo estorban.
 */
export function createNavHotspot(
  draft: EditorSnapshot,
  fromScene: string,
  toScene: string,
  opts: { unplaced?: boolean; entryMode?: string } = {},
): string | null {
  const already = draft.hotspots.some(
    (h) => h.sceneId === fromScene && h.type === "navigation" && readJson<{ target?: string }>(h.contentJson, {}).target === toScene,
  );
  if (already) return null;
  const id = clientId();
  const scene = draft.scenes.find((s) => s.id === fromScene);
  const place = temporaryPlacement(scene, draft.hotspots.filter((h) => h.sceneId === fromScene));
  const targetTitle = draft.scenes.find((s) => s.id === toScene)?.title ?? "";
  draft.hotspots.push({
    id,
    sceneId: fromScene,
    type: "navigation",
    positionJson: JSON.stringify({ yaw: place.yaw, pitch: place.pitch }),
    styleJson: null,
    contentJson: JSON.stringify({
      target: toScene,
      label: targetTitle,
      // «Seguir el camino»: se entra de espaldas a la puerta y se sigue de
      // frente, que es lo natural de un recorrido a pie. Antes era «seguir
      // mirando igual», que depende de hacia dónde mirara el visitante.
      entry: { mode: opts.entryMode ?? "forward" },
      // Marca de «aún sin colocar»: el editor lo resalta hasta que se arrastra
      // sobre el panorama. El compilador la retira al publicar.
      ...(opts.unplaced === false ? {} : { unplaced: true }),
    }),
    conditionsJson: null,
    sort: draft.hotspots.filter((h) => h.sceneId === fromScene).length,
  });
  return id;
}

/** Elimina la arista, es decir, el hotspot que la produce. */
export function deleteEdge(draft: EditorSnapshot, hotspotId: string): void {
  draft.hotspots = draft.hotspots.filter((h) => h.id !== hotspotId);
}

/** Problemas del grafo que conviene enseñar al autor. */
export interface GraphIssue {
  kind: "no-target" | "broken-target" | "no-return" | "unplaced" | "orphan";
  hotspotId?: string;
  sceneId: string;
  label: string;
}

export function graphIssues(snapshot: EditorSnapshot, edges: GraphEdge[], orphans: Set<string>): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const sceneIds = new Set(snapshot.scenes.map((s) => s.id));
  const title = (id: string): string => snapshot.scenes.find((s) => s.id === id)?.title ?? id;

  for (const h of snapshot.hotspots) {
    if (h.type !== "navigation") continue;
    const content = readJson<{ target?: string }>(h.contentJson, {});
    if (content.target == null || content.target === "") {
      issues.push({ kind: "no-target", hotspotId: h.id, sceneId: h.sceneId, label: title(h.sceneId) });
    } else if (!sceneIds.has(content.target)) {
      issues.push({ kind: "broken-target", hotspotId: h.id, sceneId: h.sceneId, label: title(h.sceneId) });
    }
  }
  for (const e of edges) {
    if (e.unplaced) issues.push({ kind: "unplaced", hotspotId: e.id, sceneId: e.from, label: `${title(e.from)} → ${title(e.to)}` });
    // Un paso declarado de sentido único no es un descuido: no se avisa
    if (!e.oneWay && !edges.some((other) => other.from === e.to && other.to === e.from)) {
      issues.push({ kind: "no-return", hotspotId: e.id, sceneId: e.from, label: `${title(e.from)} → ${title(e.to)}` });
    }
  }
  for (const id of orphans) issues.push({ kind: "orphan", sceneId: id, label: title(id) });
  return issues;
}

/** Lo que conviene ver de un nodo sin abrirlo. */
export interface NodeStatus {
  /** Salidas de navegación. */
  exits: number;
  /** Hotspots que no son de navegación. */
  extras: number;
  /** Marcadores del panorama todavía sin colocar. */
  unplaced: number;
  hidden: boolean;
  noMedia: boolean;
  /** Sin texto alternativo, que el validador reclama al publicar. */
  noAlt: boolean;
  audio: boolean;
}

export function nodeStatus(snapshot: EditorSnapshot, scene: SceneRow, edges: GraphEdge[]): NodeStatus {
  const meta = readJson<Record<string, unknown>>(scene.metaJson, {});
  const audio = readJson<Record<string, unknown>>(scene.audioJson, {});
  const own = snapshot.hotspots.filter((h) => h.sceneId === scene.id);
  return {
    exits: edges.filter((e) => e.from === scene.id).length,
    extras: own.filter((h) => h.type !== "navigation").length,
    unplaced: edges.filter((e) => e.from === scene.id && e.unplaced).length,
    hidden: meta.hidden === true,
    noMedia: scene.mediaId == null && (scene.sourceJson == null || scene.sourceJson === ""),
    noAlt: typeof meta.altText !== "string" || meta.altText.trim() === "",
    audio: Object.keys(audio).length > 0,
  };
}

/**
 * Borra la escena y todo lo que colgaba de ella: sus hotspots, los pasos de
 * otras escenas que llevaban aquí, su sitio en los recorridos del autopilot y
 * su posición guardada en el lienzo. Dejar cualquiera de esos rastros produce
 * destinos rotos que luego hay que cazar en los avisos.
 */
export function deleteScene(draft: EditorSnapshot, sceneId: string): void {
  draft.scenes = draft.scenes.filter((s) => s.id !== sceneId);
  draft.hotspots = draft.hotspots.filter((h) => {
    if (h.sceneId === sceneId) return false;
    if (h.type !== "navigation") return true;
    return readJson<{ target?: string }>(h.contentJson, {}).target !== sceneId;
  });
  const layout = draft.settings.graphLayout;
  if (layout != null && typeof layout === "object") delete (layout as Record<string, unknown>)[sceneId];
  const routes = readAutopilot(draft.settings)
    .map((r) => ({ ...r, steps: r.steps.filter((s) => s.scene !== sceneId) }))
    .filter((r) => r.steps.length > 0);
  writeAutopilot(draft.settings, routes);
  if (draft.settings.startScene === sceneId) {
    const next = draft.scenes[0]?.id;
    if (next == null) delete draft.settings.startScene;
    else draft.settings.startScene = next;
  }
}

/**
 * Duplica la escena con sus hotspots. La copia hereda el área, pero no su
 * sitio en el plano: dos marcadores en el mismo punto no dicen nada.
 */
export function duplicateScene(draft: EditorSnapshot, sceneId: string, copySuffix = "copia"): string | null {
  const scene = draft.scenes.find((s) => s.id === sceneId);
  if (scene == null) return null;
  const id = clientId();
  const map = readJson<Record<string, unknown>>(scene.mapJson, {});
  delete map.floorplan;
  delete map.x;
  delete map.y;
  draft.scenes.push({
    ...scene,
    id,
    title: `${scene.title} (${copySuffix})`,
    sort: draft.scenes.length,
    mapJson: Object.keys(map).length > 0 ? JSON.stringify(map) : null,
  });
  for (const h of draft.hotspots.filter((x) => x.sceneId === sceneId)) {
    draft.hotspots.push({ ...h, id: clientId(), sceneId: id });
  }
  return id;
}

/** Recorrido del autopilot guardado en los ajustes del tour. */
export interface AutopilotRouteDraft {
  id: string;
  title: string;
  steps: { scene: string; seconds?: number }[];
  loop?: boolean;
}

export function readAutopilot(settings: Record<string, unknown>): AutopilotRouteDraft[] {
  const routes = settings.autopilot;
  if (!Array.isArray(routes)) return [];
  return routes
    .filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
    .map((r, i) => ({
      id: typeof r.id === "string" ? r.id : `ruta-${i + 1}`,
      title: typeof r.title === "string" ? r.title : `Recorrido ${i + 1}`,
      steps: Array.isArray(r.steps)
        ? (r.steps as Record<string, unknown>[])
            .filter((s) => typeof s?.scene === "string")
            .map((s) => ({ scene: s.scene as string, seconds: typeof s.seconds === "number" ? s.seconds : undefined }))
        : [],
      loop: r.loop === true,
    }));
}

export function writeAutopilot(settings: Record<string, unknown>, routes: AutopilotRouteDraft[]): void {
  if (routes.length === 0 || routes.every((r) => r.steps.length === 0)) delete settings.autopilot;
  else settings.autopilot = routes.filter((r) => r.steps.length > 0);
}

/** Resultado de intentar reconectar una arista. */
export type ReconnectResult = "ok" | "same" | "duplicate" | "missing";

/**
 * Reconecta una arista existente moviendo uno de sus extremos.
 *
 * Sin esto, cambiar a dónde lleva un paso obligaba a borrarlo y rehacerlo, y
 * con él se perdían la etiqueta, el icono, el modo de entrada y la transición.
 *
 * - Mover el **destino** solo cambia a dónde apunta: el marcador sigue donde
 *   estaba, porque el sitio desde el que se sale no ha cambiado.
 * - Mover el **origen** traslada el hotspot a otra escena, y entonces su
 *   posición ya no significa nada —era un punto del otro panorama—, así que se
 *   recoloca y vuelve a marcarse como «sin colocar».
 */
export function reconnectEdge(
  draft: EditorSnapshot,
  hotspotId: string,
  change: { from?: string; to?: string },
): ReconnectResult {
  const hotspot = draft.hotspots.find((h) => h.id === hotspotId);
  if (hotspot == null) return "missing";
  const content = readJson<Record<string, unknown>>(hotspot.contentJson, {});
  const currentFrom = hotspot.sceneId;
  const currentTo = typeof content.target === "string" ? content.target : "";

  const nextFrom = change.from ?? currentFrom;
  const nextTo = change.to ?? currentTo;
  if (nextFrom === nextTo) return "same";
  if (nextFrom === currentFrom && nextTo === currentTo) return "same";
  if (draft.scenes.find((s) => s.id === nextFrom) == null || draft.scenes.find((s) => s.id === nextTo) == null) {
    return "missing";
  }
  // Dos pasos idénticos en la misma escena solo estorban
  const duplicate = draft.hotspots.some(
    (h) =>
      h.id !== hotspotId &&
      h.sceneId === nextFrom &&
      h.type === "navigation" &&
      readJson<{ target?: string }>(h.contentJson, {}).target === nextTo,
  );
  if (duplicate) return "duplicate";

  // La etiqueta seguía al destino: si no se había tocado a mano, sigue.
  const oldTargetTitle = draft.scenes.find((s) => s.id === currentTo)?.title ?? "";
  const newTargetTitle = draft.scenes.find((s) => s.id === nextTo)?.title ?? "";
  if (content.label === oldTargetTitle || content.label === "" || content.label == null) {
    content.label = newTargetTitle;
  }
  content.target = nextTo;

  if (nextFrom !== currentFrom) {
    hotspot.sceneId = nextFrom;
    const place = temporaryPlacement(
      draft.scenes.find((s) => s.id === nextFrom),
      draft.hotspots.filter((h) => h.sceneId === nextFrom && h.id !== hotspotId),
    );
    hotspot.positionJson = JSON.stringify({ yaw: place.yaw, pitch: place.pitch });
    hotspot.sort = draft.hotspots.filter((h) => h.sceneId === nextFrom && h.id !== hotspotId).length;
    content.unplaced = true;
  }
  hotspot.contentJson = JSON.stringify(content);
  return "ok";
}
