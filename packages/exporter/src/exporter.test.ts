import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tour } from "@andarama/schema";
import {
  AssetReadError,
  buildZip,
  filterTourLangs,
  limitTourResolution,
  readAhead,
  renderAccessibleHtml,
  renderImsManifest,
  renderIndexHtml,
  renderScormAdapter,
  runExport,
  stripDownloads,
  ZipWriter,
  withRetry,
  type AssetProvider,
  type ExportProgress,
} from "./index.js";

function sampleTour(): Tour {
  return {
    version: 1,
    meta: { title: { es: "Demo", en: "Demo EN", fr: "Demo FR" }, defaultLang: "es", langs: ["es", "en", "fr"] },
    start: { scene: "a" },
    scenes: [
      {
        id: "a",
        type: "image",
        title: { es: "Escena A", en: "Scene A", fr: "Scene A FR" },
        altText: { es: "Alt A" },
        source: { kind: "multires", levels: 4, tileSize: 512, faceSize: 4096, base: "tiles/m1", preview: "tiles/m1/preview.jpg" },
        hotspots: [
          { id: "p1", type: "pdf", yaw: 0, pitch: 0, url: "media/doc.pdf", download: true, altText: "Documento" },
          { id: "i1", type: "image", yaw: 1, pitch: 0, url: "media/foto.jpg", download: true, altText: "Foto" },
        ],
      },
    ],
  };
}

describe("ZipWriter", () => {
  it("produce un ZIP valido verificable con unzip", async () => {
    const zip = await buildZip([
      { name: "index.html", data: new TextEncoder().encode("<html>hola</html>") },
      { name: "dir/tour.json", data: new TextEncoder().encode('{"version":1}') },
    ]);
    const dir = mkdtempSync(join(tmpdir(), "anda-zip-"));
    const zipPath = join(dir, "test.zip");
    writeFileSync(zipPath, zip);
    const listing = execFileSync("unzip", ["-l", zipPath]).toString();
    expect(listing).toContain("index.html");
    expect(listing).toContain("dir/tour.json");
    const check = execFileSync("unzip", ["-t", zipPath]).toString();
    expect(check).toContain("No errors detected");
  });
});

describe("ZIP más rápido", () => {
  it("comprime el texto y guarda tal cual lo que ya viene comprimido", async () => {
    const texto = new TextEncoder().encode(JSON.stringify({ escenas: Array.from({ length: 400 }, (_, i) => ({ id: `s${i}`, titulo: "Aula" })) }));
    const foto = new Uint8Array(4096).map((_, i) => (i * 7919) % 251);
    const zip = await buildZip([
      { name: "tour.json", data: texto },
      { name: "media/foto.jpg", data: foto },
    ]);
    // El ZIP ocupa bastante menos que el texto sin comprimir
    expect(zip.length).toBeLessThan(texto.length / 2 + foto.length + 400);
    const dir = mkdtempSync(join(tmpdir(), "anda-zip-"));
    const zipPath = join(dir, "d.zip");
    writeFileSync(zipPath, zip);
    const detalle = execFileSync("unzip", ["-v", zipPath]).toString();
    expect(detalle).toMatch(/Defl:N.*tour\.json/);
    expect(detalle).toMatch(/Stored.*media\/foto\.jpg/);
    expect(execFileSync("unzip", ["-t", zipPath]).toString()).toContain("No errors detected");
    // Y se puede desactivar
    const plano = await buildZip([{ name: "tour.json", data: texto }], { deflate: false });
    expect(plano.length).toBeGreaterThan(texto.length);
  });

  it("lee en paralelo y entrega en orden", async () => {
    let enVuelo = 0;
    let maximo = 0;
    const orden: number[] = [];
    await readAhead(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      4,
      async (n) => {
        enVuelo++;
        maximo = Math.max(maximo, enVuelo);
        await new Promise((r) => setTimeout(r, (10 - n) * 2));
        enVuelo--;
        return new Uint8Array([n]);
      },
      async (n, data) => {
        expect(data[0]).toBe(n);
        orden.push(n);
      },
    );
    expect(orden).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maximo).toBe(4);
  });

  it("un error de lectura se propaga", async () => {
    await expect(
      readAhead([1, 2, 3], 3, async (n) => {
        if (n === 2) throw new Error("fallo");
        return new Uint8Array([n]);
      }, async () => {}),
    ).rejects.toThrow("fallo");
  });
});

