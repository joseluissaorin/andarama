import type { MediaItem } from "../pages/MediaPage";
import type { SceneRow } from "../stores";
import { clientId } from "../editor/editorApi";

/**
 * Arrastrar medios de la biblioteca al editor. El tipo propio del portapapeles
 * distingue este arrastre del de ficheros del sistema, que sigue significando
 * «subir»: al soltar sobre el grafo o la lista de escenas se crean escenas.
 */
export const MEDIA_DRAG_TYPE = "application/x-ull360-media";

export interface MediaDragItem {
  id: string;
  filename: string;
  kind: string;
  /** true si tiene tiles o es panorama: solo estos pueden ser escena 360. */
  pano: boolean;
  video: boolean;
}

export function mediaDragPayload(media: MediaItem): MediaDragItem {
  return {
    id: media.id,
    filename: media.filename,
    kind: media.kind,
    pano: media.kind === "panorama" || media.derivatives.some((d) => d.kind === "tiles"),
    video: media.kind === "video",
  };
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
 */
export function scenesFromMedia(
  draft: { scenes: SceneRow[]; settings: Record<string, unknown> },
  projectId: string,
  items: MediaDragItem[],
): string[] {
  const ids: string[] = [];
  for (const item of items) {
    const id = clientId();
    draft.scenes.push({
      id,
      projectId,
      sort: draft.scenes.length,
      title: sceneTitleFromFilename(item.filename),
      type: item.video ? "video" : "image",
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
  return ids;
}
