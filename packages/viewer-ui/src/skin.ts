import type { Projection, Tour } from "@ull360/schema";
import { createIconSvg, resolveUrl, TourViewer } from "@ull360/viewer";
import { injectStyles } from "./styles.js";
import { createTranslator, type Translator } from "./i18n.js";
import { registerUiIcons } from "./icons.js";
import { el, iconButton, toast } from "./dom.js";
import { PanelHost } from "./panels.js";
import {
  buildCompass,
  buildMapPanel,
  buildSceneMenu,
  buildThumbnails,
  buildWelcomeScreen,
  showFinalScreen,
  showHelp,
  showShareDialog,
} from "./components.js";
import { buildAccessibleView } from "./accessible.js";
import { downloadCertificate } from "./certificate.js";
import { LiveClient, type LiveOptions } from "./live.js";

export interface SkinOptions {
  container: HTMLElement;
  tour: Tour;
  baseUrl?: string;
  lang?: string;
  analyticsEndpoint?: string | null;
  formEndpoint?: string | null;
  turnstileSiteKey?: string | null;
  editMode?: boolean;
  deepLinks?: boolean;
  /** Modo kiosko: autopilot + reinicio por inactividad. */
  kiosk?: boolean | { inactivitySeconds?: number };
  /** Sala en vivo a la que conectarse automaticamente. */
  live?: LiveOptions;
}

export interface MountedSkin {
  viewer: TourViewer;
  panelHost: PanelHost;
  live: LiveClient | null;
  destroy: () => void;
}

/**
 * Monta el visor completo (motor + skin). Es la unica funcion que necesitan
 * los tours publicados, los paquetes exportados y la vista previa del
 * Studio (esta ultima con editMode).
 */