describe("transformaciones del tour", () => {
  it("filtra idiomas", () => {
    const tour = filterTourLangs(sampleTour(), ["es", "en"]);
    expect(tour.meta.langs).toEqual(["es", "en"]);
    expect(tour.meta.title).toEqual({ es: "Demo", en: "Demo EN" });
    expect((tour.scenes[0]!.title as Record<string, string>).fr).toBeUndefined();
  });

  it("cambia el idioma por defecto si no se incluye", () => {
    const tour = filterTourLangs(sampleTour(), ["en"]);
    expect(tour.meta.defaultLang).toBe("en");
    expect((tour.meta.title as Record<string, string>).en).toBe("Demo EN");
  });

  it("limita la resolucion de tiles", () => {
    const { tour, skippedLevelFor } = limitTourResolution(sampleTour(), 2);
    const src = tour.scenes[0]!.source as { levels: number; faceSize: number };
    expect(src.levels).toBe(2);
    expect(src.faceSize).toBe(1024);
    expect(skippedLevelFor.get("tiles/m1")).toBe(2);
  });

  it("elimina flags de descarga", () => {
    const tour = stripDownloads(sampleTour());
    for (const hs of tour.scenes[0]!.hotspots) {
      expect((hs as { download?: boolean }).download).toBe(false);
    }
  });
});

describe("runExport", () => {
  const assets: AssetProvider = {
    list: async () => [
      "tiles/m1/0/f/0/0.webp",
      "tiles/m1/1/f/0/0.webp",
      "tiles/m1/2/f/0/0.webp",
      "tiles/m1/3/f/0/0.webp",
      "tiles/m1/preview.jpg",
      "media/doc.pdf",
      "media/foto.jpg",
    ],
    read: async () => new Uint8Array([1, 2, 3]),
  };
  const viewerFiles = [{ path: "viewer.js", data: new TextEncoder().encode("// visor") }];

  it("genera un paquete completo con SCORM y service worker", async () => {
    const chunks: Uint8Array[] = [];
    const writer = new ZipWriter((c) => {
      chunks.push(c);
    });
    const result = await runExport(
      sampleTour(),
      viewerFiles,
      assets,
      { scorm: "2004", serviceWorker: true, maxLevels: 2, analyticsEndpoint: null },
      writer,
    );
    expect(result.files).toBeGreaterThan(5);
    const dir = mkdtempSync(join(tmpdir(), "anda-export-"));
    const zipPath = join(dir, "export.zip");
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
    writeFileSync(zipPath, buf);
    const listing = execFileSync("unzip", ["-l", zipPath]).toString();
    expect(listing).toContain("index.html");
    expect(listing).toContain("tour.json");
    expect(listing).toContain("viewer/viewer.js");
    expect(listing).toContain("imsmanifest.xml");
    expect(listing).toContain("scorm-adapter.js");
    expect(listing).toContain("sw.js");
    expect(listing).toContain("manifest.webmanifest");
    // los niveles 2 y 3 quedan excluidos por maxLevels=2
    expect(listing).toContain("tiles/m1/0/f/0/0.webp");
    expect(listing).toContain("tiles/m1/1/f/0/0.webp");
    expect(listing).not.toContain("tiles/m1/2/f/0/0.webp");
    expect(listing).not.toContain("tiles/m1/3/f/0/0.webp");
  });
});

