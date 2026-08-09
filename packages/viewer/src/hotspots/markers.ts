import type { Hotspot, PolygonHotspot, Scene } from "@ull360/schema";
import { resolveL10n } from "@ull360/schema";
import { createIconSvg, DEFAULT_ICON_BY_TYPE, sanitizeSvg } from "./icons.js";
import { evalConditions, type VariableStore } from "../engine/state.js";

/**
 * Gestor de marcadores de hotspot de una escena: crea los elementos DOM
 * anclados a la esfera (via HotspotContainer de Marzipano), el overlay SVG
 * de poligonos proyectados, la visibilidad condicional (idioma, variables,
 * rango temporal de video) y el escalado por distancia/zoom.
 */

export interface MarkerCallbacks {
  onActivate: (hotspot: Hotspot, element: HTMLElement | null) => void;
  lang: () => string;
  defaultLang: string;
}

interface ManagedMarker {
  hotspot: Hotspot;
  element: HTMLElement;
  marzipanoHotspot: any;
  visible: boolean;
}

const REFERENCE_FOV = 1.2;

export class SceneMarkers {
  private markers: ManagedMarker[] = [];
  private polygonSvg: SVGSVGElement | null = null;
  private polygons: { hotspot: PolygonHotspot; path: SVGPathElement; visible: boolean }[] = [];
  private videoTime: number | null = null;

  constructor(
    private scene: Scene,
    private marzScene: any,
    private view: any,
    private container: HTMLElement,
    private vars: VariableStore,
    private callbacks: MarkerCallbacks,
  ) {
    this.build();
  }

  private label(hotspot: Hotspot): string {
    const lang = this.callbacks.lang();
    return (
      resolveL10n(hotspot.label, lang, this.callbacks.defaultLang) ||
      resolveL10n(hotspot.altText, lang, this.callbacks.defaultLang) ||
      hotspot.type
    );
  }

  private build(): void {
    const hotspotContainer = this.marzScene.hotspotContainer();
    for (const hotspot of this.scene.hotspots) {
      if (hotspot.type === "polygon") {
        this.buildPolygon(hotspot);
        continue;
      }
      const el = this.buildMarkerElement(hotspot);
      let marz: any;
      if (hotspot.type === "videoFile" && hotspot.mode === "projected" && hotspot.corners?.length === 4) {
        // Pantalla proyectada: hotspot con perspectiva (plano en la esfera).
        const { center, widthDeg } = projectedRect(hotspot.corners);
        const radius = 1200;
        const widthPx = 2 * radius * Math.tan(((widthDeg / 2) * Math.PI) / 180);
        const video = document.createElement("video");
        video.src = hotspot.url;
        video.crossOrigin = "anonymous";
        video.loop = hotspot.loop ?? true;
        video.muted = hotspot.muted ?? true;
        video.autoplay = hotspot.autoplay ?? true;
        video.playsInline = true;
        video.style.width = `${widthPx}px`;
        video.setAttribute("aria-label", this.label(hotspot));
        el.replaceChildren(video);
        el.classList.add("ull360-hotspot--projected");
        marz = hotspotContainer.createHotspot(el, { yaw: center.yaw, pitch: center.pitch }, { perspective: { radius } });
        void video.play().catch(() => {});
      } else {
        marz = hotspotContainer.createHotspot(el, { yaw: hotspot.yaw, pitch: hotspot.pitch });
      }
      this.markers.push({ hotspot, element: el, marzipanoHotspot: marz, visible: true });
    }
    if (this.polygons.length > 0) {
      this.marzScene.viewer().addEventListener?.("viewChange", this.updatePolygons);
    }
    this.updateVisibility(null);
  }

  private buildMarkerElement(hotspot: Hotspot): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `ull360-hotspot ull360-hotspot--${hotspot.type}`;
    el.setAttribute("aria-label", this.label(hotspot));
    el.dataset.hotspotId = hotspot.id;
    const style = hotspot.style;
    const size = style?.icon?.size ?? 44;
    const color = style?.icon?.color ?? "#ffffff";
    if (style?.className != null) el.classList.add(...style.className.split(/\s+/));
    if (style?.pulse === true) el.classList.add("ull360-hotspot--pulse");
    if ((hotspot as { variant?: string }).variant === "floorArrow") {
      el.classList.add("ull360-hotspot--floor-arrow");
    }

    const iconWrap = document.createElement("span");
    iconWrap.className = "ull360-hotspot__icon";
    if (style?.icon?.chip !== false) iconWrap.classList.add("ull360-hotspot__icon--chip");
    iconWrap.style.width = `${size}px`;
    iconWrap.style.height = `${size}px`;
    if (style?.icon?.svg != null) {
      iconWrap.innerHTML = sanitizeSvg(style.icon.svg);
      const svg = iconWrap.querySelector("svg");
      if (svg != null) {
        svg.setAttribute("width", String(Math.round(size * 0.55)));
        svg.setAttribute("height", String(Math.round(size * 0.55)));
      }
    } else if (style?.icon?.url != null) {
      const img = document.createElement("img");
      img.src = style.icon.url;
      img.alt = "";
      img.style.width = `${Math.round(size * 0.7)}px`;
      iconWrap.appendChild(img);
    } else {
      iconWrap.appendChild(
        createIconSvg(style?.icon?.name ?? DEFAULT_ICON_BY_TYPE[hotspot.type], Math.round(size * 0.55), color),
      );
    }
    el.appendChild(iconWrap);