export function mountViewer(options: SkinOptions): MountedSkin {
  registerUiIcons();
  const tour = options.tour;
  const theme = tour.ui?.theme;
  injectStyles(theme?.customCss);

  const container = options.container;
  container.dataset.theme = theme?.base ?? "ull";
  if (theme?.primaryColor != null) container.style.setProperty("--u3-primary", theme.primaryColor);
  if (theme?.fontFamily != null) container.style.setProperty("--u3-font", theme.fontFamily);
  if (theme?.borderRadius != null) container.style.setProperty("--u3-radius", theme.borderRadius);

  const stage = el("div", { style: "position:absolute;inset:0;" });
  container.appendChild(stage);

  const viewer = new TourViewer({
    container: stage,
    tour,
    lang: options.lang,
    baseUrl: options.baseUrl,
    editMode: options.editMode,
    deepLinks: options.deepLinks,
    analyticsEndpoint: options.analyticsEndpoint,
  });

  const t0 = createTranslator(viewer.currentLang());
  let t: Translator = t0;
  const baseUrl = options.baseUrl ?? "";
  const ui = tour.ui ?? {};

  const panelHost = new PanelHost({
    viewer,
    t,
    baseUrl,
    container,
    formEndpoint: options.formEndpoint ?? null,
    turnstileSiteKey: options.turnstileSiteKey ?? null,
  });
  viewer.on("hotspotActivate", (e) => panelHost.open(e.hotspot, e.element));
  viewer.on("hotspotDeactivate", () => panelHost.close());

  // Skip link accesible
  const skip = el("a", { className: "ull360-skiplink", href: "#", text: t("accessible_mode") });
  container.appendChild(skip);

  // ------- Barra superior -------
  const topbar = el("div", { className: "ull360-topbar" });
  if (ui.sceneMenu !== false) {
    const menu = buildSceneMenu(viewer, t, baseUrl);
    container.appendChild(menu.root);
    const menuBtn = iconButton("menu", t("menu"), menu.toggle);
    topbar.appendChild(menuBtn);
  }
  if (ui.titleBar !== false) {
    topbar.appendChild(el("h1", { className: "ull360-title", text: viewer.text(tour.meta.title) }));
  } else {
    topbar.appendChild(el("div", { style: "flex:1;" }));
  }
  if (ui.logo != null) {
    const img = el("img", { src: resolveUrl(baseUrl, ui.logo.image), alt: "" });
    const logo =
      ui.logo.link != null
        ? el("a", { className: "ull360-logo", href: ui.logo.link, target: "_blank", rel: "noopener" }, img)
        : el("div", { className: "ull360-logo" }, img);
    topbar.appendChild(logo);
  }
  container.appendChild(topbar);

  if (ui.watermark != null) {
    const img = el("img", { src: resolveUrl(baseUrl, ui.watermark.image), alt: "" });
    const wm =
      ui.watermark.link != null
        ? el("a", { className: "ull360-watermark", href: ui.watermark.link, target: "_blank", rel: "noopener" }, img)
        : el("div", { className: "ull360-watermark" }, img);
    container.appendChild(wm);
  }

  // Parche de nadir con logo (oculta el tripode): hotspot fijo en el nadir.
  if (ui.nadirPatch != null) {
    viewer.on("ready", () => {
      const marz = viewer.marzipanoViewer();
      const scene = marz.scene();
      if (scene != null) {
        const img = el("img", {
          src: resolveUrl(baseUrl, ui.nadirPatch!.image),
          alt: "",
          style: `width:${ui.nadirPatch!.size ?? 220}px;border-radius:50%;`,
        });
        try {
          scene.hotspotContainer().createHotspot(img, { yaw: 0, pitch: -Math.PI / 2 + 0.001 });
        } catch {
          // sin soporte de hotspots en esta escena
        }
      }
    });
  }

  // ------- Brujula -------
  if (ui.compass !== false) container.appendChild(buildCompass(viewer, t));

  // ------- Miniaturas -------
  if (ui.thumbnails !== false) container.appendChild(buildThumbnails(viewer, t, baseUrl));

  // ------- Plano / mapa -------
  const mapPanel = buildMapPanel(viewer, t, baseUrl);
  if (mapPanel.available) container.appendChild(mapPanel.root);

  // ------- Indicador de carga -------
  if (ui.loadingIndicator !== false) {
    const loading = el("div", { className: "ull360-loading", role: "status", "aria-label": t("loading") },
      el("div", { className: "ull360-loading__spinner" }));
    container.appendChild(loading);
    viewer.on("ready", () => loading.remove());
    setTimeout(() => loading.remove(), 15000);
  }

  // ------- Controles laterales -------
  const controls = el("div", { className: "ull360-controls" });
  const controlsLeft = el("div", { className: "ull360-controls-left" });

  if (mapPanel.available) {
    controlsLeft.appendChild(iconButton("map", t("map"), mapPanel.toggle));
  }
  // Volver a la escena anterior
  const backBtn = iconButton("arrow-left", t("previous_scene"), () => void viewer.back());
  backBtn.disabled = true;
  viewer.on("sceneChange", () => {
    backBtn.disabled = !viewer.canGoBack();
  });
  controlsLeft.appendChild(backBtn);

  // Autopilot
  if ((tour.autopilot?.length ?? 0) > 0 && options.editMode !== true) {
    const apBtn = iconButton("play", t("autoplay_tour"), () => {
      if (viewer.autopilotActive()) viewer.stopAutopilot();
      else viewer.startAutopilot();
    });
    viewer.on("autopilotChange", (e) => {
      apBtn.setAttribute("aria-pressed", String(e.active));
      apBtn.replaceChildren(createIconSvg(e.active ? "pause" : "play", 20));
      apBtn.setAttribute("aria-label", e.active ? t("stop_autoplay") : t("autoplay_tour"));
    });
    controlsLeft.appendChild(apBtn);
  }

  if (ui.zoomControls !== false) {
    controls.appendChild(
      iconButton("plus", t("zoom_in"), () => viewer.lookTo({ fov: Math.max(0.35, viewer.view().fov * 0.75) }, 300)),
    );
    controls.appendChild(
      iconButton("minus", t("zoom_out"), () => viewer.lookTo({ fov: Math.min(2.4, viewer.view().fov * 1.33) }, 300)),
    );
  }

  if (ui.gyroToggle !== false && "DeviceOrientationEvent" in window && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    const gyroBtn = iconButton("smartphone", t("gyro"), () => {
      if (viewer.gyroActive()) {
        viewer.disableGyro();
        gyroBtn.setAttribute("aria-pressed", "false");
      } else {
        void viewer.enableGyro().then((ok) => gyroBtn.setAttribute("aria-pressed", String(ok)));
      }
    });
    controls.appendChild(gyroBtn);
  }

  if (ui.vr !== false) {
    controls.appendChild(iconButton("glasses", t("vr_mode"), () => void viewer.enterVr()));
  }

  if (ui.fullscreen !== false && document.fullscreenEnabled) {
    const fsBtn = iconButton("maximize", t("fullscreen"), () => {
      if (document.fullscreenElement != null) void document.exitFullscreen();
      else void container.requestFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
      const active = document.fullscreenElement != null;
      fsBtn.replaceChildren(createIconSvg(active ? "minimize" : "maximize", 20));
      fsBtn.setAttribute("aria-label", active ? t("exit_fullscreen") : t("fullscreen"));
    });
    controls.appendChild(fsBtn);
  }

  if (ui.share !== false) {
    controls.appendChild(iconButton("share-2", t("share"), () => showShareDialog(viewer, t, container)));
  }

  if (ui.mute !== false) {
    const muteBtn = iconButton("volume-2", viewer.audioEngine().muted ? t("unmute") : t("mute"), () => {
      const next = !viewer.audioEngine().muted;
      viewer.audioEngine().setMuted(next);
      muteBtn.replaceChildren(createIconSvg(next ? "volume-x" : "volume-2", 20));
      muteBtn.setAttribute("aria-label", next ? t("unmute") : t("mute"));
      muteBtn.setAttribute("aria-pressed", String(next));
    });
    if (viewer.audioEngine().muted) muteBtn.replaceChildren(createIconSvg("volume-x", 20));
    controls.appendChild(muteBtn);
  }

  // Selector de idioma
  if (ui.langSelector !== false && tour.meta.langs.length > 1) {
    const langBtn = iconButton("languages", t("language"), () => {
      const existing = container.querySelector(".ull360-menu-pop");
      if (existing != null) {
        existing.remove();
        return;
      }
      const pop = el("div", { className: "ull360-menu-pop", role: "menu", style: `bottom:${controls.offsetHeight - (langBtn.offsetTop + 44)}px;` });
      pop.style.bottom = "auto";
      pop.style.top = `${langBtn.getBoundingClientRect().top - container.getBoundingClientRect().top}px`;
      for (const lang of tour.meta.langs) {
        const b = el("button", { type: "button", role: "menuitem", text: lang.toUpperCase(), "aria-pressed": String(lang === viewer.currentLang()) });
        b.addEventListener("click", () => {
          viewer.setLang(lang);
          pop.remove();
        });
        pop.appendChild(b);
      }
      container.appendChild(pop);
    });
    controls.appendChild(langBtn);
  }

  // Selector de proyeccion
  const projBtn = iconButton("globe", t("projection"), () => {
    const existing = container.querySelector(".ull360-menu-pop");
    if (existing != null) {
      existing.remove();
      return;
    }
    const pop = el("div", { className: "ull360-menu-pop", role: "menu" });
    pop.style.top = `${projBtn.getBoundingClientRect().top - container.getBoundingClientRect().top}px`;
    const projections: Projection[] = ["rectilinear", "littlePlanet", "fisheye", "pannini", "architectural"];
    for (const p of projections) {
      const b = el("button", { type: "button", role: "menuitem", text: t(`projection_${p}`), "aria-pressed": String(p === viewer.currentProjection()) });
      b.addEventListener("click", () => {
        viewer.setProjection(p);
        pop.remove();
      });
      pop.appendChild(b);
    }
    container.appendChild(pop);
  });
  controls.appendChild(projBtn);

  if (ui.help !== false) {
    controls.appendChild(iconButton("circle-help", t("help"), () => showHelp(t, container)));
  }

  // Modo accesible
  let accessibleView: HTMLElement | null = null;
  const openAccessible = (): void => {
    if (accessibleView != null) return;
    accessibleView = buildAccessibleView(viewer, t, baseUrl, () => {
      accessibleView?.remove();
      accessibleView = null;
    });
    container.appendChild(accessibleView);
    (accessibleView.querySelector("button") as HTMLElement | null)?.focus();
  };
  if (ui.accessibleMode !== false) {
    controls.appendChild(iconButton("accessibility", t("accessible_mode"), openAccessible));
    skip.addEventListener("click", (e) => {
      e.preventDefault();
      openAccessible();
    });
  } else {
    skip.remove();
  }

  container.appendChild(controls);
  container.appendChild(controlsLeft);

  // ------- Video 360: barra de controles -------
  const videoBar = el("div", { className: "ull360-videobar", hidden: true });
  container.appendChild(videoBar);
  const refreshVideoBar = (): void => {
    const video = viewer.videoElement();
    videoBar.hidden = video == null;
    if (video == null) {
      videoBar.replaceChildren();
      return;
    }
    const playBtn = el("button", { type: "button", "aria-label": t("video_play") });
    playBtn.appendChild(createIconSvg(video.paused ? "play" : "pause", 18));
    playBtn.addEventListener("click", () => {
      if (video.paused) void video.play();
      else video.pause();
    });
    video.addEventListener("play", () => playBtn.replaceChildren(createIconSvg("pause", 18)));
    video.addEventListener("pause", () => playBtn.replaceChildren(createIconSvg("play", 18)));
    const seek = el("input", { type: "range", min: "0", max: "1000", value: "0", "aria-label": "Seek" });
    video.addEventListener("timeupdate", () => {
      if (video.duration > 0) seek.value = String(Math.round((video.currentTime / video.duration) * 1000));
    });
    seek.addEventListener("input", () => {
      if (video.duration > 0) video.currentTime = (Number(seek.value) / 1000) * video.duration;
    });
    const muteV = el("button", { type: "button", "aria-label": t("mute") });
    muteV.appendChild(createIconSvg(video.muted ? "volume-x" : "volume-2", 18));
    muteV.addEventListener("click", () => {
      video.muted = !video.muted;
      muteV.replaceChildren(createIconSvg(video.muted ? "volume-x" : "volume-2", 18));
    });
    const speed = el("select", { "aria-label": "Velocidad" });
    for (const s of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
      speed.appendChild(el("option", { value: String(s), text: `${s}x`, selected: s === 1 }));
    }
    speed.addEventListener("change", () => {
      video.playbackRate = Number(speed.value);
    });
    videoBar.replaceChildren(playBtn, seek, muteV, speed);
    // Subtitulos WebVTT: activar la pista del idioma actual si existe
    for (const track of Array.from(video.textTracks)) {
      track.mode = track.language === viewer.currentLang() ? "showing" : "hidden";
    }
  };
  viewer.on("sceneChange", refreshVideoBar);
  viewer.on("ready", refreshVideoBar);

  // ------- Busqueda del tesoro -------
  if (tour.treasureHunt?.enabled === true) {
    const hud = el("div", {
      className: "ull360-toast",
      style: "bottom:auto;top:64px;left:50%;",
      role: "status",
    });
    const refresh = (found: number, total: number): void => {
      hud.textContent = `${viewer.text(tour.treasureHunt!.title) || t("treasure_title")}: ${t("treasure_progress", { found, total })}`;
    };
    refresh(0, tour.treasureHunt.targets.length);
    container.appendChild(hud);
    viewer.on("treasureProgress", (e) => {
      refresh(e.found, e.total);
      if (e.found === e.total) {
        toast(container, viewer.text(tour.treasureHunt!.completionMessage) || t("treasure_complete"));
      }
    });
  }

  // ------- Informe de quiz + certificado -------
  viewer.on("quizChange", (state) => {
    if (state.total > 0 && state.answered === state.total && tour.quiz?.finalReport !== false) {
      panelHost.close();
      const card = el("div", { className: "ull360-screen__card" });
      card.appendChild(el("h1", { text: t("quiz_report") }));
      card.appendChild(el("p", { text: `${t("quiz_score")}: ${state.score} / ${state.maxScore}` }));
      if (state.passed != null) {
        card.appendChild(el("p", { text: state.passed ? t("quiz_passed") : t("quiz_failed"), style: `color:${state.passed ? "#34d399" : "#f87171"};font-weight:600;` }));
      }
      if (tour.quiz?.certificate?.enabled === true && state.passed !== false) {
        const nameInput = el("input", {
          type: "text",
          placeholder: t("quiz_your_name"),
          "aria-label": t("quiz_your_name"),
          style: "width:100%;padding:10px;border-radius:8px;border:1px solid rgba(128,128,160,.4);background:transparent;color:inherit;margin-top:10px;",
        });
        const dl = el("button", { className: "ull360-primary-btn", type: "button", text: t("quiz_certificate") });
        dl.addEventListener("click", () => {
          if (nameInput.value.trim() === "") {
            nameInput.focus();
            return;
          }
          downloadCertificate({
            participantName: nameInput.value.trim(),
            tourTitle: viewer.text(tour.meta.title),
            certTitle: viewer.text(tour.quiz?.certificate?.title) || t("quiz_certificate"),
            scoreLine: `${t("quiz_score")}: ${state.score} / ${state.maxScore}`,
            dateLine: new Date().toLocaleDateString(viewer.currentLang()),
            signature: tour.quiz?.certificate?.signature,
          });
        });
        card.append(nameInput, dl);
      }
      const close = el("button", { className: "ull360-primary-btn", type: "button", text: t("close"), style: "margin-left:10px;" });
      const screen = el("div", { className: "ull360-screen", role: "dialog", "aria-modal": "true" }, card);
      card.appendChild(close);
      close.addEventListener("click", () => {
        screen.remove();
        showFinalScreen(viewer, t, container);
      });
      container.appendChild(screen);
    }
  });

  // ------- Narracion bloqueante: aviso -------
  viewer.on("narrationBlock", (e) => {
    if (e.blocked) toast(container, t("narration_wait"));
  });

  // ------- Anuncio de cambio de escena (lectores de pantalla) -------
  const announcer = el("div", { "aria-live": "polite", style: "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);" });
  container.appendChild(announcer);
  viewer.on("sceneChange", (e) => {
    announcer.textContent = `${viewer.text(e.scene.title)}. ${viewer.text(e.scene.altText)}`;
  });

  // ------- Cambio de idioma: remontar textos de la skin -------
  viewer.on("langChange", (e) => {
    t = createTranslator(e.lang);
    // Los componentes leen textos en su proximo render; para textos fijos
    // basta actualizar el titulo.
    const title = topbar.querySelector(".ull360-title");
    if (title != null) title.textContent = viewer.text(tour.meta.title);
  });

  // ------- Pantalla de bienvenida -------
  const welcome = buildWelcomeScreen(viewer, t, baseUrl, () => {
    viewer.audioEngine().unlock();
  });
  if (welcome != null && options.editMode !== true) container.appendChild(welcome);

  // ------- Modo kiosko -------
  let kioskTimer: ReturnType<typeof setTimeout> | null = null;
  if (options.kiosk != null && options.kiosk !== false && options.editMode !== true) {
    const inactivity = typeof options.kiosk === "object" ? (options.kiosk.inactivitySeconds ?? 120) : 120;
    const reset = (): void => {
      if (kioskTimer != null) clearTimeout(kioskTimer);
      kioskTimer = setTimeout(() => {
        panelHost.close();
        void viewer.goTo(tour.start.scene, { view: tour.start.view, force: true, skipHistory: true });
        viewer.startAutopilot();
      }, inactivity * 1000);
    };
    for (const evt of ["pointerdown", "keydown", "wheel", "touchstart"]) {
      container.addEventListener(evt, reset, { passive: true });
    }
    reset();
    viewer.on("ready", () => viewer.startAutopilot());
    // Bloqueo de salida: interceptar teclas de navegacion del navegador
    window.addEventListener("keydown", (e) => {
      if ((e.key === "F5" || (e.ctrlKey && e.key === "w") || e.key === "Escape") && document.fullscreenElement != null) {
        e.preventDefault();
      }
    });
  }

  // ------- Sala en vivo -------
  let live: LiveClient | null = null;
  if (options.live != null) {
    live = new LiveClient(viewer, t, container, options.live);
    live.connect();
  }

  // ------- postMessage API para embeds (necesaria para LTI e integraciones) -------
  const onMessage = (e: MessageEvent): void => {
    const data = e.data as { ull360?: string; [k: string]: unknown };
    if (data == null || typeof data !== "object" || typeof data.ull360 !== "string") return;
    switch (data.ull360) {
      case "goTo":
        if (typeof data.scene === "string") void viewer.goTo(data.scene, { force: true });
        break;
      case "setView":
        viewer.setView(data.view as { yaw?: number; pitch?: number; fov?: number });
        break;
      case "setLang":
        if (typeof data.lang === "string") viewer.setLang(data.lang);
        break;
      case "getState":
        (e.source as WindowProxy | null)?.postMessage(
          { ull360: "state", scene: viewer.currentSceneId(), view: viewer.view(), lang: viewer.currentLang(), quiz: viewer.quizState() },
          "*",
        );
        break;
      default:
        break;
    }
  };
  window.addEventListener("message", onMessage);
  // Emitir eventos hacia el padre si estamos embebidos
  if (window.parent !== window) {
    viewer.on("sceneChange", (e) =>
      window.parent.postMessage({ ull360: "sceneChange", scene: e.scene.id }, "*"),
    );
    viewer.on("quizChange", (state) => window.parent.postMessage({ ull360: "quizChange", state }, "*"));
  }

  // ------- Estado global para integraciones (adaptador SCORM, kiosko) -------
  const visited = new Set<string>();
  const publishState = (): void => {
    if (viewer.currentSceneId() != null) visited.add(viewer.currentSceneId()!);
    const state = {
      scene: viewer.currentSceneId(),
      scenesVisited: visited.size,
      scenesTotal: tour.scenes.filter((s) => s.hidden !== true).length,
      quiz: viewer.quizState(),
      treasure: viewer.treasureState(),
    };
    (window as unknown as Record<string, unknown>).__ULL360_STATE__ = state;
    window.dispatchEvent(new CustomEvent("ull360:state", { detail: state }));
  };
  viewer.on("sceneChange", publishState);
  viewer.on("quizChange", publishState);
  viewer.on("ready", publishState);

  return {
    viewer,
    panelHost,
    live,
    destroy: () => {
      window.removeEventListener("message", onMessage);
      if (kioskTimer != null) clearTimeout(kioskTimer);
      live?.disconnect();
      panelHost.close();
      viewer.destroy();
      container.replaceChildren();
    },
  };
}