describe("lecturas que fallan", () => {
  const noWait = { sleep: async () => {} };

  it("reintenta los 5xx con espera creciente y azar, y se rinde tras 4 reintentos", async () => {
    const waits: number[] = [];
    let calls = 0;
    const fail = (): Promise<never> => {
      calls++;
      return Promise.reject(new AssetReadError("caído", 500));
    };
    await expect(
      withRetry(fail, { sleep: async (ms) => void waits.push(ms), random: () => 1, baseDelayMs: 100, maxDelayMs: 1000 }),
    ).rejects.toThrow("caído");
    expect(calls).toBe(5);
    expect(waits).toEqual([100, 200, 400, 800]);
    // Con el azar a cero la espera es la mitad del tope
    const halves: number[] = [];
    await withRetry(fail, { sleep: async (ms) => void halves.push(ms), random: () => 0, baseDelayMs: 100, maxDelayMs: 300 }).catch(() => {});
    expect(halves).toEqual([50, 100, 150, 150]);
  });

  it("no reintenta un 404 y sí un 429 o un fallo de red", async () => {
    let calls = 0;
    await expect(withRetry(() => (calls++, Promise.reject(new AssetReadError("no está", 404))), noWait)).rejects.toThrow();
    expect(calls).toBe(1);
    let n = 0;
    const flaky = (): Promise<string> => {
      n++;
      if (n === 1) return Promise.reject(new AssetReadError("despacio", 429));
      if (n === 2) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve("ok");
    };
    expect(await withRetry(flaky, noWait)).toBe("ok");
    expect(n).toBe(3);
  });

  it("con un 5 % de errores 500 y un 404 permanente, termina el ZIP y anota lo que falta en LEEME.md", async () => {
    const paths = Array.from({ length: 400 }, (_, i) => `tiles/m1/2/f/${Math.floor(i / 20)}/${i % 20}.webp`);
    const lost = "tiles/m1/2/f/7/3.webp";
    // Estas tres fallan más veces que los reintentos de una lectura: se
    // apartan y se recuperan en la segunda vuelta
    const stubborn = new Set(["tiles/m1/2/f/1/1.webp", "tiles/m1/2/f/9/9.webp", "tiles/m1/2/f/19/0.webp"]);
    const attempts = new Map<string, number>();
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const provider: AssetProvider = {
      list: async () => paths,
      read: async (path) => {
        const n = (attempts.get(path) ?? 0) + 1;
        attempts.set(path, n);
        if (path === lost) throw new AssetReadError(`No se pudo leer ${path} (404)`, 404);
        if (stubborn.has(path) && n <= 5) throw new AssetReadError(`No se pudo leer ${path} (500)`, 500);
        if (random() < 0.05) throw new AssetReadError(`No se pudo leer ${path} (500)`, 500);
        return new Uint8Array([1, 2, 3, 4]);
      },
    };
    const chunks: Uint8Array[] = [];
    const writer = new ZipWriter((c) => {
      chunks.push(c);
    });
    const progress: ExportProgress[] = [];
    const tour = sampleTour();
    tour.scenes[0]!.hotspots = [];
    const result = await runExport(
      tour,
      [{ path: "viewer.js", data: new TextEncoder().encode("// visor") }],
      provider,
      { retry: noWait, concurrency: 10 },
      writer,
      (p) => progress.push(p),
    );
    expect(result.missing).toEqual([lost]);
    // Hubo errores pasajeros de verdad, y todos se reintentaron
    expect([...attempts.values()].filter((n) => n > 1).length).toBeGreaterThan(10);
    expect(progress.some((p) => p.phase === "retry")).toBe(true);
    const last = progress.filter((p) => p.phase === "assets").at(-1)!;
    expect(last.done).toBe(400);
    expect(progress.filter((p) => p.phase === "retry").at(-1)!.bytes).toBe(399 * 4);

    const dir = mkdtempSync(join(tmpdir(), "anda-export-"));
    const zipPath = join(dir, "export.zip");
    writeFileSync(zipPath, Buffer.concat(chunks));
    expect(execFileSync("unzip", ["-t", zipPath]).toString()).toContain("No errors detected");
    const listing = execFileSync("unzip", ["-l", zipPath]).toString();
    for (const path of stubborn) expect(listing).toContain(path);
    expect(listing).not.toContain(lost);
    const leeme = execFileSync("unzip", ["-p", zipPath, "LEEME.md"]).toString();
    expect(leeme).toContain("## Ficheros que faltan");
    expect(leeme).toContain(`\`${lost}\` (error 404)`);
    expect(leeme).toContain("un fichero");
  });

  it("sin errores, LEEME.md no lleva el apartado de ficheros que faltan", async () => {
    const chunks: Uint8Array[] = [];
    const tour = sampleTour();
    const result = await runExport(
      tour,
      [{ path: "viewer.js", data: new TextEncoder().encode("// visor") }],
      { list: async () => ["media/foto.jpg"], read: async () => new Uint8Array([1]) },
      {},
      new ZipWriter((c) => {
        chunks.push(c);
      }),
    );
    expect(result.missing).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), "anda-export-"));
    const zipPath = join(dir, "export.zip");
    writeFileSync(zipPath, Buffer.concat(chunks));
    expect(execFileSync("unzip", ["-p", zipPath, "LEEME.md"]).toString()).not.toContain("Ficheros que faltan");
  });
});

