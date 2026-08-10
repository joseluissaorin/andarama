import { describe, expect, it } from "vitest";
import { Pool, pooled } from "./pool";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("pooled", () => {
  it("nunca pasa del límite y devuelve los resultados en orden", async () => {
    let running = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, (_, i) => async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return i;
    });
    const out = await pooled(tasks, 4);
    expect(peak).toBeLessThanOrEqual(4);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("con más hueco que tareas no se queda colgado", async () => {
    expect(await pooled([async () => 1], 8)).toEqual([1]);
  });

  it("sin tareas devuelve una lista vacía", async () => {
    expect(await pooled([], 4)).toEqual([]);
  });

  it("propaga el fallo de una tarea", async () => {
    await expect(pooled([async () => 1, async () => { throw new Error("no"); }], 2)).rejects.toThrow("no");
  });
});

describe("Pool", () => {
  it("push espera cuando está lleno", async () => {
    const pool = new Pool(2);
    const a = deferred();
    const b = deferred();
    let tercero = false;
    await pool.push(() => a.promise);
    await pool.push(() => b.promise);
    const pending = pool.push(async () => {
      tercero = true;
    });
    // Con dos en vuelo, el tercero no ha entrado todavía
    await new Promise((r) => setTimeout(r, 10));
    expect(tercero).toBe(false);
    // Al liberarse un hueco, el tercero entra
    a.resolve();
    await pending;
    b.resolve();
    await pool.drain();
    expect(tercero).toBe(true);
  });

  it("drain espera a todo lo que quede en vuelo", async () => {
    const pool = new Pool(4);
    let hechas = 0;
    for (let i = 0; i < 6; i++) {
      await pool.push(async () => {
        await new Promise((r) => setTimeout(r, 5));
        hechas++;
      });
    }
    await pool.drain();
    expect(hechas).toBe(6);
  });

  it("el primer fallo sale por drain y no se pierde", async () => {
    const pool = new Pool(2);
    await pool.push(async () => {
      throw new Error("tesela rota");
    });
    await expect(pool.drain()).rejects.toThrow("tesela rota");
  });
});
