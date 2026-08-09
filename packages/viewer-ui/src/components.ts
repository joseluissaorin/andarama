import type { Floorplan, Scene, Tour } from "@ull360/schema";
import { createIconSvg, resolveUrl, type TourViewer } from "@ull360/viewer";
import { el, iconButton, toast } from "./dom.js";
import type { Translator } from "./i18n.js";

/**
 * Componentes de interfaz: menu de escenas con categorias y busqueda,
 * carrusel de miniaturas, brujula, plano de planta con radar multi-planta,
 * mapa geografico (Leaflet/OSM), pantallas de bienvenida y final, ayuda de
 * controles y dialogo de compartir.
 */

export function buildSceneMenu(viewer: TourViewer, t: Translator, baseUrl: string): {
  root: HTMLElement;
  toggle: () => void;
  refresh: () => void;
} {
  const tour = viewer.tour;
  const root = el("nav", { className: "ull360-scenemenu", "data-open": "false", "aria-label": t("scenes") });
  const closeBtn = el("button", { className: "ull360-btn", "aria-label": t("close") });
  closeBtn.appendChild(createIconSvg("x", 18));
  const head = el("div", { className: "ull360-scenemenu__head" }, el("h2", { text: t("scenes") }), closeBtn);
  const searchWrap = el("div", { className: "ull360-scenemenu__search" });
  const search = el("input", { type: "search", placeholder: t("search_scenes"), "aria-label": t("search_scenes") });
  searchWrap.appendChild(search);
  const list = el("div", { className: "ull360-scenemenu__list" });
  root.append(head, searchWrap, list);

  const render = (filter: string): void => {
    list.replaceChildren();
    const groups = new Map<string, Scene[]>();
    for (const scene of tour.scenes) {
      if (scene.hidden === true) continue;
      const title = viewer.text(scene.title);
      if (filter !== "" && !title.toLowerCase().includes(filter.toLowerCase())) continue;
      const cat = viewer.text(scene.category) || "";
      const arr = groups.get(cat) ?? [];
      arr.push(scene);
      groups.set(cat, arr);
    }
    if (groups.size === 0) {
      list.appendChild(el("p", { text: t("no_results"), style: "color:var(--u3-fg-dim);" }));
      return;
    }
    for (const [cat, scenes] of groups) {
      if (cat !== "") list.appendChild(el("div", { className: "ull360-scenemenu__cat", text: cat }));
      for (const scene of scenes) {
        const item = el("button", {
          className: "ull360-scenemenu__item",
          type: "button",
          "aria-current": viewer.currentSceneId() === scene.id ? "true" : "false",
        });
        if (scene.thumbnail != null) {
          item.appendChild(el("img", { src: resolveUrl(baseUrl, scene.thumbnail), alt: "" }));
        }
        item.appendChild(el("span", { text: viewer.text(scene.title) }));
        item.addEventListener("click", () => {
          void viewer.goTo(scene.id);
          setOpen(false);
        });
        list.appendChild(item);
      }
    }
  };

  const setOpen = (open: boolean): void => {
    root.dataset.open = String(open);
    if (open) {
      render(search.value);
      search.focus();
    }
  };
  closeBtn.addEventListener("click", () => setOpen(false));
  search.addEventListener("input", () => render(search.value));
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
  viewer.on("sceneChange", () => {
    if (root.dataset.open === "true") render(search.value);
  });
  return {
    root,
    toggle: () => setOpen(root.dataset.open !== "true"),
    refresh: () => render(search.value),
  };
}

export function buildThumbnails(viewer: TourViewer, t: Translator, baseUrl: string): HTMLElement {
  const root = el("div", { className: "ull360-thumbs", role: "tablist", "aria-label": t("scenes") });
  for (const scene of viewer.tour.scenes) {
    if (scene.hidden === true || scene.thumbnail == null) continue;
    const btn = el("button", {
      type: "button",
      role: "tab",
      "aria-label": viewer.text(scene.title),
      "aria-current": "false",
      "data-scene": scene.id,
    });
    btn.appendChild(el("img", { src: resolveUrl(baseUrl, scene.thumbnail), alt: "" }));
    btn.addEventListener("click", () => void viewer.goTo(scene.id));
    root.appendChild(btn);
  }
  const update = (): void => {
    root.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-current", b.dataset.scene === viewer.currentSceneId() ? "true" : "false");
    });
  };
  viewer.on("sceneChange", update);
  viewer.on("ready", update);
  return root;
}