describe("SCORM con HTML único", () => {
  it("el adaptador va dentro de index.html y el manifiesto se incluye", async () => {
    const tour = sampleTour();
    tour.scenes[0]!.source = { kind: "equirect", url: "media/pano.jpg" } as never;
    const files = new Map<string, Uint8Array>();
    const chunks: Uint8Array[] = [];
    const writer = new ZipWriter((c) => {
      chunks.push(c);
    }, { deflate: false });
    const original = writer.addFile.bind(writer);
    writer.addFile = async (name: string, data: Uint8Array) => {
      files.set(name, data);
      await original(name, data);
    };
    await runExport(
      tour,
      [{ path: "viewer.standalone.js", data: new TextEncoder().encode("/* visor */") }],
      { list: async () => ["media/pano.jpg"], read: async () => new Uint8Array([1, 2, 3]) },
      { singleFile: true, scorm: "1.2" },
      writer,
    );
    const html = new TextDecoder().decode(files.get("index.html"));
    expect(html).toContain("Adaptador SCORM 1.2");
    expect(html).toContain("andarama:state");
    expect(files.has("imsmanifest.xml")).toBe(true);
    // No hay fichero aparte que nadie cargaría
    expect(files.has("scorm-adapter.js")).toBe(false);
  });
});

describe("plantillas", () => {
  it("index.html contiene OG y visor", () => {
    const html = renderIndexHtml({ title: "Mi tour", lang: "es", ogImage: "og.jpg", description: "Desc" });
    expect(html).toContain('property="og:title"');
    expect(html).toContain("viewer/viewer.js");
    expect(html).toContain('lang="es"');
  });

  it("modo accesible pre-renderizado incluye escenas", () => {
    const html = renderAccessibleHtml(sampleTour(), "es");
    expect(html).toContain("<h1>Demo</h1>");
    expect(html).toContain("<h2>Escena A</h2>");
  });

  it("imsmanifest 1.2 y 2004 validos", () => {
    const m12 = renderImsManifest({ version: "1.2", identifier: "x", title: "T", files: ["index.html"] });
    expect(m12).toContain("<schemaversion>1.2</schemaversion>");
    expect(m12).toContain('adlcp:scormtype="sco"');
    const m2004 = renderImsManifest({ version: "2004", identifier: "x", title: "T", files: ["index.html"] });
    expect(m2004).toContain("2004 3rd Edition");
    expect(m2004).toContain('adlcp:scormType="sco"');
  });
});