    const labelText = resolveL10n(hotspot.label, this.callbacks.lang(), this.callbacks.defaultLang);
    if (labelText !== "" && hotspot.labelVisibility !== "never") {
      const label = document.createElement("span");
      label.className = "ull360-hotspot__label";
      if ((hotspot.labelVisibility ?? "hover") === "hover") label.classList.add("ull360-hotspot__label--hover");
      label.textContent = labelText;
      el.appendChild(label);
    }
    const tooltipText = resolveL10n(hotspot.tooltip, this.callbacks.lang(), this.callbacks.defaultLang);
    if (tooltipText !== "") el.title = tooltipText;

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onActivate(hotspot, el);
    });
    return el;
  }

  private buildPolygon(hotspot: PolygonHotspot): void {
    if (this.polygonSvg == null) {
      this.polygonSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.polygonSvg.setAttribute("class", "ull360-polygons");
      this.polygonSvg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;";
      this.container.appendChild(this.polygonSvg);
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", hotspot.fill ?? "#0ea5e9");
    path.setAttribute("fill-opacity", String(hotspot.fillOpacity ?? 0.25));
    path.setAttribute("stroke", hotspot.stroke ?? "#0ea5e9");
    path.setAttribute("stroke-width", String(hotspot.strokeWidth ?? 2));
    path.style.pointerEvents = "auto";
    path.style.cursor = "pointer";
    path.setAttribute("role", "button");
    path.setAttribute("tabindex", "0");
    path.setAttribute("aria-label", this.label(hotspot));
    const activate = (): void => this.callbacks.onActivate(hotspot, null);
    path.addEventListener("click", activate);
    path.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") {
        e.preventDefault();
        activate();
      }
    });
    if (hotspot.hoverFill != null) {
      path.addEventListener("mouseenter", () => path.setAttribute("fill", hotspot.hoverFill!));
      path.addEventListener("mouseleave", () => path.setAttribute("fill", hotspot.fill ?? "#0ea5e9"));
    }
    this.polygonSvg.appendChild(path);
    this.polygons.push({ hotspot, path, visible: true });
  }

  /** Reproyecta los poligonos a coordenadas de pantalla. Llamar en cada viewChange. */
  updatePolygons = (): void => {
    if (this.polygons.length === 0) return;
    for (const poly of this.polygons) {
      if (!poly.visible) {
        poly.path.setAttribute("d", "");
        continue;
      }
      const pts: ({ x: number; y: number } | null)[] = poly.hotspot.points.map((p) => {
        try {
          return this.view.coordinatesToScreen({ yaw: p.yaw, pitch: p.pitch });
        } catch {
          return null;
        }
      });
      const visible = pts.filter((p): p is { x: number; y: number } => p != null);
      if (visible.length < 3) {
        poly.path.setAttribute("d", "");
        continue;
      }
      const d = `M ${visible.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`;
      poly.path.setAttribute("d", d);
    }
  };

  /** Escala por distancia/zoom: los marcadores crecen al hacer zoom. */
  updateScale(fov: number): void {
    const scale = Math.min(2.2, Math.max(0.5, REFERENCE_FOV / Math.max(0.15, fov)));
    for (const m of this.markers) {
      if (m.hotspot.style?.distanceScale === false) continue;
      const icon = m.element.querySelector<HTMLElement>(".ull360-hotspot__icon");
      if (icon != null) icon.style.transform = `scale(${scale.toFixed(3)})`;
    }
  }

  /** Reevalua condiciones de visibilidad. */
  updateVisibility(videoTime: number | null): void {
    this.videoTime = videoTime;
    const lang = this.callbacks.lang();
    for (const m of this.markers) {
      const visible = evalConditions(m.hotspot.conditions, this.vars, lang, videoTime);
      if (visible !== m.visible) {
        m.visible = visible;
        m.element.style.display = visible ? "" : "none";
      }
    }
    for (const p of this.polygons) {
      const visible = evalConditions(p.hotspot.conditions, this.vars, lang, videoTime);
      if (visible !== p.visible) {
        p.visible = visible;
        if (!visible) p.path.setAttribute("d", "");
      }
    }
    this.updatePolygons();
  }

  /** Foco de teclado sobre el primer hotspot visible. */
  focusFirst(): void {
    const first = this.markers.find((m) => m.visible);
    first?.element.focus();
  }

  elementFor(hotspotId: string): HTMLElement | null {
    return this.markers.find((m) => m.hotspot.id === hotspotId)?.element ?? null;
  }

  destroy(): void {
    const hotspotContainer = this.marzScene.hotspotContainer();
    for (const m of this.markers) {
      try {
        hotspotContainer.destroyHotspot(m.marzipanoHotspot);
      } catch {
        // ya destruido con la escena
      }
    }
    this.markers = [];
    this.polygonSvg?.remove();
    this.polygonSvg = null;
    this.polygons = [];
  }
}

function projectedRect(corners: { yaw: number; pitch: number }[]): {
  center: { yaw: number; pitch: number };
  widthDeg: number;
  heightDeg: number;
} {
  const yaws = corners.map((c) => c.yaw);
  const pitches = corners.map((c) => c.pitch);
  const center = {
    yaw: yaws.reduce((a, b) => a + b, 0) / yaws.length,
    pitch: pitches.reduce((a, b) => a + b, 0) / pitches.length,
  };
  const widthDeg = ((Math.max(...yaws) - Math.min(...yaws)) * 180) / Math.PI;
  const heightDeg = ((Math.max(...pitches) - Math.min(...pitches)) * 180) / Math.PI;
  return { center, widthDeg, heightDeg };
}
