import { describe, expect, it } from "vitest";
import { createAutosaver, type SaveStatus } from "./autosave";

interface Snap {
  v: number;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Un store mínimo con la misma regla que el del editor: un objeto nuevo por cambio. */
function fakeEditor(initial: Snap) {
  const state = { snapshot: initial as Snap | null, dirty: false, saving: "idle" as SaveStatus | "idle" };
  return {
    state,
    edit(v: number) {
      state.snapshot = { v };
      state.dirty = true;
    },
    store: {
      current: () => ({ snapshot: state.snapshot, dirty: state.dirty }),
      markSaved: (saved: Snap) => {
        if (state.snapshot !== saved) return false;
        state.dirty = false;
        return true;
      },
      setSaving: (s: SaveStatus) => {
        state.saving = s;
      },
    },
  };
}

function setup(saveImpl?: (base: Snap, target: Snap) => Promise<void>) {
  const ed = fakeEditor({ v: 0 });
  let base: Snap | null = { v: 0 };
  const saved: number[] = [];
  const autosaver = createAutosaver<Snap>({
    store: ed.store,
    base: () => base,
    setBase: (s) => {
      base = s;
    },
    clone: (s) => ({ ...s }),
    save:
      saveImpl ??
      (async (_b, target) => {
        saved.push(target.v);
      }),
  });
  return { ed, autosaver, saved, getBase: () => base };
}

describe("autoguardado", () => {
  it("guarda y marca limpio cuando nadie edita durante la petición", async () => {
    const { ed, autosaver, saved } = setup();
    ed.edit(1);
    await autosaver.sync();
    expect(saved).toEqual([1]);
    expect(ed.state.dirty).toBe(false);
    expect(ed.state.saving).toBe("saved");
  });

  it("no marca limpio si se editó mientras volaba la petición y vuelve a guardar", async () => {
    const gates: ReturnType<typeof deferred>[] = [];
    const saved: number[] = [];
    const { ed, autosaver, getBase } = setup(async (_b, target) => {
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      saved.push(target.v);
    });
    ed.edit(1);
    const run = autosaver.sync();
    // Edición en mitad del guardado
    ed.edit(2);
    gates[0]!.resolve();
    // El segundo guardado arranca solo
    await new Promise((r) => setTimeout(r, 0));
    expect(gates).toHaveLength(2);
    expect(ed.state.dirty).toBe(true);
    expect(ed.state.saving).toBe("saving");
    gates[1]!.resolve();
    await run;
    expect(saved).toEqual([1, 2]);
    expect(ed.state.dirty).toBe(false);
    expect(getBase()).toEqual({ v: 2 });
  });

  it("flush espera a que no quede nada pendiente (lo que publicar necesita)", async () => {
    let calls = 0;
    const { ed, autosaver } = setup(async () => {
      calls++;
      // La persona sigue escribiendo durante el primer guardado
      if (calls === 1) ed.edit(5);
      await Promise.resolve();
    });
    ed.edit(4);
    await autosaver.flush();
    expect(calls).toBe(2);
    expect(ed.state.dirty).toBe(false);
  });

  it("flush lanza si el guardado falla, para no publicar un estado viejo", async () => {
    const { ed, autosaver } = setup(async () => {
      throw new Error("sin red");
    });
    ed.edit(1);
    await expect(autosaver.flush()).rejects.toThrow("save_failed");
    expect(ed.state.dirty).toBe(true);
    expect(ed.state.saving).toBe("error");
  });

  it("nunca cruza dos guardados", async () => {
    let inFlight = 0;
    let peak = 0;
    const { ed, autosaver } = setup(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });
    ed.edit(1);
    const a = autosaver.sync();
    ed.edit(2);
    const b = autosaver.sync();
    ed.edit(3);
    const c = autosaver.sync();
    await Promise.all([a, b, c]);
    expect(peak).toBe(1);
    expect(ed.state.dirty).toBe(false);
  });

  it("sin cambios no llama al servidor", async () => {
    const { autosaver, saved } = setup();
    await autosaver.flush();
    expect(saved).toEqual([]);
  });
});

