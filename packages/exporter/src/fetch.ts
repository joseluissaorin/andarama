import { AssetReadError } from "./errors.js";

/**
 * Descarga de un fichero del export con vigilancia de atascos.
 *
 * Un `fetch` sin plazo puede quedarse esperando para siempre: la conexión
 * sigue abierta pero no llega nada. Como el ZIP se escribe en orden, una sola
 * descarga colgada detenía el paquete entero en «1300 de 1500» y, con miles
 * de teselas, que alguna se cuelgue es cuestión de tiempo. Aquí el plazo no
 * cuenta la descarga entera (un vídeo grande tarda lo que tarda), sino el
 * tiempo sin recibir nada: si pasa `idleTimeoutMs` sin un solo byte, se corta
 * y el error, sin estado HTTP, entra en los reintentos.
 *
 * También se descarta un cuerpo que llega más corto de lo que anunció el
 * servidor: guardarlo daría una tesela o un vídeo rotos dentro del ZIP.
 */
export interface FetchBytesOptions {
  /** Tiempo máximo sin recibir datos, en ms (por defecto 45 s). */
  idleTimeoutMs?: number;
  /** Para las pruebas: otra implementación de fetch. */
  fetch?: typeof fetch;
}

export async function fetchBytes(
  url: string,
  label: string,
  init: RequestInit = {},
  opts: FetchBytesOptions = {},
): Promise<Uint8Array> {
  const idleMs = opts.idleTimeoutMs ?? 45_000;
  const doFetch = opts.fetch ?? fetch;
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stalled = false;
  // Se rechaza al vencer el plazo: la lectura del cuerpo compite con ella, así
  // que el corte no depende de que el navegador propague el aborto al stream
  let onStall: () => void = () => {};
  const stall = new Promise<never>((_, reject) => {
    onStall = () => reject(new Error("atasco"));
  });
  stall.catch(() => {});
  const arm = (): void => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      ac.abort();
      onStall();
    }, idleMs);
  };
  const fail = (err: unknown): AssetReadError => {
    if (err instanceof AssetReadError) return err;
    const why = stalled
      ? `sin recibir datos en ${Math.round(idleMs / 1000)} s`
      : err instanceof Error ? err.message : String(err);
    return new AssetReadError(`No se pudo leer ${label} (${why})`, null);
  };
  arm();
  try {
    const res = await Promise.race([doFetch(url, { ...init, signal: ac.signal }), stall]);
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      throw new AssetReadError(`No se pudo leer ${label} (${res.status})`, res.status);
    }
    // Content-Length solo vale para comprobar si el cuerpo no viene comprimido
    const encoding = res.headers.get("content-encoding");
    const declared = encoding == null || encoding === "identity" ? Number(res.headers.get("content-length") ?? NaN) : NaN;
    const expected = Number.isFinite(declared) && declared >= 0 ? declared : null;
    if (res.body == null) {
      const data = new Uint8Array(await Promise.race([res.arrayBuffer(), stall]));
      checkLength(data.byteLength, expected, label);
      return data;
    }
    const reader = res.body.getReader();
    // Con el tamaño anunciado se reserva una vez y se copia dentro: un vídeo
    // de 500 MB no ocupa el doble mientras se junta
    const out = expected != null ? new Uint8Array(expected) : null;
    const parts: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      arm();
      const { done, value } = await Promise.race([reader.read(), stall]).catch((err: unknown) => {
        void reader.cancel().catch(() => {});
        throw err;
      });
      if (done) break;
      if (out != null) {
        if (received + value.byteLength > out.byteLength) {
          void reader.cancel().catch(() => {});
          throw new AssetReadError(`No se pudo leer ${label} (llegan más bytes de los ${out.byteLength} anunciados)`, null);
        }
        out.set(value, received);
      } else parts.push(value);
      received += value.byteLength;
    }
    checkLength(received, expected, label);
    if (out != null) return out;
    if (parts.length === 1 && parts[0]!.byteOffset === 0 && parts[0]!.byteLength === parts[0]!.buffer.byteLength) return parts[0]!;
    const joined = new Uint8Array(received);
    let at = 0;
    for (const p of parts) {
      joined.set(p, at);
      at += p.byteLength;
    }
    return joined;
  } catch (err) {
    throw fail(err);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

function checkLength(received: number, expected: number | null, label: string): void {
  if (expected != null && received !== expected) {
    throw new AssetReadError(`No se pudo leer ${label} (llegaron ${received} de ${expected} bytes)`, null);
  }
}
