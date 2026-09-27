/**
 * Coordenadas de las escenas planas (gigapíxel 2D).
 *
 * La vista plana de Marzipano trabaja en fracciones de la imagen {x, y}
 * (0 = izquierda/arriba, 1 = derecha/abajo), no en ángulos. Los hotspots se
 * guardan siempre como yaw/pitch, así que en una escena plana se traducen a
 * «ángulos equivalentes»: el centro de la imagen es 0/0, el borde izquierdo
 * −π y el derecho π, arriba −π/2 y abajo π/2. Antes los marcadores se creaban
 * con yaw/pitch sobre la vista plana, el arrastre leía `undefined` y todos se
 * quedaban clavados en el centro.
 */

export interface FlatPoint {
  x: number;
  y: number;
}

export interface Angles {
  yaw: number;
  pitch: number;
}

export function anglesToFlat(a: Angles): FlatPoint {
  return { x: a.yaw / (2 * Math.PI) + 0.5, y: a.pitch / Math.PI + 0.5 };
}

export function flatToAngles(p: FlatPoint): Angles {
  const x = Math.min(1, Math.max(0, p.x));
  const y = Math.min(1, Math.max(0, p.y));
  return { yaw: (x - 0.5) * 2 * Math.PI, pitch: (y - 0.5) * Math.PI };
}

/**
 * Traduce lo que devuelve `screenToCoordinates` de cualquier vista a yaw/pitch.
 * En la plana llega {x, y}; en las demás, ya {yaw, pitch}.
 */
export function viewCoordsToAngles(c: unknown, flat: boolean): Angles | null {
  if (c == null || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (flat) {
    if (typeof o.x !== "number" || typeof o.y !== "number" || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return null;
    return flatToAngles({ x: o.x, y: o.y });
  }
  if (typeof o.yaw !== "number" || typeof o.pitch !== "number" || !Number.isFinite(o.yaw) || !Number.isFinite(o.pitch)) return null;
  return { yaw: o.yaw, pitch: o.pitch };
}

/** Lo contrario: la posición que entiende la vista de Marzipano. */
export function anglesToViewCoords(a: Angles, flat: boolean): Angles | FlatPoint {
  return flat ? anglesToFlat(a) : { yaw: a.yaw, pitch: a.pitch };
}
