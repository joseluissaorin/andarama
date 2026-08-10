import type { EditorSnapshot } from "../stores";
import { readJson } from "./editorApi";

/**
 * Llegadas a una escena.
 *
 * La orientación con la que se entra en una sala **no es de la sala**: es de
 * cada camino que lleva hasta ella. Entrar en el salón desde el pasillo y
 * entrar desde la cocina son dos llegadas distintas y merecen dos vistas
 * distintas.
 *
 * El dato ya vivía en su sitio —cada paso guarda su `entry`—, pero solo se
 * podía tocar desde la escena de origen, que es justo donde no se puede juzgar
 * el resultado: se elegía un ángulo del panorama equivocado. Aquí se reúnen
 * todas las maneras de llegar a una escena para poder decidirlas **estando en
 * ella**.
 */

export type EntryMode = "forward" | "fixed" | "lookBack" | "relative";

export const ENTRY_MODES: EntryMode[] = ["forward", "fixed", "lookBack", "relative"];

export interface ArrivalView {
  yaw: number;
  pitch: number;
  fov?: number;
}

export interface Arrival {
  /** «start» o el id del hotspot que produce el paso. */
  id: string;
  kind: "start" | "step";
  /** La fila «start» de la escena inicial es además el arranque del tour. */
  isStart?: boolean;
  /** Escena de la que se viene; null al empezar el tour. */
  fromSceneId: string | null;
  fromTitle: string;
  mode: EntryMode;
  /** Vista guardada, cuando la hay (modo fijo o arranque del tour). */
  view: ArrivalView | null;
}

const DEFAULT_VIEW: ArrivalView = { yaw: 0, pitch: 0, fov: 1.2 };

/** Todas las maneras de llegar a una escena, empezando por el arranque. */
export function arrivalsOf(snapshot: EditorSnapshot, sceneId: string): Arrival[] {
  const out: Arrival[] = [];
  // La vista por defecto de la escena va siempre la primera: es la que se usa
  // al arrancar el tour y la que queda cuando una llegada no puede calcularse.
  const startScene = (snapshot.settings.startScene as string) ?? snapshot.scenes[0]?.id;
  const scene = snapshot.scenes.find((s) => s.id === sceneId);
  const initial = readJson<Partial<ArrivalView>>(scene?.initialViewJson ?? null, {});
  out.push({
    id: "start",
    kind: "start",
    isStart: startScene === sceneId,
    fromSceneId: null,
    fromTitle: "",
    mode: "fixed",
    view: { yaw: initial.yaw ?? DEFAULT_VIEW.yaw, pitch: initial.pitch ?? DEFAULT_VIEW.pitch, fov: initial.fov ?? DEFAULT_VIEW.fov },
  });
  // Los caminos, en el orden en que están las escenas: leerlos salteados no
  // ayuda a nadie.
  const orden = new Map(snapshot.scenes.map((s, i) => [s.id, i]));
  const pasos = [...snapshot.hotspots].sort((a, b) => (orden.get(a.sceneId) ?? 0) - (orden.get(b.sceneId) ?? 0));
  for (const h of pasos) {
    if (h.type !== "navigation") continue;
    const content = readJson<{ target?: string; entry?: { mode?: string; yaw?: number; pitch?: number; fov?: number } }>(h.contentJson, {});
    if (content.target !== sceneId) continue;
    const mode = (ENTRY_MODES as string[]).includes(content.entry?.mode ?? "") ? (content.entry!.mode as EntryMode) : "forward";
    out.push({
      id: h.id,
      kind: "step",
      fromSceneId: h.sceneId,
      fromTitle: snapshot.scenes.find((s) => s.id === h.sceneId)?.title ?? h.sceneId,
      mode,
      view:
        content.entry?.yaw != null
          ? { yaw: content.entry.yaw, pitch: content.entry.pitch ?? 0, fov: content.entry.fov }
          : null,
    });
  }
  return out;
}

/**
 * Vista con la que se entra por esa llegada, tal como la calculará el visor.
 *
 * Se replica aquí para poder **enseñarla** en el editor: elegir a ciegas una
 * orientación de entrada y descubrir el resultado al publicar no es editar.
 */
