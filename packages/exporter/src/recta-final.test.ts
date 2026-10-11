import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tour } from "@andarama/schema";
import { AssetReadError, buildZip, fetchBytes, runExport, withRetry, ZipWriter, type AssetProvider } from "./index.js";

/**
 * La recta final del export: lo que fallaba con tours grandes cuando el
 * paquete ya iba por «1300 de 1500».
 */

function writeTmp(zip: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "anda-zip64-"));
  const path = join(dir, "t.zip");
  writeFileSync(path, zip);
  return path;
}

/** Respuesta cuyo cuerpo entrega `chunks` y después se queda colgado si `hang`. */
function streamResponse(chunks: Uint8Array[], opts: { hang?: boolean; length?: number } = {}): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else if (opts.hang === true) return new Promise<void>(() => {});
      else controller.close();
      return undefined;
    },
  });
  const headers: Record<string, string> = {};
  if (opts.length != null) headers["content-length"] = String(opts.length);
  return new Response(body, { headers });
}

/** fetch falso que respeta la señal de aborto, como el de verdad. */
function fakeFetch(make: () => Response | Promise<Response>): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      void Promise.resolve(make()).then(resolve, reject);
    })) as unknown as typeof fetch;
}

describe("descargas que se atascan", () => {
  it("una petición sin respuesta se corta y se puede reintentar", async () => {
    const fetchColgado = fakeFetch(() => new Promise<Response>(() => {}));
    const err = await fetchBytes("/x", "tiles/a.webp", {}, { idleTimeoutMs: 30, fetch: fetchColgado }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AssetReadError);
    expect((err as AssetReadError).status).toBeNull();
    expect((err as Error).message).toContain("sin recibir datos");
  });

  it("un cuerpo que deja de llegar a medias también se corta", async () => {
    const f = fakeFetch(() => streamResponse([new Uint8Array([1, 2, 3])], { hang: true }));
    await expect(fetchBytes("/x", "media/v.mp4", {}, { idleTimeoutMs: 30, fetch: f })).rejects.toBeInstanceOf(AssetReadError);
  });

  it("el plazo cuenta el silencio, no la descarga entera", async () => {
    // Cinco trozos espaciados 20 ms con un plazo de 50 ms: tarda más que el
    // plazo en total, pero nunca se queda 50 ms sin recibir nada
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((r) => setTimeout(r, 20));
        if (i < 5) controller.enqueue(new Uint8Array([i++]));
        else controller.close();
      },
    });
    const f = fakeFetch(() => new Response(body));
    const data = await fetchBytes("/x", "media/v.mp4", {}, { idleTimeoutMs: 50, fetch: f });
    expect([...data]).toEqual([0, 1, 2, 3, 4]);
  });

  it("descarta un cuerpo más corto de lo anunciado", async () => {
    const f = fakeFetch(() => streamResponse([new Uint8Array([1, 2])], { length: 10 }));
    const err = await fetchBytes("/x", "tiles/b.webp", {}, { fetch: f }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AssetReadError);
    expect((err as Error).message).toContain("2 de 10");
  });

  it("junta bien los trozos con y sin tamaño anunciado", async () => {
    const trozos = () => [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])];
    const conTamano = await fetchBytes("/x", "a", {}, { fetch: fakeFetch(() => streamResponse(trozos(), { length: 6 })) });
    const sinTamano = await fetchBytes("/x", "a", {}, { fetch: fakeFetch(() => streamResponse(trozos())) });
    expect([...conTamano]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...sinTamano]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("un 404 no se reintenta y un atasco sí", async () => {
    let llamadas = 0;
    const f404 = fakeFetch(() => {
      llamadas++;
      return new Response("no", { status: 404 });
    });
    await expect(withRetry(() => fetchBytes("/x", "a", {}, { fetch: f404 }), { sleep: async () => {} })).rejects.toBeInstanceOf(AssetReadError);
    expect(llamadas).toBe(1);

    llamadas = 0;
    const fAtasco = fakeFetch(() => {
      llamadas++;
      return llamadas < 3 ? new Promise<Response>(() => {}) : new Response(new Uint8Array([7]));
    });
    const data = await withRetry(() => fetchBytes("/x", "a", {}, { idleTimeoutMs: 20, fetch: fAtasco }), { sleep: async () => {} });
    expect([...data]).toEqual([7]);
    expect(llamadas).toBe(3);
  });

  it("una tesela colgada al final ya no deja el paquete a medias", async () => {
    const tour: Tour = {
      version: 1,
      meta: { title: { es: "T" }, defaultLang: "es", langs: ["es"] },
      start: { scene: "a" },
      scenes: [{ id: "a", type: "image", title: { es: "A" }, source: { kind: "equirect", url: "media/a.jpg" }, hotspots: [] }],
    } as unknown as Tour;
    const paths = Array.from({ length: 40 }, (_, i) => `tiles/m/${i}.webp`);
    let colgada = true;
    const provider: AssetProvider = {
      list: async () => paths,
      read: (path) =>
        fetchBytes(`/${path}`, path, {}, {
          idleTimeoutMs: 25,
          fetch: fakeFetch(() => {
            // La penúltima se cuelga la primera vez, como en la recta final
            if (path === paths[38] && colgada) {
              colgada = false;
              return new Promise<Response>(() => {});
            }
            return new Response(new Uint8Array([1, 2, 3]));
          }),
        }),
    };
    const chunks: Uint8Array[] = [];
    const writer = new ZipWriter((c) => {
      chunks.push(c.slice());
    });
    const result = await runExport(tour, [{ path: "viewer.js", data: new Uint8Array([1]) }], provider, { retry: { sleep: async () => {} } }, writer);
    expect(result.missing).toEqual([]);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const zip = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      zip.set(c, at);
      at += c.length;
    }
    const listing = execFileSync("unzip", ["-l", writeTmp(zip)]).toString();
    expect(listing).toContain("tiles/m/38.webp");
    expect(listing).toContain("tiles/m/39.webp");
  });
});

