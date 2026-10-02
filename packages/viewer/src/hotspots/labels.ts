/**
 * Etiquetas de los marcadores: se cortan a pocas líneas para no tapar la
 * panorámica, y el texto entero se lee pulsando la etiqueta, que abre la
 * burbuja desplazable de la skin. Antes solo quedaba el `title` al pasar el
 * ratón, que en un móvil no existe.
 */

/** Evento DOM (burbujea) que pide a la skin la burbuja con el texto entero. */
export const LABEL_EXPAND_EVENT = "anda-label-expand";

export interface LabelExpandDetail {
  hotspotId: string;
  text: string;
  /** Botón del marcador: la burbuja se ancla a él. */
  anchor: HTMLElement;
}

/** ¿La etiqueta está cortada (puntos suspensivos)? */
export function isLabelTruncated(box: { scrollHeight: number; clientHeight: number; scrollWidth: number; clientWidth: number }): boolean {
  return box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
}

/**
 * Pulsar la etiqueta abre el texto entero solo si está cortada. Si cabe
 * entera, la pulsación es la del marcador (navegar, abrir el panel). Un
 * tooltip ya abre su burbuja con el mismo texto, y en el editor la etiqueta
 * es parte de lo que se selecciona y se arrastra.
 */
export function shouldExpandLabel(opts: { type: string; editable: boolean; truncated: boolean }): boolean {
  return opts.truncated && !opts.editable && opts.type !== "tooltip";
}
