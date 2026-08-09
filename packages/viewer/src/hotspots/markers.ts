import type { Hotspot, PolygonHotspot, Scene } from "@ull360/schema";
import { resolveL10n } from "@ull360/schema";
import { createIconSvg, DEFAULT_ICON_BY_TYPE, sanitizeSvg } from "./icons.js";
import { evalConditions, type VariableStore } from "../engine/state.js";
import { resolveUrl } from "../engine/sources.js";

/**
 * Gestor de marcadores de hotspot de una escena.
 *
 * Estructura DOM en dos niveles: Marzipano reescribe `display` y `transform`
 * del elemento raíz en cada frame, así que el raíz es un ancla vacía y todo
 * el estilo vive en un botón interior centrado con translate(-50%,-50%).
 * La etiqueta se posiciona en absoluto bajo el chip: su anchura nunca puede
 * desplazar el ancla ni desbordar el botón.
 */

export interface MarkerCallbacks {
  onActivate: (hotspot: Hotspot, element: HTMLElement | null) => void;
  lang: () => string;
  defaultLang: string;
  baseUrl: string;
  /** Modo edición: permite arrastrar marcadores para reposicionarlos. */
  editable?: boolean;
  onDrag?: (hotspot: Hotspot, yaw: number, pitch: number, phase: "move" | "end") => void;
}

