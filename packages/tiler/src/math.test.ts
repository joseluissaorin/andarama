import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  computePyramid,
  directionToEquirect,
  enumerateTiles,
  FACE_BASES,
  FACES,
  faceDirection,
  rotationMatrix,
  tileKey,
  totalTileCount,
} from "./math.js";

describe("computePyramid", () => {
  it("calcula niveles correctos para cara 4096", () => {
    const levels = computePyramid(4096, 512);
    expect(levels.map((l) => l.size)).toEqual([512, 1024, 2048, 4096]);
    expect(levels.map((l) => l.tiles)).toEqual([1, 2, 4, 8]);
  });

  it("cara 8192 (equirect 32K) da 5 niveles", () => {
    const levels = computePyramid(8192, 512);
    expect(levels.length).toBe(5);
    expect(levels[levels.length - 1]!.size).toBe(8192);
    expect(levels[levels.length - 1]!.tiles).toBe(16);
  });

  it("cara pequena da un nivel", () => {
    expect(computePyramid(512, 512)).toEqual([{ level: 0, size: 512, tiles: 1 }]);
  });

  it("totalTileCount coincide con enumerateTiles", () => {
    const count = totalTileCount(2048, 512);
    let n = 0;
    for (const _ of enumerateTiles(2048, 512)) n++;
    expect(count).toBe(n);
    expect(count).toBe(6 * (1 + 4 + 16));
  });
});

describe("geometria de caras", () => {
  it("el centro de cada cara apunta a su eje", () => {
    expect(faceDirection("f", 0.5, 0.5)).toEqual([0, 0, 1]);
    expect(faceDirection("b", 0.5, 0.5)).toEqual([-0, 0, -1]);
    expect(faceDirection("r", 0.5, 0.5)).toEqual([1, 0, -0]);
    expect(faceDirection("l", 0.5, 0.5)).toEqual([-1, 0, 0]);
    expect(faceDirection("u", 0.5, 0.5)).toEqual([0, 1, -0]);
    expect(faceDirection("d", 0.5, 0.5)).toEqual([0, -1, 0]);
  });

  it("el frente mapea al centro del equirect", () => {
    const [u, v] = directionToEquirect(0, 0, 1);
    expect(u).toBeCloseTo(0.5);
    expect(v).toBeCloseTo(0.5);
  });

  it("mirar arriba mapea al borde superior", () => {
    const [, v] = directionToEquirect(0, 1, 0);
    expect(v).toBeCloseTo(0);
  });

  it("rotacion identidad no altera direcciones", () => {
    const m = rotationMatrix(0, 0, 0);
    const v = applyMatrix(m, [0.3, -0.4, 0.86]);
    expect(v[0]).toBeCloseTo(0.3);
    expect(v[1]).toBeCloseTo(-0.4);
    expect(v[2]).toBeCloseTo(0.86);
  });

  it("yaw de 90 grados gira el frente hacia la derecha", () => {
    const m = rotationMatrix(Math.PI / 2, 0, 0);
    const v = applyMatrix(m, [0, 0, 1]);
    expect(v[0]).toBeCloseTo(1);
    expect(v[2]).toBeCloseTo(0);
  });
});

describe("tileKey", () => {
  it("genera el layout {base}/{z}/{f}/{y}/{x}.{ext}", () => {
    expect(tileKey("tiles/m1", { level: 2, face: "f", x: 3, y: 1 }, "webp")).toBe("tiles/m1/2/f/1/3.webp");
  });
});

describe("orientación de las caras del cubo", () => {
  it("mirar arriba cae en la primera fila de la equirectangular", () => {
    expect(directionToEquirect(0, 1, 0)[1]).toBeCloseTo(0, 6);
    expect(directionToEquirect(0, -1, 0)[1]).toBeCloseTo(1, 6);
  });

  it("la cara de arriba mira arriba y la de abajo, abajo", () => {
    // Cualquier punto de la cara u apunta al cenit; el de la cara d, al nadir
    for (const [u, v] of [[0.5, 0.5], [0.1, 0.9], [0.9, 0.1]]) {
      expect(faceDirection("u", u!, v!)[1]).toBeGreaterThan(0);
      expect(faceDirection("d", u!, v!)[1]).toBeLessThan(0);
    }
  });

  it("las bases inyectadas en el troceador del navegador dan las mismas direcciones", () => {
    // El worker calcula dir = z + a*x + b*y con a = 2u-1 y b = 1-2v
    for (const face of FACES) {
      for (const [u, v] of [[0.25, 0.25], [0.5, 0.5], [0.8, 0.3]]) {
        const a = 2 * u! - 1;
        const b = 1 - 2 * v!;
        const base = FACE_BASES[face];
        const conBases: [number, number, number] = [
          base.z[0] + a * base.x[0] + b * base.y[0],
          base.z[1] + a * base.x[1] + b * base.y[1],
          base.z[2] + a * base.x[2] + b * base.y[2],
        ];
        // `+ 0` normaliza el cero negativo, que toEqual distingue
        expect(conBases.map((n) => n + 0)).toEqual(faceDirection(face, u!, v!).map((n) => n + 0));
      }
    }
  });

  it("el techo de la equirectangular acaba en la cara de arriba", () => {
    // Centro de la cara u -> cenit -> fila 0; centro de la d -> nadir -> fila 1
    expect(directionToEquirect(...faceDirection("u", 0.5, 0.5))[1]).toBeCloseTo(0, 6);
    expect(directionToEquirect(...faceDirection("d", 0.5, 0.5))[1]).toBeCloseTo(1, 6);
  });

  it("el frente queda derecho: arriba de la imagen es arriba del mundo", () => {
    const arriba = directionToEquirect(...faceDirection("f", 0.5, 0.05))[1];
    const abajo = directionToEquirect(...faceDirection("f", 0.5, 0.95))[1];
    expect(arriba).toBeLessThan(abajo);
  });
});
