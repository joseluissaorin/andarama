import { useEditor, type EditorSnapshot } from "../../stores";
import type { Autosaver } from "../autosave";
import { loadSnapshot } from "../editorApi";
import { applyEvents, mergeSnapshots, sameSnapshot, TOUCHED_ALL, type ChangeEvent, type Touched, type VersionBook } from "./merge";

/**
 * Lo que cambia en el servidor por obra de otras personas, aplicado al
 * editor: los avisos de la sala (rápido, sin pedir nada) y la resincronización
 * completa (al reconectar, tras un conflicto o tras un guardado fallido).
 *
 * Siempre igual: base nueva = lo que tiene el servidor; en pantalla, la fusión
 * de lo que se está escribiendo con eso; y el historial de deshacer, reescrito
 * sobre lo nuevo para que deshacer no borre el trabajo de otra persona.
 */
export interface RemoteSync {
  /** Avisos «changed» de la sala (los propios ya vienen filtrados). */
  applyEvents: (events: ChangeEvent[]) => Promise<void>;
  /**
   * Trae todo del servidor y fusiona. `inSave`: se llama desde dentro de un
   * guardado (conflicto o reintento) y no hay que esperar a que acabe.
   */
  resync: (inSave: boolean) => Promise<void>;
}

export function createRemoteSync(opts: {
  projectId: string;
  autosaver: () => Autosaver;
  base: { current: EditorSnapshot | null };
  versions: VersionBook;
  /** Datos del proyecto recién leídos (título, publicación, permisos...). */
  onProject?: (project: Record<string, unknown>) => void;
}): RemoteSync {
  const commit = (base: EditorSnapshot, next: EditorSnapshot, touched: Touched, scenes: string[] | "all"): void => {
    const st = useEditor.getState();
    if (st.snapshot == null) return;
    const merged = mergeSnapshots(base, st.snapshot, next, touched);
    const rebase = (entry: EditorSnapshot): EditorSnapshot => mergeSnapshots(base, entry, next, touched);
    opts.base.current = next;
    st.applyRemote({
      snapshot: merged,
      undoStack: st.undoStack.map(rebase),
      redoStack: st.redoStack.map(rebase),
      dirty: !sameSnapshot(merged, next),
      scenes,
    });
  };

  const applyRemoteEvents = async (events: ChangeEvent[]): Promise<void> => {
    if (events.length === 0) return;
    await opts.autosaver().exclusive(() => {
      const base = opts.base.current;
      if (base == null || useEditor.getState().snapshot == null) return;
      const { base: next, touched, changed } = applyEvents(base, events, opts.versions);
      if (!changed) return;
      commit(base, next, touched, affectedScenes(base, next, touched));
    });
  };

  const resync = async (inSave: boolean): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      const autosaver = opts.autosaver();
      const generation = autosaver.generation();
      const { snapshot: server, versions, project } = await loadSnapshot(opts.projectId);
      const apply = (): boolean => {
        const base = opts.base.current;
        if (base == null || useEditor.getState().snapshot == null) return true;
        opts.versions.clear();
        for (const [k, v] of versions) opts.versions.set(k, v);
        commit(base, server, TOUCHED_ALL, "all");
        opts.onProject?.(project);
        return true;
      };
      if (inSave) {
        apply();
        return;
      }
      // Si mientras se leía se guardó algo, lo leído ya es viejo: otra vuelta
      const done = await autosaver.exclusive(() => (autosaver.generation() !== generation ? false : apply()));
      if (done) return;
    }
  };

  return { applyEvents: applyRemoteEvents, resync };
}

/** Escenas cuyo visor hay que volver a montar. */
function affectedScenes(before: EditorSnapshot, after: EditorSnapshot, touched: Touched): string[] | "all" {
  if (touched.settings || touched.scenes === "all" || touched.hotspots === "all") return "all";
  const out = new Set<string>(touched.scenes);
  for (const list of [before.hotspots, after.hotspots]) {
    for (const h of list) if (touched.hotspots.has(h.id)) out.add(h.sceneId);
  }
  return [...out];
}
