/**
 * Operaciones de colocación del lienzo, sin React ni DOM para poder probarlas.
 *
 * Alinear, repartir y ordenar son lo que separa un lienzo de nodos de un
 * tablero de pegatinas: sin ellas, un grafo de treinta escenas queda torcido
 * para siempre porque nadie va a cuadrarlo a mano.
 */

export interface NodePos {
  x: number;
  y: number;
}

export interface NodeSize {
  w: number;
  h: number;
}

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Rectángulo que envuelve a un conjunto de nodos. */
export function boundsOf(positions: Record<string, NodePos>, ids: string[], size: NodeSize): { x0: number; y0: number; x1: number; y1: number } | null {
  const pts = ids.map((id) => positions[id]).filter((p): p is NodePos => p != null);
  if (pts.length === 0) return null;
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x + size.w)),
    y1: Math.max(...pts.map((p) => p.y + size.h)),
  };
}

export function alignNodes(
  positions: Record<string, NodePos>,
  ids: string[],
  kind: AlignKind,
  size: NodeSize,
): Record<string, NodePos> {
  const box = boundsOf(positions, ids, size);
  if (box == null || ids.length < 2) return positions;
  const next = { ...positions };
  for (const id of ids) {
    const p = positions[id];
    if (p == null) continue;
    switch (kind) {
      case "left":
        next[id] = { ...p, x: box.x0 };
        break;
      case "right":
        next[id] = { ...p, x: box.x1 - size.w };
        break;
      case "hcenter":
        next[id] = { ...p, x: (box.x0 + box.x1) / 2 - size.w / 2 };
        break;
      case "top":
        next[id] = { ...p, y: box.y0 };
        break;
      case "bottom":
        next[id] = { ...p, y: box.y1 - size.h };
        break;
      case "vcenter":
        next[id] = { ...p, y: (box.y0 + box.y1) / 2 - size.h / 2 };
        break;
    }
  }
  return next;
}

/**
 * Reparte los nodos con la misma separación entre el primero y el último, que
 * se quedan donde están: mover los extremos sorprende.
 */
export function distributeNodes(
  positions: Record<string, NodePos>,
  ids: string[],
  axis: "h" | "v",
  size: NodeSize,
): Record<string, NodePos> {
  const present = ids.filter((id) => positions[id] != null);
  if (present.length < 3) return positions;
  const key = axis === "h" ? "x" : "y";
  const extent = axis === "h" ? size.w : size.h;
  const sorted = [...present].sort((a, b) => positions[a]![key] - positions[b]![key]);
  const first = positions[sorted[0]!]![key];
  const last = positions[sorted[sorted.length - 1]!]![key];
  // Hueco igual entre bordes; con nodos del mismo tamaño equivale a centros
  // repartidos, que es lo que espera cualquiera que haya usado Figma.
  const totalGap = last - first - extent * (sorted.length - 1);
  const gap = totalGap / (sorted.length - 1);
  const next = { ...positions };
  sorted.forEach((id, i) => {
    if (i === 0 || i === sorted.length - 1) return;
    const value = first + i * (extent + gap);
    next[id] = axis === "h" ? { ...positions[id]!, x: value } : { ...positions[id]!, y: value };
  });
  return next;
}

/** Líneas de alineación con las que se ha enganchado el arrastre. */
export interface SnapResult {
  dx: number;
  dy: number;
  vertical: number[];
  horizontal: number[];
}

/**
 * Imán a los demás nodos: compara bordes y centros del bloque que se arrastra
 * con los de los nodos quietos y devuelve la corrección más cercana.
 */
