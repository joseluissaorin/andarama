/**
 * Matematicas del pipeline de tiles: piramide multirresolucion y geometria
 * de caras de cubo. Compartidas por el tiler de navegador y el de Node.
 *
 * Convenio de caras (igual que Marzipano/krpano): f, b, l, r, u, d.
 * faceSize = anchoEquirect / 4. Tiles de 512 px por defecto.
 */

export const FACES = ["f", "b", "l", "r", "u", "d"] as const;
export type Face = (typeof FACES)[number];

export interface PyramidLevel {
  /** Indice de nivel (0 = mas pequeno). */
  level: number;
  /** Tamano de cara en px en este nivel. */
  size: number;
  /** Tiles por eje. */
  tiles: number;
}

/**
 * Ajusta el tamano de cara al esquema tileSize * 2^k (512, 1024, 2048...).
 * Marzipano exige que cada nivel sea multiplo exacto del tileSize, y con
 * halving eso solo se cumple con caras potencia-de-dos del tile. Se
 * redondea hacia ARRIBA (el reproyector muestrea el original a resolucion
 * completa, asi que no se pierde detalle) con tope en maxFace.
 */
export function snapFaceSize(rawFace: number, tileSize = 512, maxFace = 8192): number {
  let size = tileSize;
  while (size < rawFace && size < maxFace) size *= 2;
  return Math.min(size, maxFace);
}

/** Calcula la piramide de niveles para un tamano de cara dado. */
export function computePyramid(faceSize: number, tileSize = 512): PyramidLevel[] {
  const sizes: number[] = [];
  let s = faceSize;
  for (;;) {
    sizes.unshift(s);
    if (s <= tileSize) break;
    s = Math.ceil(s / 2);
  }
  return sizes.map((size, level) => ({ level, size, tiles: Math.ceil(size / tileSize) }));
}

/** Numero total de tiles de una piramide (para validacion de manifiestos). */
export function totalTileCount(faceSize: number, tileSize = 512): number {
  return computePyramid(faceSize, tileSize).reduce((acc, l) => acc + l.tiles * l.tiles * 6, 0);
}

/**
 * Direccion 3D del pixel (u, v) en [0,1] de una cara del cubo.
 * Sistema: +z hacia la cara f, +x derecha (cara r), +y arriba (cara u).
 */
export function faceDirection(face: Face, u: number, v: number): [number, number, number] {
  const a = 2 * u - 1;
  const b = 1 - 2 * v; // v crece hacia abajo en imagen
  switch (face) {
    case "f":
      return [a, b, 1];
    case "b":
      return [-a, b, -1];
    case "r":
      return [1, b, -a];
    case "l":
      return [-1, b, a];
    case "u":
      return [a, 1, -b];
    case "d":
      return [a, -1, b];
  }
}

/** Direccion -> coordenadas equirectangulares en [0,1]. */
export function directionToEquirect(x: number, y: number, z: number): [number, number] {
  const len = Math.hypot(x, y, z);
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;
  const lon = Math.atan2(nx, nz); // [-PI, PI], 0 = frente
  const lat = Math.asin(Math.max(-1, Math.min(1, ny))); // [-PI/2, PI/2]
  return [(lon + Math.PI) / (2 * Math.PI), 1 - (lat + Math.PI / 2) / Math.PI];
}

/** Matriz de rotacion (yaw, pitch, roll) para nivelado de horizonte y punto cero. */
export function rotationMatrix(yaw: number, pitch: number, roll: number): number[] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry(yaw) * Rx(pitch) * Rz(roll)
  return [
    cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp,
    cp * sr, cp * cr, -sp,
    -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp,
  ];
}

export function applyMatrix(m: number[], v: [number, number, number]): [number, number, number] {
  return [
    m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
    m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
    m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
  ];
}

export interface TileManifest {
  levels: number;
  tileSize: number;
  faceSize: number;
  extension: string;
  formats: string[];
  tileCount: number;
  /** Preview equirect pequeno como data URI. */
  preview?: string;
}

export interface TileRef {
  level: number;
  face: Face;
  x: number;
  y: number;
}

/** Clave de almacenamiento de un tile: {prefijo}/{z}/{cara}/{y}/{x}.{ext} */
export function tileKey(prefix: string, tile: TileRef, extension: string): string {
  return `${prefix.replace(/\/$/, "")}/${tile.level}/${tile.face}/${tile.y}/${tile.x}.${extension}`;
}

/** Enumera todos los tiles de una piramide. */
export function* enumerateTiles(faceSize: number, tileSize = 512): Generator<TileRef> {
  for (const level of computePyramid(faceSize, tileSize)) {
    for (const face of FACES) {
      for (let y = 0; y < level.tiles; y++) {
        for (let x = 0; x < level.tiles; x++) {
          yield { level: level.level, face, x, y };
        }
      }
    }
  }
}