export function buildCompass(viewer: TourViewer, t: Translator): HTMLElement {
  const root = el("div", { className: "ull360-compass", role: "img", "aria-label": t("compass"), title: t("compass") });
  const icon = createIconSvg("navigation", 22);
  root.appendChild(icon);
  viewer.on("viewChange", (v) => {
    icon.style.transform = `rotate(${(-v.yaw * 180) / Math.PI - 45}deg)`;
  });
  root.addEventListener("click", () => viewer.lookTo({ yaw: 0 }, 600));
  return root;
}

// ---------------------------------------------------------------------------
// Plano de planta con radar + mapa geografico
// ---------------------------------------------------------------------------

export function buildMapPanel(viewer: TourViewer, t: Translator, baseUrl: string): {
  root: HTMLElement;
  toggle: () => void;
  available: boolean;
} {
  const tour = viewer.tour;
  const floorplans = tour.floorplans ?? [];
  const hasGeo = tour.geoMap?.enabled === true && tour.scenes.some((s) => s.map?.lat != null);
  const available = floorplans.length > 0 || hasGeo;
  const root = el("div", { className: "ull360-mappanel", hidden: true });
  if (!available) return { root, toggle: () => {}, available };

  const closeBtn = el("button", { className: "ull360-btn", "aria-label": t("close"), style: "width:36px;height:36px;" });
  closeBtn.appendChild(createIconSvg("x", 16));
  const title = el("span", { text: floorplans.length > 0 ? t("floorplan") : t("map") });
  root.appendChild(el("div", { className: "ull360-mappanel__head" }, title, closeBtn));
  closeBtn.addEventListener("click", () => {
    root.hidden = true;
  });

  let currentFloor: string | null = null;
  const holder = el("div");
  root.appendChild(holder);

  const renderFloorplan = (fp: Floorplan): void => {
    currentFloor = fp.id;
    const wrap = el("div", { className: "ull360-floorplan" });
    const img = el("img", { src: resolveUrl(baseUrl, fp.url), alt: viewer.text(fp.title) });
    wrap.appendChild(img);
    // Radar de orientacion (cono SVG que gira con la vista)
    const radar = el("div", { className: "ull360-floorplan__radar", hidden: true });
    radar.innerHTML =
      '<svg viewBox="0 0 90 90" width="90" height="90" aria-hidden="true"><defs><linearGradient id="u3cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--u3-primary)" stop-opacity=".65"/><stop offset="1" stop-color="var(--u3-primary)" stop-opacity="0"/></linearGradient></defs><path d="M45 45 L27 8 A41 41 0 0 1 63 8 Z" fill="url(#u3cone)"/></svg>';
    wrap.appendChild(radar);
    for (const scene of viewer.tour.scenes) {
      const m = scene.map;
      if (m?.floorplan !== fp.id || m.x == null || m.y == null) continue;
      const marker = el("button", {
        className: "ull360-floorplan__marker",
        type: "button",
        "aria-label": viewer.text(scene.title),
        title: viewer.text(scene.title),
        "data-scene": scene.id,
        style: `left:${m.x * 100}%;top:${m.y * 100}%;`,
      });
      marker.addEventListener("click", () => void viewer.goTo(scene.id));
      wrap.appendChild(marker);
    }
    const update = (): void => {
      const sceneId = viewer.currentSceneId();
      const scene = viewer.tour.scenes.find((s) => s.id === sceneId);
      wrap.querySelectorAll(".ull360-floorplan__marker").forEach((mk) => {
        mk.setAttribute("aria-current", (mk as HTMLElement).dataset.scene === sceneId ? "true" : "false");
      });
      const m = scene?.map;
      if (m?.floorplan === fp.id && m.x != null && m.y != null) {
        radar.hidden = false;
        radar.style.left = `${m.x * 100}%`;
        radar.style.top = `${m.y * 100}%`;
        const v = viewer.view();
        const north = m.north ?? 0;
        radar.style.transform = `rotate(${((v.yaw + north) * 180) / Math.PI}deg)`;
      } else {
        radar.hidden = true;
      }
    };
    viewer.on("viewChange", update);
    viewer.on("sceneChange", () => {
      // cambiar de planta automaticamente si la escena esta en otra
      const scene = viewer.currentScene();
      const targetFloor = scene?.map?.floorplan;
      if (targetFloor != null && targetFloor !== currentFloor) {
        const target = floorplans.find((f) => f.id === targetFloor);
        if (target != null) renderAll(target);
      }
      update();
    });
    update();
    holder.replaceChildren(wrap);
  };

  const renderAll = (fp: Floorplan): void => {
    renderFloorplan(fp);
    if (floorplans.length > 1) {
      const levels = el("div", { className: "ull360-floorplan__levels", role: "tablist" });
      for (const f of [...floorplans].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))) {
        const b = el("button", {
          type: "button",
          text: viewer.text(f.title) || t("floor", { level: f.level ?? 0 }),
          "aria-pressed": f.id === fp.id ? "true" : "false",
        });
        b.addEventListener("click", () => renderAll(f));
        levels.appendChild(b);
      }
      holder.appendChild(levels);
    }
  };

  const renderGeo = (): void => {
    const mapDiv = el("div", { className: "ull360-geomap" });
    holder.replaceChildren(mapDiv);
    void (async () => {
      // CSS de Leaflet: servido junto al bundle (autocontenido, sin CDN).
      if (document.getElementById("ull360-leaflet-css") == null) {
        try {
          const href = new URL("./leaflet.css", import.meta.url).toString();
          const link = el("link", { id: "ull360-leaflet-css", rel: "stylesheet", href });
          document.head.appendChild(link);
        } catch {
          // entorno sin import.meta.url resoluble
        }
      }
      const L: any = await import("leaflet");
      const leaflet = L.default ?? L;
      const cfg = viewer.tour.geoMap!;
      const markers = viewer.tour.scenes.filter((s) => s.map?.lat != null && s.map.lng != null);
      const first = markers[0];
      const map = leaflet.map(mapDiv, { attributionControl: true }).setView(
        cfg.center != null ? [cfg.center.lat, cfg.center.lng] : first != null ? [first.map!.lat!, first.map!.lng!] : [28.48, -16.31],
        cfg.zoom ?? 17,
      );
      leaflet
        .tileLayer(cfg.tileUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: cfg.attribution ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map);
      const bounds: [number, number][] = [];
      for (const scene of markers) {
        const marker = leaflet
          .circleMarker([scene.map!.lat!, scene.map!.lng!], {
            radius: 8,
            color: "#fff",
            weight: 2,
            fillColor: scene.id === viewer.currentSceneId() ? "#0ea5e9" : "#64748b",
            fillOpacity: 1,
          })
          .addTo(map)
          .bindTooltip(viewer.text(scene.title));
        marker.on("click", () => void viewer.goTo(scene.id));
        bounds.push([scene.map!.lat!, scene.map!.lng!]);
      }
      if (cfg.center == null && bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
    })();
  };

  const initialFloor =
    floorplans.find((f) => f.id === viewer.currentScene()?.map?.floorplan) ?? floorplans[0];
  if (initialFloor != null) renderAll(initialFloor);
  else if (hasGeo) renderGeo();

  // Alternar plano <-> mapa geografico si hay ambos
  if (floorplans.length > 0 && hasGeo) {
    const swap = el("button", { className: "ull360-btn", "aria-label": t("map"), style: "width:36px;height:36px;" });
    swap.appendChild(createIconSvg("map", 16));
    let geoMode = false;
    swap.addEventListener("click", () => {
      geoMode = !geoMode;
      if (geoMode) {
        title.textContent = t("map");
        renderGeo();
      } else {
        title.textContent = t("floorplan");
        renderAll(initialFloor!);
      }
    });
    root.querySelector(".ull360-mappanel__head")!.insertBefore(swap, closeBtn);
  }

  return {
    root,
    toggle: () => {
      root.hidden = !root.hidden;
    },
    available,
  };
}

