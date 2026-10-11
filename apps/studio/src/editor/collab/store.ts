import { create } from "zustand";
import type { CollabStatus } from "./connection";

/** Estado de la sala de edición: quién está, qué tiene abierto y dónde mira. */

export interface PresenceUser {
  connectionId: string;
  userId: string;
  name: string;
  color: string;
  sceneId: string | null;
  tab: string | null;
  focus: { kind: "scene" | "hotspot"; id: string } | null;
}

export interface PresenceLock {
  connectionId: string;
  userId: string;
  name: string;
  color: string;
}

export interface RemoteView {
  sceneId: string;
  yaw: number;
  pitch: number;
  pointer: { yaw: number; pitch: number } | null;
}

export interface CollabState {
  /** "idle": sin sala (sin permiso de edición o sin tiempo real). */
  status: CollabStatus | "idle";
  connectionId: string | null;
  myUserId: string | null;
  users: PresenceUser[];
  locks: Record<string, PresenceLock>;
  views: Record<string, RemoteView>;
}

const EMPTY: CollabState = { status: "idle", connectionId: null, myUserId: null, users: [], locks: {}, views: {} };

export const useCollab = create<CollabState>(() => ({ ...EMPTY }));

export function resetCollab(): void {
  useCollab.setState({ ...EMPTY });
}

// ---------------------------------------------------------------------------
// Envío a la sala (lo registra la conexión activa)
// ---------------------------------------------------------------------------

let sender: ((msg: Record<string, unknown>) => boolean) | null = null;

export function setCollabSender(fn: ((msg: Record<string, unknown>) => boolean) | null): void {
  sender = fn;
}

export function sendCollab(msg: Record<string, unknown>): boolean {
  return sender?.(msg) ?? false;
}

/**
 * Mirada y puntero propios: se mandan como mucho unas ocho veces por segundo
 * y siempre el último (si se para, llega la posición final).
 */
const VIEW_INTERVAL_MS = 120;
let viewState: { sceneId: string; yaw: number; pitch: number; pointer: { yaw: number; pitch: number } | null } | null = null;
let viewTimer: ReturnType<typeof setTimeout> | null = null;
let lastViewSent = 0;
let lastViewKey = "";

function flushView(): void {
  viewTimer = null;
  const key = JSON.stringify(viewState);
  if (key === lastViewKey) return;
  const msg = viewState != null ? { type: "view", ...viewState } : { type: "view", sceneId: null };
  if (sendCollab(msg)) {
    lastViewKey = key;
    lastViewSent = Date.now();
  }
}

function scheduleView(): void {
  if (viewTimer != null) return;
  const wait = Math.max(0, VIEW_INTERVAL_MS - (Date.now() - lastViewSent));
  viewTimer = setTimeout(flushView, wait);
}

/** Centro de la vista propia en una escena (null: no hay panorama a la vista). */
export function reportView(sceneId: string | null, center: { yaw: number; pitch: number } | null): void {
  if (sceneId == null || center == null) {
    viewState = null;
  } else {
    viewState = {
      sceneId,
      yaw: center.yaw,
      pitch: center.pitch,
      pointer: viewState?.sceneId === sceneId ? viewState.pointer : null,
    };
  }
  scheduleView();
}

/** Dónde apunta el ratón dentro del panorama (null: fuera). */
export function reportPointer(sceneId: string, pointer: { yaw: number; pitch: number } | null): void {
  if (viewState == null || viewState.sceneId !== sceneId) return;
  viewState = { ...viewState, pointer };
  scheduleView();
}

/** Tras reconectar, la sala no sabe dónde mirábamos: se vuelve a mandar. */
export function resendView(): void {
  lastViewKey = "";
  scheduleView();
}

// ---------------------------------------------------------------------------
// Bloqueo blando
// ---------------------------------------------------------------------------

/**
 * Quién tiene abierto este panel, si es otra persona. Una misma persona en
 * dos pestañas no se bloquea a sí misma.
 */
export function lockedByOther(state: CollabState, kind: "scene" | "hotspot", id: string | null | undefined): PresenceLock | null {
  if (id == null) return null;
  const lock = state.locks[`${kind}:${id}`];
  if (lock == null || lock.connectionId === state.connectionId) return null;
  if (state.myUserId != null && lock.userId === state.myUserId) return null;
  return lock;
}

export function useLockedByOther(kind: "scene" | "hotspot", id: string | null | undefined): PresenceLock | null {
  return useCollab((s) => lockedByOther(s, kind, id));
}

/** Iniciales para el avatar: «Ana Pérez» → «AP»; «luis» → «L». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p !== "");
  if (parts.length === 0) return "?";
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : "";
  return (Array.from(first)[0]! + (last !== "" ? Array.from(last)[0]! : "")).toLocaleUpperCase();
}
