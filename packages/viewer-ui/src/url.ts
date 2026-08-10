/**
 * Resolución de rutas del arranque autónomo. Módulo sin dependencias del DOM
 * para poder probarlo fuera del navegador.
 */

/**
 * Directorio que contiene el tour.json: es la base para resolver los medios.
 * En un paquete exportado la URL es simplemente "tour.json" (sin barras) y la
 * base debe quedar vacía, es decir, el propio directorio del documento.
 * Recortar el último segmento a ciegas producía "tour.json/a/tiles/…" y dejaba
 * el tour sin panoramas en cualquier alojamiento estático.
 */
export function baseFromTourUrl(tourUrl: string | undefined): string {
  if (tourUrl == null) return "";
  const clean = tourUrl.split(/[?#]/)[0]!;
  const slash = clean.lastIndexOf("/");
  return slash < 0 ? "" : clean.slice(0, slash);
}