// ---------------------------------------------------------------------------
// Pantallas de bienvenida / final y ayuda
// ---------------------------------------------------------------------------

export function buildWelcomeScreen(viewer: TourViewer, t: Translator, baseUrl: string, onStart: () => void): HTMLElement | null {
  const cfg = viewer.tour.ui?.welcome;
  if (cfg?.enabled !== true) return null;
  const card = el("div", { className: "ull360-screen__card" });
  if (cfg.image != null) card.appendChild(el("img", { src: resolveUrl(baseUrl, cfg.image), alt: "" }));
  card.appendChild(el("h1", { text: viewer.text(cfg.title) || viewer.text(viewer.tour.meta.title) }));
  const bodyText = viewer.text(cfg.body);
  if (bodyText !== "") card.appendChild(el("p", { text: bodyText }));
  if (cfg.showControls !== false) {
    const controls = el("div", { className: "ull360-screen__controls" });
    const item = (icon: string, label: string): HTMLElement => {
      const div = el("div");
      div.appendChild(createIconSvg(icon, 26));
      div.appendChild(el("span", { text: label }));
      return div;
    };
    controls.append(item("rotate-cw", t("help_drag")), item("expand", t("help_zoom")), item("map-pin", t("help_dblclick")));
    card.appendChild(controls);
  }
  const start = el("button", { className: "ull360-primary-btn", type: "button", text: viewer.text(cfg.startLabel) || t("start") });
  card.appendChild(start);
  const screen = el("div", { className: "ull360-screen", role: "dialog", "aria-modal": "true", "aria-label": viewer.text(viewer.tour.meta.title) }, card);
  start.addEventListener("click", () => {
    screen.remove();
    onStart();
  });
  return screen;
}

