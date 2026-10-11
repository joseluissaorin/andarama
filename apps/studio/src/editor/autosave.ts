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
 *
 * Edición en grupo: si otra persona guardó antes lo mismo (conflicto de
 * versión), `resolveConflict` trae lo vigente y lo fusiona con lo que hay en
 * pantalla, y se vuelve a guardar. Los cambios que llegan de la sala se
 * aplican con `exclusive`, nunca a mitad de un guardado. Y tras un guardado
 * fallido, el siguiente empieza por `resync`: un guardado que se cortó a la
 * mitad dejó en el servidor cosas que la base no sabe (crear dos veces la
 * misma escena daba error para siempre).
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
  /** ¿Es un conflicto de versión que se resuelve fusionando? */
  isConflict?: (err: unknown) => boolean;
  /** Trae lo vigente del servidor y lo fusiona (base nueva, tour en pantalla fusionado). */
  resolveConflict?: () => Promise<void>;
  /** Antes de reintentar tras un fallo: rehacer la base desde el servidor. */
  resync?: () => Promise<void>;
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
  /**
   * Ejecuta `fn` sin ningún guardado en vuelo, y ninguno empieza hasta que
   * acabe: es como se aplican los cambios que llegan de otras personas.
   */
  exclusive: <T>(fn: () => T | Promise<T>) => Promise<T>;
  /** Guardados completados (para saber si la base cambió mientras se esperaba algo). */
  generation: () => number;
}

/** Intentos de fusionar y volver a guardar antes de rendirse en un conflicto. */
const MAX_CONFLICT_ROUNDS = 4;

export class AutosaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutosaveError";
  }
}

export function createAutosaver<S>(opts: AutosaveOptions<S>): Autosaver {
  let running: Promise<boolean> | null = null;
  let lastFailed = false;
  let saves = 0;

  /** Un guardado. Devuelve si el tour quedó limpio. */
  const runOnce = async (): Promise<boolean> => {
    if (opts.store.current().dirty) opts.store.setSaving("saving");
    for (let round = 0; ; round++) {
      try {
        // Tras un fallo, la base puede no reflejar lo que sí llegó al servidor
        if (lastFailed && opts.resync != null) await opts.resync();
        const { snapshot, dirty } = opts.store.current();
        const base = opts.base();
        if (!dirty || snapshot == null || base == null) {
          // Tras un fallo, la fusión pudo dejar el tour igual que el servidor
          if (!dirty && lastFailed) opts.store.setSaving("saved");
          lastFailed = false;
          return !dirty;
        }
        opts.store.setSaving("saving");
        const target = opts.clone(snapshot);
        await opts.save(base, target);
        opts.setBase(target);
        lastFailed = false;
        saves++;
        const clean = opts.store.markSaved(snapshot);
        // Si se editó durante la petición sigue «guardando»: el siguiente
        // guardado ya está en camino y no conviene enseñar «Guardado».
        if (clean) opts.store.setSaving("saved");
        opts.onSaved?.();
        return clean;
      } catch (err) {
        if (opts.isConflict?.(err) === true && opts.resolveConflict != null && round < MAX_CONFLICT_ROUNDS) {
          // Otra persona guardó antes: se fusiona y se vuelve a intentar
          try {
            await opts.resolveConflict();
            continue;
          } catch (resolveErr) {
            err = resolveErr;
          }
        }
        lastFailed = true;
        opts.store.setSaving("error");
        opts.onError?.(err);
        return false;
      }
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

  const exclusive = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    while (running != null) await running.catch(() => false);
    let result!: T;
    const run = (async () => {
      result = await fn();
      return true;
    })();
    running = run;
    try {
      await run;
    } finally {
      if (running === run) running = null;
    }
    return result;
  };

  return { sync, flush, busy: () => running != null, exclusive, generation: () => saves };
}
