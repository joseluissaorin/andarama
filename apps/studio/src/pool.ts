/**
 * Concurrencia acotada.
 *
 * Ni de uno en uno ni todos a la vez. Las partes de un fichero grande se
 * subían en fila india, desaprovechando la subida; y los tiles se soltaban de
 * cien en cien, que con HTTP/2 es meterle al navegador cien flujos peleándose
 * y cien blobs vivos en memoria. Un puñado a la vez es lo que va rápido.
 */

/** Ejecuta las tareas con como mucho `limit` en vuelo, en orden de entrada. */
export async function pooled<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const size = Math.max(1, Math.min(limit, tasks.length));
  const results = new Array<T>(tasks.length);
  let next = 0;
  const workers = Array.from({ length: size }, async () => {
    for (;;) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]!();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Cola con hueco limitado: `push` espera si ya hay `limit` tareas en vuelo.
 * Sirve para producir mientras se consume sin acumular memoria —el troceador
 * genera tiles más rápido de lo que la red los sube—.
 */
export class Pool {
  private running = 0;
  private waiting: (() => void)[] = [];
  private failure: unknown = null;
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(private readonly limit: number) {}

  async push(task: () => Promise<unknown>): Promise<void> {
    if (this.failure != null) throw this.failure;
    while (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
      if (this.failure != null) throw this.failure;
    }
    this.running++;
    const p = task()
      .catch((err: unknown) => {
        // El primer fallo se guarda y sale por el siguiente push o por drain
        this.failure ??= err;
      })
      .finally(() => {
        this.running--;
        this.inFlight.delete(p);
        this.waiting.shift()?.();
      });
    this.inFlight.add(p);
  }

  /** Espera a que no quede nada y propaga el primer fallo. */
  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
    if (this.failure != null) throw this.failure;
  }
}

/**
 * Cuántas cosas conviene hacer a la vez en este equipo. Un iPad con poca
 * memoria no aguanta lo mismo que un portátil, y trocear dos panoramas de 60
 * megapíxeles a la vez es la forma más rápida de que el navegador se caiga.
 */
export function deviceConcurrency(): { files: number; network: number } {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  return {
    files: memory >= 8 && cores >= 8 ? 2 : 1,
    network: memory >= 4 ? 6 : 3,
  };
}