describe("ZIP64", () => {
  it("por debajo de los límites el ZIP sigue siendo el clásico", async () => {
    const zip = await buildZip([{ name: "a.txt", data: new TextEncoder().encode("hola") }], { deflate: false });
    // Sin registro de fin ZIP64 (PK\x06\x06)
    const hasZip64 = zip.some((b, i) => b === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x06 && zip[i + 3] === 0x06);
    expect(hasZip64).toBe(false);
  });

  it("con más de 65535 entradas el paquete se abre entero", async () => {
    const files = Array.from({ length: 65_600 }, (_, i) => ({ name: `t/${i}.webp`, data: new Uint8Array([i & 0xff]) }));
    const zip = await buildZip(files, { deflate: false });
    const path = writeTmp(zip);
    const check = execFileSync("unzip", ["-t", path], { maxBuffer: 64 * 1024 * 1024 }).toString();
    expect(check).toContain("No errors detected");
    const listing = execFileSync("unzip", ["-l", path], { maxBuffer: 64 * 1024 * 1024 }).toString();
    expect(listing).toMatch(/65600 files/);
  }, 60_000);

  it("los desplazamientos y tamaños que no caben en 32 bits van en los campos ZIP64", async () => {
    // Con el límite bajado, un paquete pequeño recorre el mismo camino que uno
    // de más de 4 GB: desplazamientos, tamaños y fin de directorio en 64 bits
    const files = [
      { name: "index.html", data: new TextEncoder().encode("<html>hola</html>") },
      { name: "media/grande.mp4", data: new Uint8Array(300).map((_, i) => i % 251) },
      { name: "tiles/0.webp", data: new Uint8Array([1, 2, 3]) },
    ];
    const zip = await buildZip(files, { deflate: false, zip64Limit: 100 });
    const path = writeTmp(zip);
    expect(execFileSync("unzip", ["-t", path]).toString()).toContain("No errors detected");
    const out = execFileSync("unzip", ["-p", path, "media/grande.mp4"]);
    expect(new Uint8Array(out)).toEqual(files[1]!.data);
    const hasZip64End = zip.some((b, i) => b === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x06 && zip[i + 3] === 0x06);
    expect(hasZip64End).toBe(true);
  });
});
