/**
 * Sonido propio de una escena (ambiente, narración o fuentes espaciales).
 *
 * «Silenciar» en la barra del lienzo solo calla el editor. Para que una
 * escena no suene en el recorrido publicado, el autor la desactiva: se marca
 * `muted: true` en su audio, los ficheros elegidos se conservan y el
 * compilador no publica nada de él (apps/api/src/compiler.ts).
 */

type AudioShape = { ambient?: { url?: string }; narration?: { url?: string }; spatial?: unknown[]; muted?: boolean };

function parse<T>(json: string | null, fallback: T): T {
  if (json == null || json === "") return fallback;
  try {
    const value = JSON.parse(json) as unknown;
    return value != null && typeof value === "object" && !Array.isArray(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

/** "none" si no tiene sonido propio, "on" si suena y "off" si está desactivado. */
export function sceneOwnAudio(audioJson: string | null): "none" | "on" | "off" {
  const audio = parse<AudioShape>(audioJson, {});
  const has = audio.ambient?.url != null || audio.narration?.url != null || (Array.isArray(audio.spatial) && audio.spatial.length > 0);
  if (!has) return "none";
  return audio.muted === true ? "off" : "on";
}

/** Activa o desactiva el sonido propio de la escena en su JSON de audio. */
export function setSceneAudioMuted(audioJson: string | null, muted: boolean): string | null {
  const audio = parse<Record<string, unknown>>(audioJson, {});
  if (muted) audio.muted = true;
  else delete audio.muted;
  return Object.keys(audio).length > 0 ? JSON.stringify(audio) : null;
}