describe("adaptador SCORM con quiz de varias preguntas", () => {
  /** Ejecuta el adaptador contra un LMS falso y devuelve lo que le escribió. */
  function lms(version: "1.2" | "2004", passing: number | null, quiz: Record<string, unknown>): Map<string, string> {
    const valores = new Map<string, string>();
    const oyentes = new Map<string, (e: unknown) => void>();
    const api =
      version === "2004"
        ? { Initialize: () => "true", SetValue: (k: string, v: string) => valores.set(k, v), Commit: () => "true", Terminate: () => "true" }
        : { LMSInitialize: () => "true", LMSSetValue: (k: string, v: string) => valores.set(k, v), LMSCommit: () => "true", LMSFinish: () => "true" };
    const win: Record<string, unknown> = {
      addEventListener: (tipo: string, fn: (e: unknown) => void) => oyentes.set(tipo, fn),
    };
    win[version === "2004" ? "API_1484_11" : "API"] = api;
    win.parent = win;
    new Function("window", "document", renderScormAdapter(version, passing))(win, { readyState: "complete" });
    oyentes.get("andarama:state")!({ detail: { scenesVisited: 1, scenesTotal: 3, quiz } });
    return valores;
  }

  it("el máximo es la suma de todas las preguntas, no de los marcadores", () => {
    // Un marcador con tres preguntas (1 + 2 + 1 puntos), todas respondidas
    const quiz = { score: 3, maxScore: 4, answered: 3, total: 3, passed: true, detail: [] };
    const v2004 = lms("2004", 70, quiz);
    expect(v2004.get("cmi.score.max")).toBe("4");
    expect(v2004.get("cmi.score.raw")).toBe("3");
    expect(v2004.get("cmi.score.scaled")).toBe("0.7500");
    expect(v2004.get("cmi.success_status")).toBe("passed");
    expect(v2004.get("cmi.completion_status")).toBe("completed");
    const v12 = lms("1.2", 80, quiz);
    expect(v12.get("cmi.core.score.max")).toBe("4");
    expect(v12.get("cmi.core.lesson_status")).toBe("failed");
  });

  it("con preguntas sin responder no hay aprobado ni suspenso", () => {
    const v = lms("2004", 50, { score: 1, maxScore: 4, answered: 1, total: 3, passed: null, detail: [] });
    expect(v.get("cmi.score.max")).toBe("4");
    expect(v.has("cmi.success_status")).toBe(false);
    expect(v.get("cmi.completion_status")).toBe("incomplete");
  });
});

describe("metadatos de compartición", () => {
  it("usa el título y la descripción del tour cuando no hay bloque social", () => {
    const html = renderIndexHtml({ title: "Campus", description: "Visita", lang: "es" });
    expect(html).toContain('<meta property="og:title" content="Campus">');
    expect(html).toContain('<meta property="og:description" content="Visita">');
    expect(html).toContain('content="summary"');
  });

  it("el bloque social manda sobre el título del tour", () => {
    const html = renderIndexHtml({
      title: "Campus",
      lang: "es",
      social: { title: "Visita virtual a Guajara", description: "Recorre el campus", image: "https://x/og.jpg", siteName: "ULL" },
    });
    expect(html).toContain('content="Visita virtual a Guajara"');
    expect(html).toContain('<meta property="og:site_name" content="ULL">');
    expect(html).toContain('content="summary_large_image"');
  });

  it("emite todas las etiquetas pedidas y escapa el contenido", () => {
    const html = renderIndexHtml({
      title: "T",
      lang: "es",
      canonicalUrl: "https://ull.es/t/x",
      social: {
        image: "https://x/og.jpg",
        imageAlt: 'Aula "magna" & patio',
        type: "article",
        locale: "es_ES",
        twitterCard: "summary",
        twitterSite: "@ull",
        twitterCreator: "@saorin",
        noindex: true,
      },
    });
    expect(html).toContain('<meta property="og:image:alt" content="Aula &quot;magna&quot; &amp; patio">');
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).toContain('<meta property="og:locale" content="es_ES">');
    expect(html).toContain('<meta property="og:url" content="https://ull.es/t/x">');
    expect(html).toContain('<meta name="twitter:site" content="@ull">');
    expect(html).toContain('<meta name="twitter:creator" content="@saorin">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });
});
