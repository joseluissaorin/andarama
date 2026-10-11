import { describe, expect, it } from "vitest";
import {
  CUBE_FACES,
  CubePanorama,
  TileStore,
  chooseCubeLevel,
  cubeLevelSizes,
  cubeLevelTiles,
  faceModelMatrix,
  vrTargetFaceSize,
  type CubeFace,
  type VrCubeSource,
} from "./panorama.js";
import { spherePoint, type XrRenderer } from "./render.js";
// La geometría del troceador es la que manda: las teselas salen de ella.
import { directionToEquirect, faceDirection } from "../../../../tiler/src/math.js";

/**
 * Carga de escenas en VR (Meta Quest, 7-10-2026): «cargan como en baja
 * resolución y después de un tiempo se ponen en la resolución correcta».
 * El modo VR pinta ahora el cubo de teselas y lo refina por partes.
 */

function aplicar(m: Float32Array, p: [number, number, number]): [number, number, number] {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

describe("cubo de teselas en VR", () => {
  it("cada píxel de cada cara cae donde la esfera pinta ese mismo punto de la panorámica", () => {
    for (const face of CUBE_FACES) {
      for (const [u, v] of [
        [0.5, 0.5],
        [0.1, 0.2],
        [0.9, 0.15],
        [0.25, 0.85],
        [0.7, 0.6],
      ] as const) {
        // El cuadrilátero unidad: +X a la derecha de la imagen, +Y arriba
        const enCubo = norm(aplicar(faceModelMatrix(face), [u - 0.5, 0.5 - v, 0]));
        // El troceador: ese píxel de la cara sale de este punto de la equirectangular…
        const [ue, ve] = directionToEquirect(...faceDirection(face as CubeFace, u, v));
        // …que la esfera de la vista previa pinta en esta dirección
        const enEsfera = spherePoint(ue, ve, 1, true);
        for (let k = 0; k < 3; k++) expect(enCubo[k]).toBeCloseTo(enEsfera[k]!, 2);
      }
    }
  });

  it("las caras quedan a la misma distancia y no dejan rendijas", () => {
    for (const face of CUBE_FACES) {
      const centro = aplicar(faceModelMatrix(face, 10), [0, 0, 0]);
      expect(Math.hypot(...centro)).toBeCloseTo(10, 6);
      // La esquina de la cara llega (un poco más allá de) la arista del cubo
      const esquina = aplicar(faceModelMatrix(face, 10), [0.5, 0.5, 0]);
      expect(Math.max(...esquina.map(Math.abs))).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("nivel de teselas para el visor", () => {
  it("niveles del más pequeño al más grande, como el troceador", () => {
    expect(cubeLevelSizes(2048, 3)).toEqual([512, 1024, 2048]);
    expect(cubeLevelSizes(4096, 4)).toEqual([512, 1024, 2048, 4096]);
  });

  it("en gafas, 2048 por cara (22,8 px/°) aunque haya más; en cartón, 1024", () => {
    expect(vrTargetFaceSize(16384, "xr")).toBe(2048);
    expect(vrTargetFaceSize(16384, "cardboard")).toBe(1024);
    expect(vrTargetFaceSize(1024, "xr")).toBe(1024);
    const sizes = cubeLevelSizes(4096, 4);
    expect(chooseCubeLevel(sizes, 2048)).toBe(2);
    expect(chooseCubeLevel(sizes, 1024)).toBe(1);
    // Una panorámica pequeña se usa entera
    expect(chooseCubeLevel(cubeLevelSizes(1024, 2), 2048)).toBe(1);
  });

  it("primero las teselas que quedan delante de la vista de llegada", () => {
    const src: VrCubeSource = { base: "t", faceSize: 2048, levels: 3, tileSize: 512, extension: "webp" };
    expect(cubeLevelTiles(src, 2)).toHaveLength(6 * 16);
    // yaw 0 mira al centro de la panorámica: la cara f
    expect(cubeLevelTiles(src, 2, 0)[0]!.face).toBe("f");
    // yaw +90° (a la derecha): la cara r; −90°: la l; 180°: la b
    expect(cubeLevelTiles(src, 2, Math.PI / 2)[0]!.face).toBe("r");
    expect(cubeLevelTiles(src, 2, -Math.PI / 2)[0]!.face).toBe("l");
    expect(cubeLevelTiles(src, 2, Math.PI)[0]!.face).toBe("b");
    expect(cubeLevelTiles(src, 2, 0)[0]!.url).toMatch(/^t\/2\/f\/[12]\/[12]\.webp$/);
  });
});

function respuesta(bytes: number): Response {
  return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array(bytes)]) } as unknown as Response;
}

describe("almacén de teselas", () => {
  it("una misma tesela se descarga una sola vez aunque la pidan dos a la vez", async () => {
    let llamadas = 0;
    const store = new TileStore(1000, async () => {
      llamadas++;
      return respuesta(10);
    });
    await Promise.all([store.blob("a"), store.blob("a")]);
    await store.blob("a");
    expect(llamadas).toBe(1);
    expect(store.has("a")).toBe(true);
  });

  it("con el tope de memoria lleno se suelta la más antigua", async () => {
    const store = new TileStore(25, async () => respuesta(10));
    await store.blob("a");
    await store.blob("b");
    await store.blob("a"); // usada otra vez: ahora la más antigua es b
    await store.blob("c");
    expect(store.has("a")).toBe(true);
    expect(store.has("b")).toBe(false);
    expect(store.has("c")).toBe(true);
    expect(store.bytes).toBe(20);
  });

  it("al cambiar de escena se quedan la actual y sus vecinas", async () => {
    const store = new TileStore(1000, async () => respuesta(10));
    for (const u of ["x/a/0/f/0/0.webp", "x/b/0/f/0/0.webp", "x/c/0/f/0/0.webp"]) await store.blob(u);
    store.keepOnly(["x/a/", "x/c/"]);
    expect(store.count).toBe(2);
    expect(store.has("x/b/0/f/0/0.webp")).toBe(false);
  });

  it("la descarga de las vecinas se corta al saltar", async () => {
    const pedidas: string[] = [];
    const store = new TileStore(1000, async (u) => {
      pedidas.push(u);
      await new Promise((r) => setTimeout(r, 1));
      return respuesta(1);
    });
    const ctrl = new AbortController();
    const urls = Array.from({ length: 30 }, (_, i) => `v/${i}`);
    const p = store.prefetch(urls, ctrl.signal, 2);
    await new Promise((r) => setTimeout(r, 3));
    ctrl.abort();
    await p;
    expect(pedidas.length).toBeGreaterThan(0);
    expect(pedidas.length).toBeLessThan(30);
  });
});

/** Renderizador falso: apunta subidas, borrados y dibujos. */
function rendererFalso() {
  let n = 0;
  const log: string[] = [];
  const vivas = new Set<number>();
  const r = {
    quad: {},
    createTexture: () => {
      const t = ++n;
      vivas.add(t);
      return t;
    },
    allocTexture: (w: number) => {
      const t = ++n;
      vivas.add(t);
      log.push(`alloc ${t} ${w}`);
      return t;
    },
    upload: (t: number) => {
      log.push(`upload ${t}`);
      return true;
    },
    uploadSub: (t: number, x: number, y: number) => {
      log.push(`sub ${t} ${x},${y}`);
      return true;
    },
    deleteTexture: (t: number | null) => {
      if (t != null) vivas.delete(t);
    },
    draw: (_g: unknown, _m: unknown, o: { texture: number }) => log.push(`draw ${o.texture}`),
  };
  return { r: r as unknown as XrRenderer, log, vivas };
}

/** Almacén cuya decodificación devuelve al momento (o falla en las URL marcadas). */
class StoreFalso extends TileStore {
  decodificadas: string[] = [];
  constructor(private fallan: (u: string) => boolean = () => false) {
    super(1000, null);
  }
  override async decode(url: string): Promise<TexImageSource> {
    this.decodificadas.push(url);
    await Promise.resolve();
    if (this.fallan(url)) throw new Error("404");
    return { width: 512, height: 512, close: () => {} } as unknown as TexImageSource;
  }
}

const vaciar = async (): Promise<void> => {
  for (let i = 0; i < 200; i++) await Promise.resolve();
};

describe("panorámica en cubo con refinado progresivo", () => {
  const src: VrCubeSource = { base: "p", faceSize: 2048, levels: 3, tileSize: 512, extension: "webp" };
  const identidad = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const mul = (a: Float32Array) => a;

  it("primero el nivel 0 (se ve casi al instante) y después el bueno, tesela a tesela", async () => {
    const { r, log } = rendererFalso();
    const store = new StoreFalso();
    const pano = new CubePanorama(r, src, { store, targetFace: 2048, priorityYaw: 0, concurrency: 4 }).start();
    expect(pano.level).toBe(2);
    expect(pano.stats.tilesTotal).toBe(6 + 96);
    // Las seis primeras peticiones son el nivel 0
    await vaciar();
    expect(store.decodificadas.slice(0, 6).every((u) => u.startsWith("p/0/"))).toBe(true);
    // Y del nivel bueno, primero lo que hay delante (cara f)
    expect(store.decodificadas[6]).toMatch(/^p\/2\/f\//);
    await pano.baseReady;
    await pano.complete;
    expect(pano.stats.tilesDone).toBe(102);
    expect(pano.stats.completeMs).not.toBeNull();
    // Seis texturas de 2048 reservadas y 96 teselas en su sitio
    expect(log.filter((l) => l.startsWith("alloc")).length).toBe(6);
    expect(log.filter((l) => l.startsWith("sub")).length).toBe(96);
    expect(log).toContain("sub 1 1536,1536");
  });

  it("con todas las caras buenas se sueltan las de baja y solo se pinta lo bueno", async () => {
    const { r, log, vivas } = rendererFalso();
    const pano = new CubePanorama(r, src, { store: new StoreFalso(), targetFace: 2048, priorityYaw: null }).start();
    await pano.complete;
    expect(vivas.size).toBe(6);
    expect(pano.covers).toBe(true);
    log.length = 0;
    pano.draw(identidad, mul);
    expect(log.filter((l) => l.startsWith("draw"))).toHaveLength(6);
  });

  it("mientras tanto se pinta la etapa baja debajo y la buena encima (con huecos transparentes)", async () => {
    const { r, log } = rendererFalso();
    // El nivel bueno de la cara b no llega: queda la de baja debajo
    const store = new StoreFalso((u) => u.startsWith("p/2/b/0/0"));
    const pano = new CubePanorama(r, src, { store, targetFace: 2048, priorityYaw: 0 }).start();
    await pano.complete;
    log.length = 0;
    pano.draw(identidad, mul);
    const draws = log.filter((l) => l.startsWith("draw"));
    // 5 caras completas (1 dibujo) + la b con su etapa baja y la buena (2)
    expect(draws).toHaveLength(7);
  });

  it("al soltar la escena no se sube nada más y se borran sus texturas", async () => {
    const { r, log, vivas } = rendererFalso();
    const pano = new CubePanorama(r, src, { store: new StoreFalso(), targetFace: 2048, priorityYaw: 0, concurrency: 1 }).start();
    pano.dispose();
    const subidas = log.length;
    await vaciar();
    expect(log.length).toBe(subidas);
    expect(vivas.size).toBe(0);
    await pano.complete; // no se queda colgada
  });

  it("sabe si una escena vecina está ya descargada entera", async () => {
    const { r } = rendererFalso();
    const store = new TileStore(10_000_000, async () => respuesta(5));
    const pano = new CubePanorama(r, src, { store, targetFace: 2048, priorityYaw: 0 });
    expect(pano.allCached()).toBe(false);
    await store.prefetch(pano.urls(), new AbortController().signal);
    expect(pano.allCached()).toBe(true);
  });
});
