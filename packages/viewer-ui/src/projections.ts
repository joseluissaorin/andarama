import type { Projection } from "@andarama/schema";

export const ALL_PROJECTIONS: readonly Projection[] = ["rectilinear", "littlePlanet", "fisheye", "pannini", "architectural"];

/**
 * Proyecciones que el visitante puede elegir según `ui.projections`:
 * sin ajuste (o `true`), todas; `false`, ninguna; una lista, esas y en el
 * orden de siempre. La normal se añade siempre que haya algo más que
 * elegir, para que haya forma de volver a ella.
 */
export function allowedProjections(setting: boolean | readonly Projection[] | undefined): Projection[] {
  if (setting === false) return [];
  if (setting == null || setting === true) return [...ALL_PROJECTIONS];
  const elegidas = new Set(setting.filter((p) => ALL_PROJECTIONS.includes(p)));
  if (elegidas.size === 0) return [];
  elegidas.add("rectilinear");
  return ALL_PROJECTIONS.filter((p) => elegidas.has(p));
}
