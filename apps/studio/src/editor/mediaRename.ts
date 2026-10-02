import { api } from "../api";

/**
 * Renombrar la foto al renombrar la escena.
 *
 * El título de la escena y el nombre del fichero iban por separado: en la
 * biblioteca seguía saliendo «IMG_20240312_1015.jpg». Se ofrecía al cambiar el
 * título en el panel de propiedades, pero no al renombrar desde el grafo (F2 o
 * menú contextual); ahora las dos vías comparten esta lógica.
 */

export interface MediaRenameOffer {
  mediaId: string;
  from: string;
  to: string;
}

/**
 * Nombre que tendría el fichero con el título de la escena, conservando la
 * extensión. null si no hay nada que cambiar.
 */
export function mediaRenameTarget(filename: string, title: string): string | null {
  const clean = title.trim();
  if (clean === "") return null;
  const ext = /\.[a-z0-9]+$/i.exec(filename)?.[0] ?? "";
  const to = `${clean.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 190)}${ext}`;
  return to === filename ? null : to;
}

/** Pregunta al servidor si procede ofrecer el cambio de nombre. */
export async function findMediaRename(mediaId: string | null, title: string): Promise<MediaRenameOffer | null> {
  if (mediaId == null || title.trim() === "") return null;
  try {
    const info = await api<{ filename: string; scenes: number }>(`/media/${mediaId}`);
    // Una foto que usan otras escenas (de este u otro recorrido) no se toca
    if (info.scenes > 1) return null;
    const to = mediaRenameTarget(info.filename, title);
    return to == null ? null : { mediaId, from: info.filename, to };
  } catch {
    // sin permiso sobre el medio o sin red: no se ofrece nada
    return null;
  }
}