export function resolveArrivalView(snapshot: EditorSnapshot, sceneId: string, arrival: Arrival): ArrivalView {
  const scene = snapshot.scenes.find((s) => s.id === sceneId);
  const initial = readJson<Partial<ArrivalView>>(scene?.initialViewJson ?? null, {});
  const base: ArrivalView = { yaw: initial.yaw ?? 0, pitch: initial.pitch ?? 0, fov: initial.fov ?? 1.2 };
  if (arrival.kind === "start") return arrival.view ?? base;
  if (arrival.mode === "fixed") return arrival.view ?? base;
  const puerta = doorYaw(snapshot, sceneId, arrival);
  if (puerta == null) return base;
  if (arrival.mode === "lookBack") return { yaw: puerta, pitch: 0, fov: base.fov };
  if (arrival.mode === "forward") return { yaw: normalize(puerta + Math.PI), pitch: 0, fov: base.fov };
  // «Seguir mirando igual» depende del visitante: lo mejor que se puede
  // enseñar es la vista inicial de la escena.
  return base;
}

/**
 * Rumbo, visto desde el destino, de la puerta por la que se ha entrado: el
 * marcador de vuelta. Si no existe, el opuesto al marcador de ida.
 */
function doorYaw(snapshot: EditorSnapshot, sceneId: string, arrival: Arrival): number | null {
  const back = snapshot.hotspots.find(
    (h) => h.sceneId === sceneId && h.type === "navigation" && readJson<{ target?: string }>(h.contentJson, {}).target === arrival.fromSceneId,
  );
  if (back != null) return readJson<{ yaw?: number }>(back.positionJson, {}).yaw ?? 0;
  const forth = snapshot.hotspots.find((h) => h.id === arrival.id);
  if (forth != null) return normalize((readJson<{ yaw?: number }>(forth.positionJson, {}).yaw ?? 0) + Math.PI);
  return null;
}

/** ¿Se puede calcular la vista de esta llegada, o falta el paso de vuelta? */
export function arrivalNeedsReturn(snapshot: EditorSnapshot, sceneId: string, arrival: Arrival): boolean {
  if (arrival.kind === "start" || arrival.mode === "fixed" || arrival.mode === "relative") return false;
  return !snapshot.hotspots.some(
    (h) => h.sceneId === sceneId && h.type === "navigation" && readJson<{ target?: string }>(h.contentJson, {}).target === arrival.fromSceneId,
  );
}

/** Cambia el modo de una llegada. */
export function setArrivalMode(draft: EditorSnapshot, sceneId: string, arrival: Arrival, mode: EntryMode): void {
  if (arrival.kind === "start") return;
  const hotspot = draft.hotspots.find((h) => h.id === arrival.id);
  if (hotspot == null) return;
  const content = readJson<Record<string, unknown>>(hotspot.contentJson, {});
  const entry = (content.entry ?? {}) as Record<string, unknown>;
  entry.mode = mode;
  if (mode !== "fixed") {
    // Los ángulos guardados solo significan algo en el modo fijo
    delete entry.yaw;
    delete entry.pitch;
  }
  content.entry = entry;
  hotspot.contentJson = JSON.stringify(content);
}

/**
 * Guarda la vista de una llegada. La escribe donde toca según de qué llegada
 * se trate: el arranque del tour va en la vista inicial de la escena.
 */
export function setArrivalView(draft: EditorSnapshot, sceneId: string, arrival: Arrival, view: ArrivalView): void {
  if (arrival.kind === "start") {
    const scene = draft.scenes.find((s) => s.id === sceneId);
    if (scene == null) return;
    scene.initialViewJson = JSON.stringify(round(view));
    return;
  }
  const hotspot = draft.hotspots.find((h) => h.id === arrival.id);
  if (hotspot == null) return;
  const content = readJson<Record<string, unknown>>(hotspot.contentJson, {});
  content.entry = { ...round(view), mode: "fixed" };
  hotspot.contentJson = JSON.stringify(content);
}

function round(view: ArrivalView): ArrivalView {
  const r = (n: number): number => Math.round(n * 10000) / 10000;
  return { yaw: r(normalize(view.yaw)), pitch: r(view.pitch), ...(view.fov != null ? { fov: r(view.fov) } : {}) };
}

function normalize(yaw: number): number {
  let y = yaw;
  while (y > Math.PI) y -= 2 * Math.PI;
  while (y < -Math.PI) y += 2 * Math.PI;
  return y;
}
