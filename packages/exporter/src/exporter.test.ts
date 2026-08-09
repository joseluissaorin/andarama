import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tour } from "@ull360/schema";
import {
  buildZip,
  filterTourLangs,
  limitTourResolution,
  renderAccessibleHtml,
  renderImsManifest,
  renderIndexHtml,
  runExport,
  stripDownloads,
  ZipWriter,
  type AssetProvider,
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
    const dir = mkdtempSync(join(tmpdir(), "ull360-zip-"));
    const zipPath = join(dir, "test.zip");
    writeFileSync(zipPath, zip);
    const listing = execFileSync("unzip", ["-l", zipPath]).toString();
    expect(listing).toContain("index.html");
    expect(listing).toContain("dir/tour.json");
    const check = execFileSync("unzip", ["-t", zipPath]).toString();
    expect(check).toContain("No errors detected");
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
    const dir = mkdtempSync(join(tmpdir(), "ull360-export-"));
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
