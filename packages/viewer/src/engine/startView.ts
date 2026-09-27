import { DEFAULT_VIEW, type Tour, type ViewParams } from "@andarama/schema";

/**
 * Vista con la que arranca el recorrido.
 *
 * Orden: la del enlace profundo, la fijada para todo el tour (solo si se
 * arranca en la escena inicial) y, si no hay ninguna, la vista inicial de la
 * propia escena, que es la que se fija con «Usar vista actual» en el editor.
 * Antes se caía directamente en DEFAULT_VIEW y la vista guardada no se usaba
 * nunca al abrir el recorrido.
 */
export function resolveStartView(
  tour: Pick<Tour, "start" | "scenes">,
  link: { sceneId?: string | null; view?: Partial<ViewParams> | null },
): ViewParams {
  const sceneId = link.sceneId ?? tour.start.scene;
  const enLaInicial = link.sceneId == null || link.sceneId === tour.start.scene;
  const escena = tour.scenes.find((s) => s.id === sceneId);
  const base: ViewParams =
    (enLaInicial ? (tour.start.view as ViewParams | undefined) : undefined) ??
    (escena?.initialView as ViewParams | undefined) ??
    { ...DEFAULT_VIEW };
  // Un enlace profundo puede traer solo parte de la vista (p. ej. el rumbo)
  return link.view != null ? ({ ...base, ...link.view } as ViewParams) : { ...base };
}
