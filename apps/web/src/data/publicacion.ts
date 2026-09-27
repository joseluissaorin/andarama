/**
 * Cuándo sale un artículo del blog.
 *
 * `fecha` es el día en que la pieza se publica de verdad: un artículo con
 * fecha futura no aparece en la web, ni en los índices, ni en el sitemap,
 * ni en el RSS hasta que llega ese día y se vuelve a construir el sitio.
 * Los borradores nunca salen. En el servidor de desarrollo sale todo, para
 * poder revisarlo.
 */

export interface DatosPublicacion {
  fecha: Date;
  borrador?: boolean;
}

export function estaPublicado(datos: DatosPublicacion, ahora: Date = new Date(), desarrollo = false): boolean {
  if (desarrollo) return true;
  if (datos.borrador === true) return false;
  return datos.fecha.getTime() <= ahora.getTime();
}
