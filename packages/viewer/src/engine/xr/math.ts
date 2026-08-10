/**
 * Utilidades de álgebra para el modo XR. Todas las matrices son 4x4 en
 * columna-mayor, el convenio de WebGL y de WebXR (XRRigidTransform.matrix,
 * XRView.projectionMatrix), de modo que se pueden pasar tal cual a la GPU.
 */

export type Vec3 = [number, number, number];

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vecScale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function vecLength(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function vecDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function vecNormalize(a: Vec3): Vec3 {
  const len = vecLength(a);
  return len < 1e-8 ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
}

/** Posición (columna de traslación) de una matriz de transformación. */
export function matPosition(m: Float32Array | number[]): Vec3 {
  return [m[12]!, m[13]!, m[14]!];
}

/** Eje -Z de la matriz: la dirección "hacia delante" de un espacio XR. */
export function matForward(m: Float32Array | number[]): Vec3 {
  return vecNormalize([-m[8]!, -m[9]!, -m[10]!]);
}

/** Eje +Y de la matriz. */
export function matUp(m: Float32Array | number[]): Vec3 {
  return vecNormalize([m[4]!, m[5]!, m[6]!]);
}

export function matIdentity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function matMultiply(a: Float32Array | number[], b: Float32Array | number[]): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Matriz de traslación + escala uniforme (suficiente para esferas de joints). */
export function matTranslateScale(p: Vec3, scale: number): Float32Array {
  return new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, p[0], p[1], p[2], 1]);
}

export function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

/** Matriz de vista para el modo cardboard (cámara en el origen). */
export function viewMatrix(yaw: number, pitch: number): Float32Array {
  const cy = Math.cos(-yaw);
  const sy = Math.sin(-yaw);
  const cp = Math.cos(-pitch);
  const sp = Math.sin(-pitch);
  return new Float32Array([cy, sy * sp, -sy * cp, 0, 0, cp, sp, 0, sy, -cy * sp, cy * cp, 0, 0, 0, 0, 1]);
}

/** Dirección unitaria desde yaw/pitch en el convenio del visor (yaw 0 mira a -Z). */
export function dirFromYawPitch(yaw: number, pitch: number): Vec3 {
  return [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
}

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/**
 * Intersección rayo-esfera. Devuelve la distancia al primer impacto o null.
 * Se usa para los billboards de hotspot, tratados como esferas de radio fijo.
 */
export function raySphere(ray: Ray, center: Vec3, radius: number): number | null {
  const oc = vecSub(ray.origin, center);
  const b = 2 * vecDot(oc, ray.direction);
  const c = vecDot(oc, oc) - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / 2;
  const t2 = (-b + sq) / 2;
  const t = t1 >= 0 ? t1 : t2;
  return t >= 0 ? t : null;
}

/**
 * Intersección rayo-rectángulo orientado (el panel de contenido). Devuelve la
 * distancia y las coordenadas locales normalizadas [0,1] del impacto, con
 * (0,0) en la esquina superior izquierda del panel.
 */
export function rayRect(
  ray: Ray,
  center: Vec3,
  right: Vec3,
  up: Vec3,
  halfWidth: number,
  halfHeight: number,
): { distance: number; u: number; v: number } | null {
  const normal = vecNormalize(vecCross(right, up));
  const denom = vecDot(normal, ray.direction);
  if (Math.abs(denom) < 1e-6) return null;
  const t = vecDot(vecSub(center, ray.origin), normal) / denom;
  if (t < 0) return null;
  const hit = vecAdd(ray.origin, vecScale(ray.direction, t));
  const local = vecSub(hit, center);
  const x = vecDot(local, vecNormalize(right));
  const y = vecDot(local, vecNormalize(up));
  if (Math.abs(x) > halfWidth || Math.abs(y) > halfHeight) return null;
  return { distance: t, u: (x + halfWidth) / (2 * halfWidth), v: 1 - (y + halfHeight) / (2 * halfHeight) };
}
