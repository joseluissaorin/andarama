/**
 * ¿Se abre el plano al empezar? Solo si el autor lo pide, el tour tiene plano
 * y la pantalla es lo bastante ancha para que el minimapa no tape el
 * panorama: en un móvil sigue a un toque del botón del mapa.
 */
export function shouldOpenFloorplanAtStart(tour: { ui?: { floorplanOpen?: boolean }; floorplans?: unknown[] }, viewportWidth: number): boolean {
  return tour.ui?.floorplanOpen === true && (tour.floorplans?.length ?? 0) > 0 && viewportWidth >= 720;
}
