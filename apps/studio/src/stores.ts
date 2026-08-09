import { create } from "zustand";
import { api } from "./api";

/** Sesion y organizacion activa. */

export interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    roleGlobal: string;
    emailVerified: boolean;
    totpEnabled: boolean;
    ssoLinked: boolean;
  } | null;
  orgs: { id: string; name: string; slug: string; role: string }[];
}

interface AuthState {
  me: Me | null;
  loaded: boolean;
  currentOrgId: string | null;
  refresh: () => Promise<void>;
  setOrg: (orgId: string) => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  me: null,
  loaded: false,
  currentOrgId: localStorage.getItem("ull360:org"),
  refresh: async () => {
    try {
      const me = await api<Me>("/me");
      const current = get().currentOrgId;
      const validOrg = me.orgs.find((o) => o.id === current) ?? me.orgs[0] ?? null;
      set({ me, loaded: true, currentOrgId: validOrg?.id ?? null });
    } catch {
      set({ me: { user: null, orgs: [] }, loaded: true });
    }
  },
  setOrg: (orgId) => {
    localStorage.setItem("ull360:org", orgId);
    set({ currentOrgId: orgId });
  },
  logout: async () => {
    await api("/auth/logout", { method: "POST" });
    set({ me: { user: null, orgs: [] }, currentOrgId: null });
  },
}));

// ---------------------------------------------------------------------------
// Estado del editor con deshacer/rehacer (§3.5)
// ---------------------------------------------------------------------------

export interface SceneRow {
  id: string;
  projectId: string;
  sort: number;
  title: string;
  type: "image" | "video" | "flat";
  mediaId: string | null;
  sourceJson: string | null;
  initialViewJson: string | null;
  limitsJson: string | null;
  audioJson: string | null;
  mapJson: string | null;
  metaJson: string;
}

export interface HotspotRow {
  id: string;
  sceneId: string;
  type: string;
  positionJson: string;
  styleJson: string | null;
  contentJson: string;
  conditionsJson: string | null;
  sort: number;
}

export interface ConnectionRow {
  id: string;
  projectId: string;
  fromScene: string;
  toScene: string;
  entryMode: string;
  entryViewJson: string | null;
  transitionJson: string | null;
}

export interface EditorSnapshot {
  scenes: SceneRow[];
  hotspots: HotspotRow[];
  connections: ConnectionRow[];
  settings: Record<string, unknown>;
}

interface EditorState {
  projectId: string | null;
  snapshot: EditorSnapshot | null;
  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];
  selectedSceneId: string | null;
  selectedHotspotId: string | null;
  dirty: boolean;
  saving: "idle" | "saving" | "saved" | "error";
  load: (projectId: string, snapshot: EditorSnapshot) => void;
  /** Aplica un cambio registrandolo en el historial de deshacer. */
  apply: (mutate: (draft: EditorSnapshot) => void) => void;
  undo: () => void;
  redo: () => void;
  select: (sceneId: string | null, hotspotId?: string | null) => void;
  setSaving: (s: EditorState["saving"]) => void;
  markClean: () => void;
}

const clone = <T>(v: T): T => structuredClone(v);

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  snapshot: null,
  undoStack: [],
  redoStack: [],
  selectedSceneId: null,
  selectedHotspotId: null,
  dirty: false,
  saving: "idle",
  load: (projectId, snapshot) =>
    set({
      projectId,
      snapshot,
      undoStack: [],
      redoStack: [],
      selectedSceneId: snapshot.scenes[0]?.id ?? null,
      selectedHotspotId: null,
      dirty: false,
      saving: "idle",
    }),
  apply: (mutate) => {
    const current = get().snapshot;
    if (current == null) return;
    const before = clone(current);
    const draft = clone(current);
    mutate(draft);
    set((s) => ({
      snapshot: draft,
      undoStack: [...s.undoStack.slice(-49), before],
      redoStack: [],
      dirty: true,
    }));
  },
  undo: () => {
    const { undoStack, snapshot } = get();
    const prev = undoStack[undoStack.length - 1];
    if (prev == null || snapshot == null) return;
    set((s) => ({
      snapshot: prev,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, clone(snapshot)],
      dirty: true,
    }));
  },
  redo: () => {
    const { redoStack, snapshot } = get();
    const next = redoStack[redoStack.length - 1];
    if (next == null || snapshot == null) return;
    set((s) => ({
      snapshot: next,
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, clone(snapshot)],
      dirty: true,
    }));
  },
  select: (sceneId, hotspotId = null) => set({ selectedSceneId: sceneId, selectedHotspotId: hotspotId ?? null }),
  setSaving: (saving) => set({ saving }),
  markClean: () => set({ dirty: false }),
}));