class Conflict extends Error {}

describe("autoguardado en grupo", () => {
  it("un conflicto se resuelve fusionando y se vuelve a guardar sin perder lo escrito", async () => {
    const ed = fakeEditor({ v: 0 });
    let base: Snap & { other?: number } = { v: 0 };
    let server = { v: 0, other: 0 };
    const sent: number[] = [];
    let resolved = 0;
    const autosaver = createAutosaver<Snap>({
      store: ed.store,
      base: () => base,
      setBase: (s) => {
        base = s;
      },
      clone: (s) => ({ ...s }),
      save: async (b, target) => {
        // El servidor rechaza si la base no es la vigente (otra persona guardó)
        if (server.other !== ((b as Snap & { other?: number }).other ?? 0)) throw new Conflict();
        sent.push(target.v);
        server = { ...server, v: target.v };
      },
      isConflict: (err) => err instanceof Conflict,
      resolveConflict: async () => {
        resolved++;
        // Fusión: la base pasa a ser el servidor; en pantalla, lo escrito encima
        base = { ...server };
        ed.state.snapshot = { ...server, v: ed.state.snapshot!.v } as Snap;
      },
    });
    // Otra persona guarda mientras tanto
    server = { v: 0, other: 7 };
    ed.edit(5);
    await autosaver.sync();
    expect(resolved).toBe(1);
    expect(sent).toEqual([5]);
    expect(ed.state.dirty).toBe(false);
    expect(ed.state.saving).toBe("saved");
    expect(server).toEqual({ v: 5, other: 7 });
  });

  it("un conflicto que no se arregla acaba en error en vez de girar para siempre", async () => {
    const ed = fakeEditor({ v: 0 });
    let resolved = 0;
    const errors: unknown[] = [];
    const autosaver = createAutosaver<Snap>({
      store: ed.store,
      base: () => ({ v: 0 }),
      setBase: () => {},
      clone: (s) => ({ ...s }),
      save: async () => {
        throw new Conflict();
      },
      isConflict: (err) => err instanceof Conflict,
      resolveConflict: async () => {
        resolved++;
      },
      onError: (err) => errors.push(err),
    });
    ed.edit(1);
    await autosaver.sync();
    expect(resolved).toBe(4);
    expect(errors.length).toBe(1);
    expect(ed.state.saving).toBe("error");
  });

  it("tras un fallo, el siguiente intento rehace la base antes de guardar", async () => {
    const ed = fakeEditor({ v: 0 });
    let fail = true;
    const calls: string[] = [];
    const autosaver = createAutosaver<Snap>({
      store: ed.store,
      base: () => ({ v: 0 }),
      setBase: () => {},
      clone: (s) => ({ ...s }),
      save: async () => {
        calls.push("save");
        if (fail) throw new Error("red");
      },
      resync: async () => {
        calls.push("resync");
      },
    });
    ed.edit(1);
    await autosaver.sync();
    expect(ed.state.saving).toBe("error");
    fail = false;
    await autosaver.sync();
    expect(calls).toEqual(["save", "resync", "save"]);
    expect(ed.state.saving).toBe("saved");
  });

  it("exclusive espera al guardado en vuelo: lo de la sala nunca se cruza con un guardado", async () => {
    const gate = deferred();
    const order: string[] = [];
    const { ed, autosaver } = setup(async () => {
      order.push("save:start");
      await gate.promise;
      order.push("save:end");
    });
    ed.edit(1);
    const saving = autosaver.sync();
    await Promise.resolve();
    const applied = autosaver.exclusive(() => {
      order.push("remote");
      return 42;
    });
    gate.resolve();
    await saving;
    expect(await applied).toBe(42);
    expect(order).toEqual(["save:start", "save:end", "remote"]);
    expect(autosaver.generation()).toBe(1);
  });
});