export function snapToNeighbours(
  positions: Record<string, NodePos>,
  movingIds: string[],
  others: string[],
  size: NodeSize,
  tolerance = 6,
): SnapResult {
  const box = boundsOf(positions, movingIds, size);
  const result: SnapResult = { dx: 0, dy: 0, vertical: [], horizontal: [] };
  if (box == null) return result;
  const myX = [box.x0, (box.x0 + box.x1) / 2, box.x1];
  const myY = [box.y0, (box.y0 + box.y1) / 2, box.y1];
  let bestX: { delta: number; line: number } | null = null;
  let bestY: { delta: number; line: number } | null = null;
  for (const id of others) {
    const p = positions[id];
    if (p == null) continue;
    for (const line of [p.x, p.x + size.w / 2, p.x + size.w]) {
      for (const mine of myX) {
        const delta = line - mine;
        if (Math.abs(delta) <= tolerance && (bestX == null || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, line };
        }
      }
    }
    for (const line of [p.y, p.y + size.h / 2, p.y + size.h]) {
      for (const mine of myY) {
        const delta = line - mine;
        if (Math.abs(delta) <= tolerance && (bestY == null || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, line };
        }
      }
    }
  }
  if (bestX != null) {
    result.dx = bestX.delta;
    result.vertical.push(bestX.line);
  }
  if (bestY != null) {
    result.dy = bestY.delta;
    result.horizontal.push(bestY.line);
  }
  return result;
}

/** Escena mínima que necesita el auto-orden. */
export interface LayoutScene {
  id: string;
  area: string | null;
}

export interface LayoutArea {
  id: string;
  level?: number;
}

/**
 * Auto-orden por niveles desde la escena inicial, **respetando las áreas**:
 * cada área ocupa su propia banda horizontal, ordenadas de la planta más alta
 * a la más baja, y dentro de cada banda las escenas se reparten por distancia
 * a la inicial. Mezclar plantas en el mismo BFS producía un plano de metro.
 */
export function autoLayoutByArea(
  scenes: LayoutScene[],
  edges: { from: string; to: string }[],
  areas: LayoutArea[],
  start: string | undefined,
  size: NodeSize,
  gap = { x: 90, y: 48, band: 96 },
): { positions: Record<string, NodePos>; bands: { area: string | null; y0: number; y1: number }[] } {
  const depth = new Map<string, number>();
  if (start != null) {
    const adj = new Map<string, string[]>();
    for (const e of edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    depth.set(start, 0);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nxt of adj.get(cur) ?? []) {
        if (!depth.has(nxt)) {
          depth.set(nxt, depth.get(cur)! + 1);
          queue.push(nxt);
        }
      }
    }
  }

  // Orden de las bandas: nivel descendente (arriba las plantas altas), las
  // áreas sin nivel después y lo que no tiene área al final.
  const used = [...new Set(scenes.map((s) => s.area))];
  const withArea = used.filter((a): a is string => a != null);
  withArea.sort((a, b) => {
    const la = areas.find((x) => x.id === a)?.level;
    const lb = areas.find((x) => x.id === b)?.level;
    if (la == null && lb == null) return a.localeCompare(b);
    if (la == null) return 1;
    if (lb == null) return -1;
    return lb - la;
  });
  const order: (string | null)[] = [...withArea, ...(used.includes(null) ? [null] : [])];

  const positions: Record<string, NodePos> = {};
  const bands: { area: string | null; y0: number; y1: number }[] = [];
  let cursorY = 0;
  for (const areaId of order) {
    const members = scenes.filter((s) => s.area === areaId);
    if (members.length === 0) continue;
    const rows = new Map<number, number>();
    let loose = 0;
    let maxRow = 0;
    for (const scene of members) {
      const d = depth.get(scene.id);
      // Las inalcanzables se apartan a una columna previa en vez de mezclarse
      const column = d ?? -1;
      const row = d == null ? loose++ : (rows.get(d) ?? 0);
      if (d != null) rows.set(d, row + 1);
      maxRow = Math.max(maxRow, row);
      positions[scene.id] = { x: column * (size.w + gap.x), y: cursorY + row * (size.h + gap.y) };
    }
    const height = (maxRow + 1) * size.h + maxRow * gap.y;
    bands.push({ area: areaId, y0: cursorY, y1: cursorY + height });
    cursorY += height + gap.band;
  }
  return { positions, bands };
}
