import type { MediaItem } from "../pages/MediaPage";
import type { SceneRow } from "../stores";
import { clientId } from "../editor/editorApi";

/**
 * Arrastrar medios de la biblioteca al editor. El tipo propio del portapapeles
 * distingue este arrastre del de ficheros del sistema, que sigue significando
 * «subir»: al soltar sobre el grafo o la lista de escenas se crean escenas.
 */
export const MEDIA_DRAG_TYPE = "application/x-anda-media";

export interface MediaDragItem {
  id: string;
  filename: string;
  kind: string;
  /** true si es un panorama esférico: solo estos pueden ser escena 360. */
  pano: boolean;
  video: boolean;
}

/** Proporción 2:1 (con margen): la de una foto esférica equirectangular. */
export function isEquirectAspect(width: number | null, height: number | null): boolean {
  if (width == null || height == null || height === 0) return false;
  const r = width / height;
  return r > 1.9 && r < 2.1;
}

export function mediaDragPayload(media: MediaItem): MediaDragItem {
  const aspectKnown = media.width != null && media.height != null;
  return {
    id: media.id,
    filename: media.filename,
    kind: media.kind,
    // Una imagen que no es 2:1 no es un panorama aunque esté teselada: sale
    // como escena plana (gigapíxel 2D) y no como esfera deformada.
    pano:
      media.kind === "panorama" ||
      isEquirectAspect(media.width, media.height) ||
      (!aspectKnown && media.derivatives.some((d) => d.kind === "tiles")),
    video: media.kind === "video",
  };
}

/** Tipo de escena que corresponde a un medio: vídeo 360, panorama o plana. */
export function sceneTypeOf(item: Pick<MediaDragItem, "pano" | "video">): SceneRow["type"] {
  return item.video ? "video" : item.pano ? "image" : "flat";
}

/**
 * Lo mismo a partir de un medio de la biblioteca. «Nueva escena» daba por
 * panorama cualquier imagen y una foto normal acababa estirada en una esfera.
 */
export function sceneTypeForMedia(media: MediaItem): SceneRow["type"] {
  return sceneTypeOf(mediaDragPayload(media));
}

/** Lee el arrastre si es de medios; null si es cualquier otra cosa. */
export function readMediaDrag(dataTransfer: DataTransfer): MediaDragItem[] | null {
  const raw = dataTransfer.getData(MEDIA_DRAG_TYPE);
  if (raw === "") return null;
  try {
    const items = JSON.parse(raw) as MediaDragItem[];
    return Array.isArray(items) && items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

/**
 * true si el arrastre en curso trae medios. Durante `dragover` el contenido no
 * se puede leer (el navegador lo oculta), pero sí los tipos.
 */
export function hasMediaDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(MEDIA_DRAG_TYPE);
}

/** Título de escena a partir del nombre del fichero, sin extensión ni guiones. */
export function sceneTitleFromFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  if (base === "") return filename;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Crea escenas a partir de medios arrastrados. Vive aquí y no en cada vista
 * para que soltar en el grafo y soltar en la lista produzcan exactamente lo
 * mismo.
 *
 * Un medio que ya es escena del tour no se vuelve a crear: soltar dos veces la
 * misma foto duplicaba la escena. Esas se devuelven en `reused` para avisar y
 * seleccionarlas. Las imágenes que no son 2:1 salen como escena plana.
 */
export function scenesFromMedia(
  draft: { scenes: SceneRow[]; settings: Record<string, unknown> },
  projectId: string,
  items: MediaDragItem[],
): { created: string[]; reused: string[] } {
  const ids: string[] = [];
  const reused: string[] = [];
  for (const item of items) {
    const existing = draft.scenes.find((s) => s.mediaId === item.id);
    if (existing != null) {
      reused.push(existing.id);
      continue;
    }
    const id = clientId();
    draft.scenes.push({
      id,
      projectId,
      sort: draft.scenes.length,
      title: sceneTitleFromFilename(item.filename),
      type: sceneTypeOf(item),
      mediaId: item.id,
      sourceJson: null,
      initialViewJson: null,
      limitsJson: null,
      audioJson: null,
      mapJson: null,
      metaJson: JSON.stringify({ thumbnail: `thumb:${item.id}` }),
    });
    ids.push(id);
  }
  if (draft.settings.startScene == null && ids[0] != null) draft.settings.startScene = ids[0];
  return { created: ids, reused };
}
