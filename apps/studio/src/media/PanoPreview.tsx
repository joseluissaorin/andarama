import { useEffect, useRef, useState } from "react";
import { Loader2, Orbit } from "lucide-react";
import { Dialog } from "@ull360/ui";
import { mountViewer, type MountedSkin } from "@ull360/viewer-ui";
import type { Tour } from "@ull360/schema";
import { useT } from "../i18n";
import { littlePlanetFor } from "./littlePlanet";
import type { MediaItem } from "../pages/MediaPage";

/**
 * Comprobar un panorama antes de convertirlo en escena: el ratón encima lo
 * enseña como planeta y el doble clic lo abre en un visor 360 de verdad.
 */

/** Equirect pequeño ya disponible sin pedir nada a la red. */
export function previewEquirect(media: MediaItem): string | null {
  const tiles = media.derivatives.find((d) => d.kind === "tiles");
  const preview = (tiles?.manifest as { preview?: string } | undefined)?.preview;
  if (typeof preview === "string" && preview !== "") return preview;
  // Panorama sin teselar: el original sirve, aunque tarde algo más.
  if (media.kind === "panorama" || media.kind === "image") return `/api/v1/media/${media.id}/file`;
  return null;
}

export function isPano(media: MediaItem): boolean {
  return media.kind === "panorama" || media.derivatives.some((d) => d.kind === "tiles");
}

/** Miniatura que se convierte en little planet al pasar el ratón. */
export function PlanetThumb({ media, className, onOpen360 }: {
  media: MediaItem;
  className?: string;
  /** Abre el visor 360. Si no se pasa, el distintivo no es pulsable. */
  onOpen360?: () => void;
}): React.ReactNode {
  const t = useT();
  const [planet, setPlanet] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const equirect = previewEquirect(media);

  useEffect(() => {
    if (!hover || planet != null || equirect == null) return;
    let alive = true;
    void littlePlanetFor(media.id, equirect).then((url) => {
      if (alive) setPlanet(url);
    });
    return () => {
      alive = false;
    };
  }, [hover, planet, equirect, media.id]);

  const thumb = media.derivatives.some((d) => d.kind === "thumb")
    ? `/api/v1/media/${media.id}/derived/thumb`
    : `/api/v1/media/${media.id}/file`;

  return (
    <div
      className={`relative h-full w-full ${className ?? ""}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <img
        src={thumb}
        alt=""
        loading="lazy"
        className={`h-full w-full object-cover transition-opacity duration-150 ${hover && planet != null ? "opacity-0" : "opacity-100"}`}
      />
      {planet != null && (
        <span
          aria-hidden
          className={`absolute inset-0 flex items-center justify-center bg-[var(--ull-surface-2)] transition-opacity duration-150 ${
            hover ? "opacity-100" : "opacity-0"
          }`}
        >
          <img src={planet} alt="" className="h-full w-auto max-w-none" />
        </span>
      )}
      {/* El distintivo 360 parecía un botón y no lo era: al pulsarlo se abría
          la ficha del fichero. Ahora abre el visor, que es lo que promete. */}
      {onOpen360 != null ? (
        <button
          type="button"
          title={t("open_360")}
          aria-label={t("open_360")}
          className="absolute bottom-1 right-1 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpen360();
          }}
        >
          <Orbit className="h-4 w-4" />
        </button>
      ) : (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100" title="360">
          <Orbit className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}

/**
 * Visor 360 sobre un medio suelto de la biblioteca: se monta con una escena
 * sintética que apunta a los tiles del propio medio, con el preview embebido
 * para que se vea algo desde el primer fotograma.
 */
export function Pano360Dialog({ media, onClose }: { media: MediaItem | null; onClose: () => void }): React.ReactNode {
  const t = useT();
  // El contenido del diálogo se monta cuando se abre, así que el contenedor no
  // existe todavía cuando cambia `media`: hay que esperar a que el nodo llegue.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const skinRef = useRef<MountedSkin | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (media == null || host == null) return;
    setReady(false);
    const tiles = media.derivatives.find((d) => d.kind === "tiles");
    const manifest = (tiles?.manifest ?? {}) as {
      levels?: number;
      tileSize?: number;
      faceSize?: number;
      extension?: string;
      preview?: string;
    };
    const source =
      tiles != null
        ? {
            kind: "multires" as const,
            levels: manifest.levels ?? 1,
            tileSize: manifest.tileSize ?? 512,
            faceSize: manifest.faceSize ?? 512,
            base: `/api/v1/media/${media.id}/tiles`,
            extension: manifest.extension ?? "webp",
            preview: manifest.preview,
          }
        : { kind: "equirect" as const, url: `/api/v1/media/${media.id}/file` };

    const tour: Tour = {
      version: 1,
      meta: { title: media.filename, defaultLang: "es", langs: ["es"] },
      start: { scene: "m" },
      scenes: [{ id: "m", type: "image", title: media.filename, altText: media.filename, source, hotspots: [] }],
      // Cromo mínimo: esto es una comprobación, no una visita
      ui: {
        titleBar: false,
        sceneMenu: false,
        thumbnails: false,
        share: false,
        help: false,
        langSelector: false,
      },
    };

    const mounted = mountViewer({ container: host, tour, baseUrl: "", deepLinks: false });
    skinRef.current = mounted;
    mounted.viewer.on("ready", () => setReady(true));
    return () => {
      skinRef.current?.destroy();
      skinRef.current = null;
    };
  }, [media, host]);

  return (
    <Dialog open={media != null} onOpenChange={(o) => !o && onClose()} title={media?.filename ?? ""} wide>
      <div className="relative h-[60vh] min-h-80 overflow-hidden rounded-xl bg-black">
        <div ref={setHost} className="absolute inset-0" />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/70">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--ull-text-dim)]">{t("pano_preview_hint")}</p>
    </Dialog>
  );
}
