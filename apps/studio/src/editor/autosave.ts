/**
 * Autoguardado del editor, separado de React para poder probarlo.
 *
 * El problema que resuelve: un guardado fotografía el tour, espera a la red y
 * al volver lo marcaba limpio aunque la persona hubiera seguido editando
 * mientras tanto. El cambio hecho durante la petición se quedaba sin guardar
 * y publicar compilaba lo que había en la base de datos, que era viejo.
 *
 * Ahora solo se marca limpio si el tour vigente es **el mismo objeto** que se
 * guardó (el store crea uno nuevo en cada cambio); si no, queda sucio y se
 * vuelve a guardar. Los guardados nunca se cruzan: van de uno en uno.
 */

export type SaveStatus = "saving" | "saved" | "error";

export interface AutosaveStore<S> {
  /** Tour vigente y si tiene cambios sin guardar. */
  current: () => { snapshot: S | null; dirty: boolean };
  /** Marca limpio solo si `saved` sigue siendo el tour vigente. Devuelve si quedó limpio. */
  markSaved: (saved: S) => boolean;
  setSaving: (status: SaveStatus) => void;
}

export interface AutosaveOptions<S> {
  store: AutosaveStore<S>;
  /** Último estado que se sabe guardado en el servidor (base del diff). */
  base: () => S | null;
  setBase: (saved: S) => void;
  /** Envía al servidor la diferencia entre `base` y `target`. */
  save: (base: S, target: S) => Promise<void>;
  clone: (s: S) => S;
  onSaved?: () => void;
  onError?: (err: unknown) => void;
}

export interface Autosaver {
  /** Guarda lo pendiente (si lo hay), esperando a que acabe el guardado en curso. */
  sync: () => Promise<void>;
  /**
   * Guarda hasta que no quede nada pendiente. Lanza si un guardado falla o si
   * tras varias vueltas sigue habiendo cambios (alguien edita sin parar).
   */
  flush: (maxRounds?: number) => Promise<void>;
  /** Hay un guardado en vuelo. */
  busy: () => boolean;
}

export class AutosaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutosaveError";
  }
}

export function createAutosaver<S>(opts: AutosaveOptions<S>): Autosaver {
  let running: Promise<boolean> | null = null;
  let lastFailed = false;

  /** Un guardado. Devuelve si el tour quedó limpio. */
  const runOnce = async (): Promise<boolean> => {
    const { snapshot, dirty } = opts.store.current();
    const base = opts.base();
    if (!dirty || snapshot == null || base == null) return !dirty;
    opts.store.setSaving("saving");
    const target = opts.clone(snapshot);
    try {
      await opts.save(base, target);
      opts.setBase(target);
      lastFailed = false;
      const clean = opts.store.markSaved(snapshot);
      // Si se editó durante la petición sigue «guardando»: el siguiente
      // guardado ya está en camino y no conviene enseñar «Guardado».
      if (clean) opts.store.setSaving("saved");
      opts.onSaved?.();
      return clean;
    } catch (err) {
      lastFailed = true;
      opts.store.setSaving("error");
      opts.onError?.(err);
      return false;
    }
  };

  const sync = async (): Promise<void> => {
    while (running != null) await running.catch(() => false);
    const run = runOnce();
    running = run;
    try {
      const clean = await run;
      // Se editó durante el guardado: se reprograma en el acto, sin esperar
      // a que el temporizador del editor vuelva a dispararse.
      if (!clean && !lastFailed && opts.store.current().dirty) {
        running = null;
        await sync();
      }
    } finally {
      if (running === run) running = null;
    }
  };

  const flush = async (maxRounds = 5): Promise<void> => {
    for (let i = 0; i < maxRounds; i++) {
      await sync();
      if (lastFailed) throw new AutosaveError("save_failed");
      if (!opts.store.current().dirty) return;
    }
    throw new AutosaveError("still_dirty");
  };

  return { sync, flush, busy: () => running != null };
}
