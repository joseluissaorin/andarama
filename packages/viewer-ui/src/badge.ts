/**
 * Texto de la insignia «Hecho con Andarama»: el propio del autor
 * (`ui.badgeText`) si lo hay, si no el traducido. Se recorta para que la
 * insignia siga siendo una insignia y no un rótulo.
 */
export function badgeLabel(custom: string | undefined, fallback: string): string {
  const limpio = typeof custom === "string" ? custom.trim() : "";
  return limpio !== "" ? limpio.slice(0, 80) : fallback;
}
