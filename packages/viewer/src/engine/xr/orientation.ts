/**
 * Orientación del móvil para el modo cartón.
 *
 * El primer intento traducía alpha y beta a yaw y pitch directamente. Eso solo
 * se parece a la realidad con el teléfono vertical y quieto: en cuanto se gira
 * a horizontal —que es como se mete en unas gafas de cartón— los ejes dejan de
 * significar lo mismo y la escena aparece invertida. Además se perdía el
 * balanceo de la cabeza, que en estéreo se nota enseguida.
 *
 * Aquí se hace lo que se debe: componer el cuaternión del dispositivo,
 * enderezarlo para que la cámara mire al horizonte y compensar el ángulo de
 * rotación de la pantalla.
 */

export type Quat = [number, number, number, number];

const DEG = Math.PI / 180;

/**
 * Cuaternión del dispositivo. Los ángulos del evento se componen en el orden
 * YXZ con (beta, alpha, -gamma): es la convención de la especificación de
 * orientación, y equivocarse aquí es exactamente lo que hacía que la escena
 * saliera invertida.
 */
export function quatFromEuler(alphaDeg: number, betaDeg: number, gammaDeg: number): Quat {
  const x = betaDeg * DEG;
  const y = alphaDeg * DEG;
  const z = -gammaDeg * DEG;
  const c1 = Math.cos(x / 2);
  const s1 = Math.sin(x / 2);
  const c2 = Math.cos(y / 2);
  const s2 = Math.sin(y / 2);
  const c3 = Math.cos(z / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Enderezar: el dispositivo tumbado mira al suelo, la cámara debe mirar al frente. */
const UPRIGHT: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

/**
 * Orientación de la cámara a partir de un evento de orientación y del ángulo
 * de la pantalla (0 en vertical, 90 o -90 al girar el teléfono).
 */
export function cameraQuaternion(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  screenAngleDeg: number,
): Quat {
  let q = quatFromEuler(alphaDeg, betaDeg, gammaDeg);
  q = quatMultiply(q, UPRIGHT);
  // Compensar el giro de la pantalla alrededor del eje de visión
  const half = -screenAngleDeg * DEG * 0.5;
  return quatMultiply(q, [0, 0, Math.sin(half), Math.cos(half)]);
}

/**
 * Matriz de vista (mundo → cámara) desde el cuaternión de la cámara. Es la
 * traspuesta de la matriz de rotación, en columna-mayor para WebGL.
 */
export function viewMatrixFromQuat(q: Quat): Float32Array {
  const [x, y, z, w] = q;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  // Rotación de la cámara (columnas = ejes de la cámara en el mundo)
  const r = [
    1 - (yy + zz), xy + wz, xz - wy,
    xy - wz, 1 - (xx + zz), yz + wx,
    xz + wy, yz - wx, 1 - (xx + yy),
  ];
  // La vista es la inversa: para una rotación, su traspuesta
  return new Float32Array([
    r[0]!, r[3]!, r[6]!, 0,
    r[1]!, r[4]!, r[7]!, 0,
    r[2]!, r[5]!, r[8]!, 0,
    0, 0, 0, 1,
  ]);
}

/** Hacia dónde mira la cámara: el eje -Z girado por el cuaternión. */
export function forwardFromQuat(q: Quat): [number, number, number] {
  const [x, y, z, w] = q;
  return [
    -(2 * (x * z + w * y)),
    -(2 * (y * z - w * x)),
    -(1 - 2 * (x * x + y * y)),
  ];
}

/**
 * Gira la cámara alrededor de la vertical del mundo. El rumbo resultante es el
 * anterior **menos** el ángulo, que es justo lo que hace falta para descontar
 * hacia dónde apuntaba el móvil al entrar.
 */
export function rotateAroundWorldY(q: Quat, angle: number): Quat {
  const half = angle * 0.5;
  return quatMultiply([0, Math.sin(half), 0, Math.cos(half)], q);
}

/** Vertical de la cámara: el eje +Y girado por el cuaternión. */
export function upFromQuat(q: Quat): [number, number, number] {
  const [x, y, z, w] = q;
  return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
}

/** Yaw y pitch equivalentes, para el resto del motor y para el visor plano. */
export function yawPitchFromQuat(q: Quat): { yaw: number; pitch: number } {
  const [fx, fy, fz] = forwardFromQuat(q);
  return {
    yaw: Math.atan2(fx, -fz),
    pitch: Math.asin(Math.max(-1, Math.min(1, fy))),
  };
}

/** Ángulo de la pantalla en grados, con los respaldos de siempre. */
export function screenAngle(): number {
  const orientation = (screen as unknown as { orientation?: { angle?: number } }).orientation;
  if (typeof orientation?.angle === "number") return orientation.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}
