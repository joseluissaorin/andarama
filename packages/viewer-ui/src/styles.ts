/**
 * Hoja de estilos del visor. Se inyecta una sola vez. Temas: claro, oscuro,
 * auto y tema institucional ULL (azul #5C68A5 / dorado). Variables CSS
 * sobreescribibles por tour (color primario, tipografia, radios) y CSS
 * propio opcional. Contraste AA y objetivos tactiles >= 44 px.
 */
export const VIEWER_CSS = `
.ull360-viewer { --u3-primary: #0ea5e9; --u3-bg: rgba(15, 23, 42, 0.82); --u3-bg-solid: #0f172a;
  --u3-fg: #f8fafc; --u3-fg-dim: #cbd5e1; --u3-radius: 12px; --u3-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-family: var(--u3-font); overflow: hidden; }
.ull360-viewer[data-theme="light"] { --u3-bg: rgba(248, 250, 252, 0.92); --u3-bg-solid: #f8fafc; --u3-fg: #0f172a; --u3-fg-dim: #475569; }
.ull360-viewer[data-theme="ull"] { --u3-primary: #5c68a5; }
@media (prefers-color-scheme: light) {
  .ull360-viewer[data-theme="auto"] { --u3-bg: rgba(248, 250, 252, 0.92); --u3-bg-solid: #f8fafc; --u3-fg: #0f172a; --u3-fg-dim: #475569; }
}
.ull360-viewer *, .ull360-viewer *::before, .ull360-viewer *::after { box-sizing: border-box; }
.ull360-viewer button { font-family: inherit; }
.ull360-viewer :focus-visible { outline: 3px solid var(--u3-primary); outline-offset: 2px; }

/* Hotspots */
.ull360-hotspot { position: absolute; transform: translate(-50%, -50%); background: none; border: none;
  cursor: pointer; padding: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; color: #fff; }
.ull360-hotspot__icon { display: flex; align-items: center; justify-content: center; transition: transform .15s ease; }
.ull360-hotspot__icon--chip { background: var(--u3-bg); border: 2px solid rgba(255,255,255,.85); border-radius: 50%;
  box-shadow: 0 2px 10px rgba(0,0,0,.35); min-width: 44px; min-height: 44px; }
.ull360-hotspot:hover .ull360-hotspot__icon--chip, .ull360-hotspot:focus-visible .ull360-hotspot__icon--chip { border-color: var(--u3-primary); }
.ull360-hotspot__label { background: var(--u3-bg); color: var(--u3-fg); padding: 4px 10px; border-radius: 999px;
  font-size: 13px; white-space: nowrap; max-width: 240px; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.ull360-hotspot__label--hover { opacity: 0; transition: opacity .15s ease; }
.ull360-hotspot:hover .ull360-hotspot__label--hover, .ull360-hotspot:focus-visible .ull360-hotspot__label--hover { opacity: 1; }
.ull360-hotspot--pulse .ull360-hotspot__icon--chip::after { content: ""; position: absolute; inset: -6px; border-radius: 50%;
  border: 2px solid var(--u3-primary); animation: u3pulse 2s ease-out infinite; }
@keyframes u3pulse { 0% { transform: scale(.8); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ull360-hotspot--pulse .ull360-hotspot__icon--chip::after { animation: none; display: none; } }
.ull360-degraded .ull360-hotspot--pulse .ull360-hotspot__icon--chip::after { animation: none; display: none; }
.ull360-hotspot--floor-arrow .ull360-hotspot__icon { transform: perspective(300px) rotateX(52deg); }
.ull360-hotspot--projected { pointer-events: auto; }

/* Barra superior */
.ull360-topbar { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 10px;
  padding: max(10px, env(safe-area-inset-top)) 14px 10px; z-index: 20;
  background: linear-gradient(rgba(2,6,23,.65), transparent); pointer-events: none; }
.ull360-topbar > * { pointer-events: auto; }
.ull360-title { color: #fff; font-size: 16px; font-weight: 600; text-shadow: 0 1px 4px rgba(0,0,0,.6);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; margin: 0; }
.ull360-logo img { height: 34px; display: block; }

/* Barra inferior de controles */
.ull360-controls { position: absolute; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); display: flex;
  flex-direction: column; gap: 8px; z-index: 20; }
.ull360-controls-left { position: absolute; left: 12px; bottom: max(12px, env(safe-area-inset-bottom)); display: flex;
  flex-direction: column; gap: 8px; z-index: 20; }
.ull360-btn { width: 44px; height: 44px; border-radius: var(--u3-radius); border: none; cursor: pointer;
  background: var(--u3-bg); color: var(--u3-fg); display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,.3); transition: background .15s ease; }
.ull360-btn:hover { background: var(--u3-primary); color: #fff; }
.ull360-btn[aria-pressed="true"] { background: var(--u3-primary); color: #fff; }
.ull360-btn:disabled { opacity: .4; cursor: default; }

/* Menu de escenas */
.ull360-scenemenu { position: absolute; top: 0; left: 0; bottom: 0; width: min(340px, 88vw); background: var(--u3-bg-solid);
  color: var(--u3-fg); z-index: 30; transform: translateX(-100%); transition: transform .25s ease; display: flex; flex-direction: column;
  box-shadow: 4px 0 24px rgba(0,0,0,.4); }
.ull360-scenemenu[data-open="true"] { transform: translateX(0); }
@media (prefers-reduced-motion: reduce) { .ull360-scenemenu { transition: none; } }
.ull360-scenemenu__head { display: flex; align-items: center; gap: 8px; padding: 14px; }
.ull360-scenemenu__head h2 { margin: 0; font-size: 17px; flex: 1; }
.ull360-scenemenu__search { margin: 0 14px 10px; position: relative; }
.ull360-scenemenu__search input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(128,128,160,.4);
  background: transparent; color: inherit; font-size: 14px; }
.ull360-scenemenu__list { overflow-y: auto; flex: 1; padding: 0 14px 14px; }
.ull360-scenemenu__cat { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--u3-fg-dim); margin: 14px 0 6px; }
.ull360-scenemenu__item { display: flex; gap: 10px; align-items: center; width: 100%; border: none; background: none;
  color: inherit; padding: 8px; border-radius: 10px; cursor: pointer; text-align: left; }
.ull360-scenemenu__item:hover, .ull360-scenemenu__item[aria-current="true"] { background: rgba(128,128,160,.18); }
.ull360-scenemenu__item img { width: 72px; height: 44px; object-fit: cover; border-radius: 6px; background: #333; }
.ull360-scenemenu__item span { font-size: 14px; }

/* Carrusel de miniaturas */
.ull360-thumbs { position: absolute; left: 50%; transform: translateX(-50%); bottom: max(12px, env(safe-area-inset-bottom));
  display: flex; gap: 8px; z-index: 19; max-width: min(70vw, 720px); overflow-x: auto; padding: 6px; scrollbar-width: thin; }
.ull360-thumbs button { border: 2px solid transparent; border-radius: 8px; padding: 0; cursor: pointer; background: none; flex-shrink: 0; }
.ull360-thumbs button[aria-current="true"] { border-color: var(--u3-primary); }
.ull360-thumbs img { width: 88px; height: 52px; object-fit: cover; border-radius: 6px; display: block; background: #333; }
@media (max-width: 640px) { .ull360-thumbs { display: none; } }

/* Brujula */
.ull360-compass { position: absolute; top: 64px; right: 12px; width: 44px; height: 44px; z-index: 18;
  background: var(--u3-bg); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--u3-fg); }

/* Panel/lightbox */
.ull360-panel-backdrop { position: absolute; inset: 0; background: rgba(2, 6, 23, .7); z-index: 32; display: flex;
  align-items: center; justify-content: center; padding: 20px; }
.ull360-panel { background: var(--u3-bg-solid); color: var(--u3-fg); border-radius: var(--u3-radius); max-width: min(760px, 94vw);
  max-height: min(84vh, 900px); width: 100%; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 48px rgba(0,0,0,.5); }
.ull360-panel--wide { max-width: min(1080px, 96vw); }
.ull360-panel__head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid rgba(128,128,160,.25); }
.ull360-panel__head h2 { margin: 0; font-size: 17px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ull360-panel__body { overflow-y: auto; padding: 16px; flex: 1; -webkit-overflow-scrolling: touch; }
.ull360-panel__body--flush { padding: 0; }
.ull360-panel__body img { max-width: 100%; height: auto; }
.ull360-prose { line-height: 1.6; font-size: 15px; }
.ull360-prose h1, .ull360-prose h2, .ull360-prose h3 { line-height: 1.25; }
.ull360-prose a { color: var(--u3-primary); }
.ull360-prose table { border-collapse: collapse; width: 100%; }
.ull360-prose td, .ull360-prose th { border: 1px solid rgba(128,128,160,.35); padding: 6px 10px; text-align: left; }
.ull360-prose code { background: rgba(128,128,160,.2); padding: 1px 5px; border-radius: 4px; font-size: .9em; }

/* Zoom profundo de imagen */
.ull360-deepzoom { position: relative; overflow: hidden; background: #000; touch-action: none; min-height: 300px; height: 60vh; }
.ull360-deepzoom img { position: absolute; transform-origin: 0 0; user-select: none; -webkit-user-drag: none; max-width: none; }
.ull360-deepzoom__caption { padding: 10px 16px; color: var(--u3-fg-dim); font-size: 13px; }

/* Galeria */
.ull360-gallery { position: relative; background: #000; }
.ull360-gallery__main { width: 100%; height: 52vh; object-fit: contain; display: block; }
.ull360-gallery__nav { position: absolute; top: 50%; transform: translateY(-50%); }
.ull360-gallery__nav--prev { left: 8px; } .ull360-gallery__nav--next { right: 8px; }
.ull360-gallery__thumbs { display: flex; gap: 6px; padding: 10px; overflow-x: auto; }
.ull360-gallery__thumbs img { width: 72px; height: 46px; object-fit: cover; border-radius: 6px; cursor: pointer; opacity: .6; }
.ull360-gallery__thumbs img[aria-current="true"] { opacity: 1; outline: 2px solid var(--u3-primary); }
.ull360-gallery__meta { padding: 10px 16px; }

/* Comparador */
.ull360-compare { position: relative; overflow: hidden; touch-action: none; user-select: none; }
.ull360-compare img { display: block; width: 100%; height: auto; pointer-events: none; }
.ull360-compare__after { position: absolute; inset: 0; overflow: hidden; }
.ull360-compare__handle { position: absolute; top: 0; bottom: 0; width: 4px; background: #fff; cursor: ew-resize; z-index: 2;
  box-shadow: 0 0 8px rgba(0,0,0,.6); }
.ull360-compare__handle::after { content: ""; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  width: 44px; height: 44px; border-radius: 50%; background: var(--u3-bg); border: 2px solid #fff; }
.ull360-compare__tag { position: absolute; top: 10px; padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,.65);
  color: #fff; font-size: 12px; z-index: 1; }

/* Formularios */
.ull360-form label { display: block; font-size: 14px; margin: 12px 0 4px; }
.ull360-form input, .ull360-form select, .ull360-form textarea { width: 100%; padding: 10px; border-radius: 8px;
  border: 1px solid rgba(128,128,160,.4); background: transparent; color: inherit; font-size: 14px; font-family: inherit; }
.ull360-form .ull360-check { display: flex; gap: 8px; align-items: center; }
.ull360-form .ull360-check input { width: auto; }
.ull360-form__error { color: #f87171; font-size: 13px; margin-top: 4px; }
.ull360-primary-btn { background: var(--u3-primary); color: #fff; border: none; border-radius: 8px; padding: 12px 20px;
  font-size: 15px; cursor: pointer; margin-top: 16px; min-height: 44px; }
.ull360-primary-btn:disabled { opacity: .5; }

/* Quiz */
.ull360-quiz__option { display: flex; gap: 10px; align-items: flex-start; padding: 10px; margin: 6px 0; border-radius: 10px;
  border: 1px solid rgba(128,128,160,.35); cursor: pointer; }
.ull360-quiz__option[data-state="correct"] { border-color: #34d399; background: rgba(52, 211, 153, .12); }
.ull360-quiz__option[data-state="wrong"] { border-color: #f87171; background: rgba(248, 113, 113, .12); }
.ull360-quiz__feedback { margin-top: 12px; padding: 10px 14px; border-radius: 10px; font-size: 14px; }
.ull360-quiz__feedback--ok { background: rgba(52, 211, 153, .15); color: #34d399; }
.ull360-quiz__feedback--ko { background: rgba(248, 113, 113, .15); color: #f87171; }

/* Plano de planta / mapa */
.ull360-mappanel { position: absolute; left: 12px; bottom: 70px; width: min(380px, 70vw); background: var(--u3-bg-solid);
  border-radius: var(--u3-radius); z-index: 21; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.45); }
.ull360-mappanel__head { display: flex; align-items: center; padding: 8px 8px 8px 14px; color: var(--u3-fg); }
.ull360-mappanel__head span { flex: 1; font-size: 14px; font-weight: 600; }
.ull360-floorplan { position: relative; }
.ull360-floorplan img { width: 100%; display: block; }
.ull360-floorplan__marker { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
  background: #64748b; border: 2px solid #fff; cursor: pointer; padding: 0; }
.ull360-floorplan__marker[aria-current="true"] { background: var(--u3-primary); z-index: 2; }
.ull360-floorplan__radar { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; pointer-events: none; z-index: 1; }
.ull360-floorplan__levels { display: flex; gap: 6px; padding: 8px 14px; }
.ull360-floorplan__levels button { border: 1px solid rgba(128,128,160,.4); background: none; color: var(--u3-fg);
  border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.ull360-floorplan__levels button[aria-pressed="true"] { background: var(--u3-primary); border-color: var(--u3-primary); color: #fff; }
.ull360-geomap { height: 260px; }

/* Pantallas de bienvenida/final */
.ull360-screen { position: absolute; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center;
  background: rgba(2, 6, 23, .8); backdrop-filter: blur(6px); padding: 24px; }
.ull360-screen__card { max-width: 560px; text-align: center; color: #fff; background: var(--u3-bg-solid);
  padding: 36px; border-radius: 16px; box-shadow: 0 12px 48px rgba(0,0,0,.5); color: var(--u3-fg); max-height: 86vh; overflow-y: auto; }
.ull360-screen__card img { max-width: 100%; border-radius: 10px; margin-bottom: 18px; }
.ull360-screen__card h1 { margin: 0 0 10px; font-size: 26px; }
.ull360-screen__card p { color: var(--u3-fg-dim); line-height: 1.55; }
.ull360-screen__controls { display: flex; justify-content: center; gap: 18px; margin: 18px 0; color: var(--u3-fg-dim); font-size: 13px; }
.ull360-screen__controls div { display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 110px; }

/* Selector idioma / proyeccion */
.ull360-menu-pop { position: absolute; right: 64px; background: var(--u3-bg-solid); color: var(--u3-fg); border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,.5); z-index: 22; padding: 6px; min-width: 140px; }
.ull360-menu-pop button { display: flex; width: 100%; border: none; background: none; color: inherit; padding: 9px 12px;
  cursor: pointer; border-radius: 8px; font-size: 14px; text-align: left; }
.ull360-menu-pop button:hover, .ull360-menu-pop button[aria-pressed="true"] { background: rgba(128,128,160,.2); }

/* Marca de agua */
.ull360-watermark { position: absolute; left: 12px; top: 56px; z-index: 17; opacity: .85; }
.ull360-watermark img { height: 40px; }

/* Toast */
.ull360-toast { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); background: var(--u3-bg-solid);
  color: var(--u3-fg); border-radius: 999px; padding: 10px 18px; font-size: 14px; z-index: 60; box-shadow: 0 4px 16px rgba(0,0,0,.4); }

/* Indicador de carga */
.ull360-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 15; pointer-events: none; }
.ull360-loading__spinner { width: 46px; height: 46px; border-radius: 50%; border: 4px solid rgba(255,255,255,.25);
  border-top-color: var(--u3-primary); animation: u3spin 1s linear infinite; }
@keyframes u3spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ull360-loading__spinner { animation-duration: 2.5s; } }

/* Modo accesible */
.ull360-accessible { position: absolute; inset: 0; z-index: 50; overflow-y: auto; background: var(--u3-bg-solid); color: var(--u3-fg);
  padding: 24px; }
.ull360-accessible main { max-width: 760px; margin: 0 auto; }
.ull360-accessible img { max-width: 100%; border-radius: 10px; }
.ull360-accessible section { border-bottom: 1px solid rgba(128,128,160,.25); padding: 24px 0; }
.ull360-skiplink { position: absolute; left: 8px; top: -60px; z-index: 70; background: var(--u3-primary); color: #fff;
  padding: 10px 16px; border-radius: 8px; transition: top .2s; }
.ull360-skiplink:focus { top: 8px; }

/* Chat en vivo */
.ull360-live { position: absolute; right: 12px; top: 64px; width: min(300px, 80vw); background: var(--u3-bg-solid); color: var(--u3-fg);
  border-radius: var(--u3-radius); z-index: 23; box-shadow: 0 6px 24px rgba(0,0,0,.45); display: flex; flex-direction: column; max-height: 50vh; }
.ull360-live__head { padding: 10px 14px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.ull360-live__msgs { flex: 1; overflow-y: auto; padding: 0 14px; font-size: 13px; }
.ull360-live__msgs p { margin: 6px 0; }
.ull360-live__msgs .who { color: var(--u3-primary); font-weight: 600; }
.ull360-live__input { display: flex; gap: 6px; padding: 10px; }
.ull360-live__input input { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(128,128,160,.4);
  background: transparent; color: inherit; }
.ull360-live-pointer { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
  background: var(--u3-primary); border: 3px solid #fff; z-index: 24; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,.5); }

/* Video overlay controls */
.ull360-videobar { position: absolute; left: 50%; transform: translateX(-50%); bottom: 70px; display: flex; align-items: center;
  gap: 10px; background: var(--u3-bg); border-radius: 999px; padding: 8px 14px; z-index: 20; color: var(--u3-fg); }
.ull360-videobar input[type="range"] { width: min(300px, 40vw); accent-color: var(--u3-primary); }
.ull360-videobar button { background: none; border: none; color: inherit; cursor: pointer; width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center; }
.ull360-videobar select { background: transparent; color: inherit; border: none; font-size: 13px; }
`;

let injected = false;
export function injectStyles(customCss?: string): void {
  if (!injected) {
    const style = document.createElement("style");
    style.id = "ull360-viewer-styles";
    style.textContent = VIEWER_CSS;
    document.head.appendChild(style);
    injected = true;
  }
  if (customCss != null && customCss !== "" && document.getElementById("ull360-custom-css") == null) {
    const style = document.createElement("style");
    style.id = "ull360-custom-css";
    style.textContent = sanitizeCss(customCss);
    document.head.appendChild(style);
  }
}

/** Saneado basico de CSS de autor: sin @import ni url() javascript. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]+;/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/url\s*\(\s*['"]?\s*javascript:/gi, "url(about:blank");
}