interface ManagedMarker {
  hotspot: Hotspot;
  /** Ancla que posiciona Marzipano (no estilizar). */
  anchor: HTMLElement;
  /** Botón interior con todo el estilo y los listeners. */
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
  private boundViewer: any = null;

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
      const anchor = document.createElement("div");
      anchor.className = "ull360-hotspot-anchor";
      const el = this.buildMarkerElement(hotspot);
      anchor.appendChild(el);
      let marz: any;
      if (hotspot.type === "videoFile" && hotspot.mode === "projected" && hotspot.corners?.length === 4) {
        // Pantalla proyectada: hotspot con perspectiva (plano en la esfera).
        const { center, widthDeg } = projectedRect(hotspot.corners);
        const radius = 1200;
        const widthPx = 2 * radius * Math.tan(((widthDeg / 2) * Math.PI) / 180);
        const video = document.createElement("video");
        video.src = resolveUrl(this.callbacks.baseUrl, hotspot.url);
        video.crossOrigin = "anonymous";
        video.loop = hotspot.loop ?? true;
        video.muted = hotspot.muted ?? true;
        video.autoplay = hotspot.autoplay ?? true;
        video.playsInline = true;
        video.style.width = `${widthPx}px`;
        video.setAttribute("aria-label", this.label(hotspot));
        el.replaceChildren(video);
        el.classList.add("ull360-hotspot--projected");
        marz = hotspotContainer.createHotspot(anchor, { yaw: center.yaw, pitch: center.pitch }, { perspective: { radius } });
        void video.play().catch(() => {});
      } else {
        marz = hotspotContainer.createHotspot(anchor, { yaw: hotspot.yaw, pitch: hotspot.pitch });
      }
      const managed: ManagedMarker = { hotspot, anchor, element: el, marzipanoHotspot: marz, visible: true };
      if (this.callbacks.editable === true) this.attachDrag(managed);
      this.markers.push(managed);
    }
    if (this.polygons.length > 0) {
      this.boundViewer = this.marzScene.viewer();
      this.boundViewer.addEventListener?.("viewChange", this.updatePolygons);
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

    // Envoltorio de escala: recibe la propiedad CSS `scale` (no `transform`),
    // de modo que compone con el hover del chip y con la flecha de suelo.
    const scaleWrap = document.createElement("span");
    scaleWrap.className = "ull360-hotspot__scale";

    const iconWrap = document.createElement("span");
    iconWrap.className = "ull360-hotspot__icon";
    if (style?.icon?.chip !== false) iconWrap.classList.add("ull360-hotspot__icon--chip");
    iconWrap.style.width = `${size}px`;
    iconWrap.style.height = `${size}px`;
    if (style?.icon?.size != null) iconWrap.style.minWidth = iconWrap.style.minHeight = `${size}px`;
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
    scaleWrap.appendChild(iconWrap);
    el.appendChild(scaleWrap);

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
      if (el.dataset.dragged === "1") {
        delete el.dataset.dragged;
        return;
      }
      this.callbacks.onActivate(hotspot, el);
    });
    return el;
  }

  /** Arrastre de marcadores en modo edición (reposicionar yaw/pitch). */
  private attachDrag(m: ManagedMarker): void {
    const el = m.element;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (down: PointerEvent) => {
      if (down.button !== 0) return;
      down.stopPropagation();
      const startX = down.clientX;
      const startY = down.clientY;
      let moved = false;
      const rect = (): DOMRect => this.container.getBoundingClientRect();
      const toCoords = (e: PointerEvent): { yaw: number; pitch: number } | null => {
        const r = rect();
        try {
          return this.view.screenToCoordinates({ x: e.clientX - r.left, y: e.clientY - r.top });
        } catch {
          return null;
        }
      };
      const onMove = (e: PointerEvent): void => {
        if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
        moved = true;
        el.dataset.dragged = "1";
        el.classList.add("ull360-hotspot--dragging");
        const c = toCoords(e);
        if (c == null) return;
        m.hotspot.yaw = c.yaw;
        m.hotspot.pitch = c.pitch;
        try {
          m.marzipanoHotspot.setPosition({ yaw: c.yaw, pitch: c.pitch });
        } catch {
          // la escena pudo destruirse durante el arrastre
        }
        this.callbacks.onDrag?.(m.hotspot, c.yaw, c.pitch, "move");
      };
      const onUp = (e: PointerEvent): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        el.classList.remove("ull360-hotspot--dragging");
        if (moved) {
          const c = toCoords(e);
          if (c != null) this.callbacks.onDrag?.(m.hotspot, c.yaw, c.pitch, "end");
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
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

  /**
   * Reproyecta los polígonos a coordenadas de pantalla. Cada arista se
   * subdivide para que el contorno siga los grandes círculos y el polígono
   * no se deforme cuando parte de sus vértices sale del encuadre.
   */
  updatePolygons = (): void => {
    if (this.polygons.length === 0) return;
    const SUBDIV = 6;
    for (const poly of this.polygons) {
      if (!poly.visible) {
        poly.path.setAttribute("d", "");
        continue;
      }
      const src = poly.hotspot.points;
      const sampled: { yaw: number; pitch: number }[] = [];
      for (let i = 0; i < src.length; i++) {
        const a = src[i]!;
        const b = src[(i + 1) % src.length]!;
        let dyaw = b.yaw - a.yaw;
        if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
        if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
        for (let s = 0; s < SUBDIV; s++) {
          const t = s / SUBDIV;
          sampled.push({ yaw: a.yaw + dyaw * t, pitch: a.pitch + (b.pitch - a.pitch) * t });
        }
      }
      const pts: ({ x: number; y: number } | null)[] = sampled.map((p) => {
        try {
          return this.view.coordinatesToScreen({ yaw: p.yaw, pitch: p.pitch });
        } catch {
          return null;
        }
      });
      const visible = pts.filter((p): p is { x: number; y: number } => p != null);
      // Si más de la mitad del contorno queda fuera, mejor no dibujar nada
      // que dibujar un parche deformado.
      if (visible.length < 3 || visible.length < pts.length * 0.4) {
        poly.path.setAttribute("d", "");
        continue;
      }
      const d = `M ${visible.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`;
      poly.path.setAttribute("d", d);
    }
  };

  /** Escala por distancia/zoom via la propiedad CSS `scale` (compone con hover y flechas). */
  updateScale(fov: number): void {
    const scale = Math.min(2.2, Math.max(0.5, REFERENCE_FOV / Math.max(0.15, fov)));
    const value = scale.toFixed(3);
    for (const m of this.markers) {
      if (m.hotspot.style?.distanceScale === false) continue;
      const wrap = m.element.querySelector<HTMLElement>(".ull360-hotspot__scale");
      if (wrap != null) wrap.style.scale = value;
    }
  }

  /** Reevalúa condiciones de visibilidad (sobre el botón interior, que Marzipano no toca). */
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
    this.boundViewer?.removeEventListener?.("viewChange", this.updatePolygons);
    this.boundViewer = null;
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
