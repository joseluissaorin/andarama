/**
 * Secciones plegables del panel de propiedades.
 *
 * Antes salían todas abiertas y el panel era una pared de campos. Una docente
 * lo dijo así: «me gusta más que las propiedades aparezcan comprimidas y que
 * solo se expandan cuando se pulsa». Ahora salen plegadas (salvo las que se
 * vienen a tocar siempre) y cada sección recuerda cómo la dejó quien edita.
 */

export const SECTION_KEY_PREFIX = "andarama:section:";

type MiniStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): MiniStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // modo privado o sin almacenamiento: se usa lo que diga la sección
    return null;
  }
}

/** ¿Está abierta la sección? Lo guardado manda; si no hay nada, el valor por defecto. */
export function readSectionOpen(id: string, defaultOpen: boolean, storage: MiniStorage | null = defaultStorage()): boolean {
  try {
    const raw = storage?.getItem(SECTION_KEY_PREFIX + id);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // almacenamiento inaccesible
  }
  return defaultOpen;
}

/** Recuerda si la sección se ha dejado abierta o plegada. */
export function writeSectionOpen(id: string, open: boolean, storage: MiniStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(SECTION_KEY_PREFIX + id, open ? "1" : "0");
  } catch {
    // sin almacenamiento la preferencia dura lo que la pestaña
  }
}