export function showFinalScreen(viewer: TourViewer, t: Translator, container: HTMLElement): void {
  const cfg = viewer.tour.ui?.final;
  if (cfg?.enabled !== true) return;
  const card = el("div", { className: "ull360-screen__card" });
  card.appendChild(el("h1", { text: viewer.text(cfg.title) }));
  const bodyText = viewer.text(cfg.body);
  if (bodyText !== "") card.appendChild(el("p", { text: bodyText }));
  if (cfg.cta != null) {
    const a = el("a", { href: cfg.cta.url, className: "ull360-primary-btn", text: viewer.text(cfg.cta.label), style: "display:inline-block;text-decoration:none;" });
    card.appendChild(a);
  }
  const close = el("button", { className: "ull360-btn", "aria-label": t("close"), style: "position:absolute;top:14px;right:14px;" });
  close.appendChild(createIconSvg("x", 18));
  const screen = el("div", { className: "ull360-screen", role: "dialog", "aria-modal": "true" }, card, close);
  close.addEventListener("click", () => screen.remove());
  container.appendChild(screen);
}

export function showHelp(t: Translator, container: HTMLElement): void {
  const card = el("div", { className: "ull360-screen__card" });
  card.appendChild(el("h1", { text: t("help_title") }));
  const list = el("div", { style: "text-align:left;line-height:2;" });
  for (const key of ["help_drag", "help_zoom", "help_keys", "help_dblclick"]) {
    list.appendChild(el("p", { text: t(key), style: "margin:4px 0;color:var(--u3-fg-dim);" }));
  }
  card.appendChild(list);
  const close = el("button", { className: "ull360-primary-btn", type: "button", text: t("close") });
  card.appendChild(close);
  const screen = el("div", { className: "ull360-screen", role: "dialog", "aria-modal": "true", "aria-label": t("help_title") }, card);
  close.addEventListener("click", () => screen.remove());
  screen.addEventListener("click", (e) => {
    if (e.target === screen) screen.remove();
  });
  container.appendChild(screen);
  close.focus();
}

export function showShareDialog(viewer: TourViewer, t: Translator, container: HTMLElement): void {
  viewer.trackShare();
  const link = viewer.deepLink();
  const card = el("div", { className: "ull360-screen__card" });
  card.appendChild(el("h1", { text: t("share") }));
  const input = el("input", {
    value: link,
    readonly: true,
    style: "width:100%;padding:10px;border-radius:8px;border:1px solid rgba(128,128,160,.4);background:transparent;color:inherit;font-size:13px;",
    "aria-label": t("copy_link"),
  });
  card.appendChild(input);
  const row = el("div", { style: "display:flex;gap:10px;justify-content:center;margin-top:14px;" });
  const copy = el("button", { className: "ull360-primary-btn", type: "button", text: t("copy_link"), style: "margin-top:0;" });
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(link).then(() => toast(container, t("link_copied")));
  });
  row.appendChild(copy);
  if (navigator.share != null) {
    const native = el("button", { className: "ull360-primary-btn", type: "button", text: t("share"), style: "margin-top:0;" });
    native.addEventListener("click", () => {
      void navigator.share({ url: link, title: viewer.text(viewer.tour.meta.title) }).catch(() => {});
    });
    row.appendChild(native);
  }
  card.appendChild(row);
  const close = el("button", { className: "ull360-btn", "aria-label": t("close"), style: "position:absolute;top:14px;right:14px;" });
  close.appendChild(createIconSvg("x", 18));
  const screen = el("div", { className: "ull360-screen", role: "dialog", "aria-modal": "true", "aria-label": t("share") }, card, close);
  close.addEventListener("click", () => screen.remove());
  screen.addEventListener("click", (e) => {
    if (e.target === screen) screen.remove();
  });
  container.appendChild(screen);
  input.select();
}
