/**
 * Hoja de estilos del visor. Se inyecta una sola vez.
 *
 * Sistema visual: "cristal" oscuro con desenfoque y borde luminoso para todo
 * el cromo flotante, de modo que la interfaz sea legible sobre CUALQUIER
 * panorama (cielos quemados, interiores oscuros, texturas complejas).
 * Los paneles y menus son opacos; solo los controles flotantes usan blur.
 * Temas: oscuro (por defecto), claro, auto y tema institucional ULL.
 * Contraste AA y objetivos tactiles >= 44 px en toda la interfaz.
 */
export const VIEWER_CSS = `
.ull360-viewer {
  --u3-primary: #6d7bc4;
  --u3-primary-strong: #8b98e8;
  --u3-accent: #e8b64c;
  /* cristal flotante: siempre legible sobre el panorama */
  --u3-glass: rgba(12, 16, 30, 0.66);
  --u3-glass-strong: rgba(12, 16, 30, 0.82);
  --u3-glass-border: rgba(255, 255, 255, 0.16);
  --u3-glass-fg: #f4f6ff;
  --u3-glass-dim: rgba(228, 232, 250, 0.72);
  --u3-blur: blur(18px) saturate(1.5);
  /* superficies opacas: paneles, menus, pantallas */
  --u3-bg-solid: #12172b;
  --u3-surface-2: #1c2340;
  --u3-border: rgba(255, 255, 255, 0.1);
  --u3-fg: #eef1fb;
  --u3-fg-dim: #a3abce;
  --u3-radius: 14px;
  --u3-shadow: 0 2px 6px rgba(2, 4, 14, 0.28), 0 12px 32px rgba(2, 4, 14, 0.34);
  --u3-font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-family: var(--u3-font);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.ull360-viewer[data-theme="light"] {
  --u3-glass: rgba(252, 253, 255, 0.78);
  --u3-glass-strong: rgba(252, 253, 255, 0.92);
  --u3-glass-border: rgba(15, 23, 42, 0.14);
  --u3-glass-fg: #101527;
  --u3-glass-dim: rgba(30, 38, 70, 0.7);
  --u3-bg-solid: #f7f8fd;
  --u3-surface-2: #eceef8;
  --u3-border: rgba(15, 23, 42, 0.1);
  --u3-fg: #131a30;
  --u3-fg-dim: #5b6284;
  --u3-shadow: 0 2px 6px rgba(20, 26, 60, 0.1), 0 12px 32px rgba(20, 26, 60, 0.14);
}
@media (prefers-color-scheme: light) {
  .ull360-viewer[data-theme="auto"] {
    --u3-glass: rgba(252, 253, 255, 0.78);
    --u3-glass-strong: rgba(252, 253, 255, 0.92);
    --u3-glass-border: rgba(15, 23, 42, 0.14);
    --u3-glass-fg: #101527;
    --u3-glass-dim: rgba(30, 38, 70, 0.7);
    --u3-bg-solid: #f7f8fd;
    --u3-surface-2: #eceef8;
    --u3-border: rgba(15, 23, 42, 0.1);
    --u3-fg: #131a30;
    --u3-fg-dim: #5b6284;
  }
}
.ull360-viewer[data-theme="ull"] { --u3-primary: #7d2fa8; --u3-primary-strong: #b07ad6; }

.ull360-viewer *, .ull360-viewer *::before, .ull360-viewer *::after { box-sizing: border-box; }
.ull360-viewer button { font-family: inherit; }
.ull360-viewer :focus-visible { outline: 2px solid var(--u3-primary-strong); outline-offset: 2px; border-radius: 6px; }

/* ============ Hotspots ============
   El ancla exterior (.ull360-hotspot-anchor) la posiciona Marzipano, que
   reescribe display y transform en cada frame: no debe llevar estilo propio.
   Todo el estilo vive en el boton interior, centrado sobre el ancla. */
.ull360-hotspot-anchor { pointer-events: none; }
.ull360-hotspot { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); background: none; border: none;
  cursor: pointer; padding: 0; color: #fff; pointer-events: auto; }
.ull360-hotspot__scale { display: flex; align-items: center; justify-content: center; }
.ull360-hotspot__icon { display: flex; align-items: center; justify-content: center; transition: transform .18s cubic-bezier(.2,.8,.3,1.2); }
.ull360-hotspot__icon--chip { position: relative; background: rgba(10, 14, 28, 0.55); backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4); border: 1.5px solid rgba(255, 255, 255, 0.65); border-radius: 50%;
  box-shadow: 0 2px 10px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.18); min-width: 46px; min-height: 46px; }
.ull360-hotspot:hover .ull360-hotspot__icon, .ull360-hotspot:focus-visible .ull360-hotspot__icon { transform: scale(1.12); }
.ull360-hotspot:hover .ull360-hotspot__icon--chip, .ull360-hotspot:focus-visible .ull360-hotspot__icon--chip {
  border-color: #fff; background: rgba(20, 28, 54, 0.75); box-shadow: 0 4px 18px rgba(0,0,0,.5), 0 0 0 5px rgba(255,255,255,.14); }
/* Etiqueta bajo el chip, en absoluto y centrada: su anchura no mueve el ancla. */
.ull360-hotspot__label { position: absolute; top: calc(100% + 7px); left: 50%; transform: translateX(-50%);
  background: rgba(10, 14, 28, 0.62); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,.16); color: #fff; padding: 5px 13px; border-radius: 14px;
  font-size: 12.5px; font-weight: 600; letter-spacing: .01em; line-height: 1.3; text-align: center;
  width: max-content; max-width: min(260px, 42vw); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,.5); box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.ull360-hotspot__label--hover { opacity: 0; transform: translateX(-50%) translateY(-3px); transition: opacity .18s ease, transform .18s ease; }
.ull360-hotspot:hover .ull360-hotspot__label--hover, .ull360-hotspot:focus-visible .ull360-hotspot__label--hover { opacity: 1; transform: translateX(-50%); }
.ull360-hotspot--pulse .ull360-hotspot__icon--chip::after { content: ""; position: absolute; inset: -7px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.8); animation: u3pulse 2.2s ease-out infinite; }
@keyframes u3pulse { 0% { transform: scale(.75); opacity: .9; } 100% { transform: scale(1.55); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ull360-hotspot--pulse .ull360-hotspot__icon--chip::after { animation: none; display: none; } }
.ull360-degraded .ull360-hotspot--pulse .ull360-hotspot__icon--chip::after { animation: none; display: none; }
.ull360-hotspot--floor-arrow .ull360-hotspot__scale { transform: perspective(300px) rotateX(52deg); }
.ull360-hotspot--dragging { cursor: grabbing; }
.ull360-hotspot--dragging .ull360-hotspot__icon--chip { border-color: var(--u3-primary-strong); box-shadow: 0 0 0 5px rgba(139,152,232,.35), 0 6px 22px rgba(0,0,0,.5); }
.ull360-hotspot--projected { pointer-events: auto; }
.ull360-hotspot--projected video { border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
/* Proyeccion activa: los hotspots dejan de corresponder a lo visible */
.ull360-projection-active .ull360-hotspot-anchor, .ull360-projection-active .ull360-polygons { visibility: hidden; }

/* ============ Barra superior flotante ============ */
.ull360-topbar { position: absolute; top: max(14px, env(safe-area-inset-top)); left: 14px; right: 14px;
  display: flex; align-items: center; gap: 10px; z-index: 20; pointer-events: none; }
.ull360-topbar > * { pointer-events: auto; }
.ull360-topbar__pill { display: flex; align-items: center; gap: 4px; background: var(--u3-glass);
  backdrop-filter: var(--u3-blur); -webkit-backdrop-filter: var(--u3-blur); border: 1px solid var(--u3-glass-border);
  border-radius: 999px; padding: 5px; box-shadow: var(--u3-shadow); max-width: min(60vw, 520px); }
.ull360-title { color: var(--u3-glass-fg); font-size: 14.5px; font-weight: 650; letter-spacing: -0.01em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; padding: 0 16px 0 10px; }
.ull360-logo { display: flex; align-items: center; background: var(--u3-glass); backdrop-filter: var(--u3-blur);
  -webkit-backdrop-filter: var(--u3-blur); border: 1px solid var(--u3-glass-border); border-radius: 14px;
  padding: 7px 12px; box-shadow: var(--u3-shadow); margin-left: auto; }
.ull360-logo img { height: 30px; display: block; }

/* ============ Botones de cristal ============ */
.ull360-btn { width: 46px; height: 46px; border: none; cursor: pointer; border-radius: 999px;
  background: transparent; color: var(--u3-glass-fg); display: flex; align-items: center; justify-content: center;
  transition: background .16s ease, transform .16s ease, color .16s ease; position: relative; }
.ull360-btn:hover { background: rgba(255, 255, 255, 0.14); transform: scale(1.06); }
.ull360-viewer[data-theme="light"] .ull360-btn:hover, .ull360-viewer[data-theme="auto"] .ull360-btn:hover { background: rgba(15, 23, 42, 0.09); }
.ull360-btn:active { transform: scale(.97); }
.ull360-btn[aria-pressed="true"] { background: var(--u3-primary); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.25); }
.ull360-btn:disabled { opacity: .35; cursor: default; transform: none; }
.ull360-btn:disabled:hover { background: transparent; }
/* botones sueltos (fuera de un dock) llevan su propio cristal */
:where(.ull360-topbar, .ull360-scenemenu__head, .ull360-mappanel__head, .ull360-panel__head, .ull360-screen, .ull360-gallery, .ull360-live__input) .ull360-btn { width: 40px; height: 40px; }
.ull360-btn--solo { background: var(--u3-glass); backdrop-filter: var(--u3-blur); -webkit-backdrop-filter: var(--u3-blur);
  border: 1px solid var(--u3-glass-border); box-shadow: var(--u3-shadow); }

/* ============ Docks laterales ============ */
.ull360-controls, .ull360-controls-left { position: absolute; bottom: max(16px, env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: 2px; z-index: 20; background: var(--u3-glass);
  backdrop-filter: var(--u3-blur); -webkit-backdrop-filter: var(--u3-blur);
  border: 1px solid var(--u3-glass-border); border-radius: 999px; padding: 6px; box-shadow: var(--u3-shadow); }
.ull360-controls { right: 16px; max-height: calc(100% - 120px); overflow-y: auto; scrollbar-width: none; }
.ull360-controls::-webkit-scrollbar { display: none; }
/* Dique plegado: solo queda el tirador, para dejar la escena limpia */
.ull360-controls.is-compact > *:not(.ull360-controls__toggle) { display: none; }
.ull360-controls__toggle { opacity: .8; }
.ull360-controls__toggle:hover { opacity: 1; }
.ull360-controls-left { left: 16px; }
.ull360-controls .ull360-divider { height: 1px; margin: 4px 8px; background: var(--u3-glass-border); border: none; }

/* ============ Menu de escenas (cajon opaco) ============ */
.ull360-scenemenu { position: absolute; top: 0; left: 0; bottom: 0; width: min(360px, 90vw); background: var(--u3-bg-solid);
  color: var(--u3-fg); z-index: 30; transform: translateX(-102%); transition: transform .3s cubic-bezier(.3,.9,.3,1);
  display: flex; flex-direction: column; box-shadow: 12px 0 48px rgba(0,0,0,.45); border-right: 1px solid var(--u3-border); }
.ull360-scenemenu[data-open="true"] { transform: translateX(0); }
@media (prefers-reduced-motion: reduce) { .ull360-scenemenu { transition: none; } }
.ull360-scenemenu__head { display: flex; align-items: center; gap: 8px; padding: 18px 16px 12px; }
.ull360-scenemenu__head h2 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; flex: 1; }
.ull360-scenemenu__search { margin: 0 16px 12px; position: relative; }
.ull360-scenemenu__search input { width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--u3-border);
  background: var(--u3-surface-2); color: inherit; font-size: 14px; font-family: inherit; transition: border-color .15s ease; }
.ull360-scenemenu__search input:focus { outline: none; border-color: var(--u3-primary); }
.ull360-scenemenu__search input::placeholder { color: var(--u3-fg-dim); }
.ull360-scenemenu__list { overflow-y: auto; flex: 1; padding: 0 12px 16px; }
.ull360-scenemenu__cat { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em;
  color: var(--u3-fg-dim); margin: 16px 6px 8px; }
.ull360-scenemenu__item { display: flex; gap: 12px; align-items: center; width: 100%; border: none; background: none;
  color: inherit; padding: 8px; border-radius: 14px; cursor: pointer; text-align: left;
  transition: background .15s ease, transform .15s ease; }
.ull360-scenemenu__item:hover { background: var(--u3-surface-2); transform: translateX(3px); }
.ull360-scenemenu__item[aria-current="true"] { background: var(--u3-surface-2); box-shadow: inset 0 0 0 1.5px var(--u3-primary); }
.ull360-scenemenu__item img { width: 84px; height: 52px; object-fit: cover; border-radius: 10px; background: #26304f;
  box-shadow: 0 2px 8px rgba(0,0,0,.25); }
.ull360-scenemenu__item span { font-size: 14px; font-weight: 550; }

/* ============ Carrusel de miniaturas ============ */
.ull360-thumbs { position: absolute; left: 50%; transform: translateX(-50%); bottom: max(16px, env(safe-area-inset-bottom));
  display: flex; gap: 8px; z-index: 19; max-width: min(64vw, 680px); overflow-x: auto; padding: 8px;
  background: var(--u3-glass); backdrop-filter: var(--u3-blur); -webkit-backdrop-filter: var(--u3-blur);
  border: 1px solid var(--u3-glass-border); border-radius: 18px; box-shadow: var(--u3-shadow); scrollbar-width: none; }
.ull360-thumbs::-webkit-scrollbar { display: none; }
.ull360-thumbs button { border: none; border-radius: 10px; padding: 0; cursor: pointer; background: none; flex-shrink: 0;
  position: relative; transition: transform .16s ease; }
.ull360-thumbs button:hover { transform: translateY(-3px); }
.ull360-thumbs button[aria-current="true"]::after { content: ""; position: absolute; inset: -3px; border-radius: 13px;
  border: 2px solid var(--u3-primary-strong); box-shadow: 0 0 12px rgba(139, 152, 232, .5); }
.ull360-thumbs img { width: 92px; height: 54px; object-fit: cover; border-radius: 10px; display: block; background: #26304f; }
@media (max-width: 720px) { .ull360-thumbs { display: none; } }

/* ============ Brujula ============ */
.ull360-compass { position: absolute; top: max(74px, calc(env(safe-area-inset-top) + 60px)); right: 16px; width: 46px; height: 46px;
  z-index: 18; background: var(--u3-glass); backdrop-filter: var(--u3-blur); -webkit-backdrop-filter: var(--u3-blur);
  border: 1px solid var(--u3-glass-border); border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: var(--u3-glass-fg); box-shadow: var(--u3-shadow); cursor: pointer; }
.ull360-compass__needle { transform-box: view-box; transform-origin: 50% 50%; transition: transform .12s linear; }
@media (prefers-reduced-motion: reduce) { .ull360-compass__needle { transition: none; } }

/* ============ Tooltip anclado ============ */
.ull360-tooltip-bubble { position: absolute; transform: translate(-50%, -100%); z-index: 33; max-width: min(300px, 60vw);
  background: var(--u3-bg-solid); color: var(--u3-fg); border: 1px solid var(--u3-border); border-radius: 12px;
  padding: 9px 13px; font-size: 13px; line-height: 1.45; box-shadow: 0 8px 28px rgba(0,0,0,.4); pointer-events: none;
  animation: u3fadein .15s ease; }
.ull360-tooltip-bubble::after { content: ""; position: absolute; left: 50%; bottom: -6px; transform: translateX(-50%) rotate(45deg);
  width: 10px; height: 10px; background: var(--u3-bg-solid); border-right: 1px solid var(--u3-border); border-bottom: 1px solid var(--u3-border); }

/* ============ Comparador dividido (dos visores sincronizados) ============ */
.ull360-split { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; height: min(70vh, 640px); background: var(--u3-border); }
.ull360-split__pane { position: relative; overflow: hidden; }
.ull360-split__pane iframe { width: 100%; height: 100%; border: 0; display: block; background: #0b1020; }
@media (max-width: 720px) { .ull360-split { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; } }

/* ============ Paneles / lightbox ============ */
.ull360-panel-backdrop { position: absolute; inset: 0; background: rgba(4, 7, 18, .62);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); z-index: 32; display: flex;
  align-items: center; justify-content: center; padding: 22px; animation: u3fadein .2s ease; }
@keyframes u3fadein { from { opacity: 0; } to { opacity: 1; } }
.ull360-panel { background: var(--u3-bg-solid); color: var(--u3-fg); border-radius: 20px; max-width: min(780px, 94vw);
  max-height: min(86vh, 940px); width: 100%; display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--u3-border); box-shadow: 0 24px 80px rgba(0,0,0,.55); animation: u3panelin .22s cubic-bezier(.2,.9,.3,1.1); }
@keyframes u3panelin { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ull360-panel, .ull360-panel-backdrop { animation: none; } }
.ull360-panel--wide { max-width: min(1100px, 96vw); }
.ull360-panel__head { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--u3-border); }
.ull360-panel__head h2 { margin: 0; font-size: 16.5px; font-weight: 700; letter-spacing: -0.01em; flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ull360-panel__body { overflow-y: auto; padding: 20px; flex: 1; -webkit-overflow-scrolling: touch; }
.ull360-panel__body--flush { padding: 0; }
.ull360-panel__body img { max-width: 100%; height: auto; }
.ull360-prose { line-height: 1.65; font-size: 15px; }
.ull360-prose h1, .ull360-prose h2, .ull360-prose h3 { line-height: 1.25; letter-spacing: -0.015em; }
.ull360-prose h2 { font-size: 21px; margin: .2em 0 .6em; }
.ull360-prose h3 { font-size: 17px; }
.ull360-prose a { color: var(--u3-primary-strong); text-decoration: underline; text-underline-offset: 3px; }
.ull360-prose table { border-collapse: collapse; width: 100%; }
.ull360-prose td, .ull360-prose th { border: 1px solid var(--u3-border); padding: 7px 12px; text-align: left; }
.ull360-prose th { background: var(--u3-surface-2); }
.ull360-prose code { background: var(--u3-surface-2); padding: 2px 6px; border-radius: 6px; font-size: .88em; }
.ull360-prose blockquote { border-left: 3px solid var(--u3-primary); margin: 1em 0; padding: .1em 0 .1em 1em; color: var(--u3-fg-dim); }

/* ============ Zoom profundo ============ */
.ull360-deepzoom { position: relative; overflow: hidden; background: #05070f; touch-action: none; min-height: 320px; height: 62vh; }
.ull360-deepzoom img { position: absolute; transform-origin: 0 0; user-select: none; -webkit-user-drag: none; max-width: none; }
.ull360-deepzoom__caption { padding: 12px 20px; color: var(--u3-fg-dim); font-size: 13.5px; }

/* ============ Galeria ============ */
.ull360-gallery { position: relative; background: #05070f; }
.ull360-gallery__main { width: 100%; height: 54vh; object-fit: contain; display: block; }
.ull360-gallery__nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(10,14,28,.6) !important;
  backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.18) !important; color: #fff !important; }
.ull360-gallery__nav:hover { background: rgba(30,40,80,.8) !important; }
.ull360-gallery__nav--prev { left: 12px; } .ull360-gallery__nav--next { right: 12px; }
.ull360-gallery__thumbs { display: flex; gap: 8px; padding: 12px 16px; overflow-x: auto; }
.ull360-gallery__thumbs img { width: 76px; height: 48px; object-fit: cover; border-radius: 8px; cursor: pointer;
  opacity: .55; transition: opacity .15s ease, transform .15s ease; }
.ull360-gallery__thumbs img:hover { opacity: .85; transform: translateY(-2px); }
.ull360-gallery__thumbs img[aria-current="true"] { opacity: 1; outline: 2px solid var(--u3-primary-strong); outline-offset: 2px; }
.ull360-gallery__meta { padding: 12px 20px 4px; }

/* ============ Comparador ============ */
.ull360-compare { position: relative; overflow: hidden; touch-action: none; user-select: none; }
.ull360-compare img { display: block; width: 100%; height: auto; pointer-events: none; }
.ull360-compare__after { position: absolute; inset: 0; overflow: hidden; }
.ull360-compare__handle { position: absolute; top: 0; bottom: 0; width: 3px; background: #fff; cursor: ew-resize; z-index: 2;
  box-shadow: 0 0 12px rgba(0,0,0,.7); }
.ull360-compare__handle::after { content: ""; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  width: 46px; height: 46px; border-radius: 50%; background: rgba(10,14,28,.75); backdrop-filter: blur(8px);
  border: 2px solid #fff; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m9 7-5 5 5 5'/%3E%3Cpath d='m15 7 5 5-5 5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: center; }
.ull360-compare__tag { position: absolute; top: 12px; padding: 5px 13px; border-radius: 999px; background: rgba(10,14,28,.72);
  backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.18); color: #fff; font-size: 12px; font-weight: 600; z-index: 1; }

/* ============ Formularios ============ */
.ull360-form label { display: block; font-size: 13.5px; font-weight: 600; margin: 14px 0 6px; }
.ull360-form input, .ull360-form select, .ull360-form textarea { width: 100%; padding: 11px 13px; border-radius: 10px;
  border: 1px solid var(--u3-border); background: var(--u3-surface-2); color: inherit; font-size: 14px; font-family: inherit;
  transition: border-color .15s ease, box-shadow .15s ease; }
.ull360-form input:focus, .ull360-form select:focus, .ull360-form textarea:focus { outline: none;
  border-color: var(--u3-primary); box-shadow: 0 0 0 3px rgba(109, 123, 196, .25); }
.ull360-form .ull360-check { display: flex; gap: 9px; align-items: center; }
.ull360-form .ull360-check input { width: auto; accent-color: var(--u3-primary); }
.ull360-form__error { color: #ff8f87; font-size: 13px; margin-top: 5px; }
.ull360-primary-btn { background: linear-gradient(180deg, var(--u3-primary-strong), var(--u3-primary));
  color: #fff; border: none; border-radius: 12px; padding: 13px 22px; font-size: 15px; font-weight: 650;
  font-family: inherit; cursor: pointer; margin-top: 16px; min-height: 46px;
  box-shadow: 0 2px 10px rgba(80, 95, 180, .4), inset 0 1px 0 rgba(255,255,255,.25);
  transition: filter .15s ease, transform .15s ease; }
.ull360-primary-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
.ull360-primary-btn:active { transform: none; }
.ull360-primary-btn:disabled { opacity: .5; transform: none; filter: none; }

/* ============ Quiz ============ */
.ull360-quiz__option { display: flex; gap: 11px; align-items: flex-start; padding: 13px 14px; margin: 8px 0; border-radius: 12px;
  border: 1.5px solid var(--u3-border); background: var(--u3-surface-2); cursor: pointer;
  transition: border-color .15s ease, background .15s ease; }
.ull360-quiz__option:hover { border-color: var(--u3-primary); }
.ull360-quiz__option input { accent-color: var(--u3-primary); margin-top: 2px; }
.ull360-quiz__option[data-state="correct"] { border-color: #35c98e; background: rgba(53, 201, 142, .12); }
.ull360-quiz__option[data-state="wrong"] { border-color: #ff7b72; background: rgba(255, 123, 114, .1); }
.ull360-quiz__feedback { margin-top: 14px; padding: 12px 16px; border-radius: 12px; font-size: 14px; font-weight: 550; }
.ull360-quiz__feedback--ok { background: rgba(53, 201, 142, .14); color: #4fe0a6; border: 1px solid rgba(53, 201, 142, .3); }
.ull360-quiz__feedback--ko { background: rgba(255, 123, 114, .12); color: #ff9d96; border: 1px solid rgba(255, 123, 114, .3); }

/* ============ Plano de planta / mapa ============ */
.ull360-mappanel { position: absolute; left: 16px; bottom: 78px; width: min(400px, 74vw); background: var(--u3-bg-solid);
  color: var(--u3-fg); border-radius: 18px; z-index: 21; overflow: hidden; border: 1px solid var(--u3-border);
  box-shadow: 0 16px 56px rgba(0,0,0,.5); animation: u3panelin .2s ease; }
.ull360-mappanel__head { display: flex; align-items: center; gap: 6px; padding: 10px 10px 10px 16px; }
.ull360-mappanel__head span { flex: 1; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
.ull360-floorplan { position: relative; }
.ull360-floorplan img { width: 100%; display: block; }
.ull360-floorplan__marker { position: absolute; width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px; border-radius: 50%;
  background: #7d879f; border: 2.5px solid #fff; cursor: pointer; padding: 0; box-shadow: 0 1px 6px rgba(0,0,0,.4);
  transition: transform .15s ease; }
.ull360-floorplan__marker:hover { transform: scale(1.35); }
.ull360-floorplan__marker[aria-current="true"] { background: var(--u3-primary-strong); z-index: 2;
  box-shadow: 0 0 0 4px rgba(139,152,232,.35), 0 1px 6px rgba(0,0,0,.4); }
.ull360-floorplan__radar { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; pointer-events: none; z-index: 1; }
.ull360-floorplan__levels { display: flex; gap: 6px; padding: 10px 16px; }
.ull360-floorplan__levels button { border: 1px solid var(--u3-border); background: var(--u3-surface-2); color: var(--u3-fg);
  border-radius: 9px; padding: 7px 14px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit;
  transition: background .15s ease; }
.ull360-floorplan__levels button[aria-pressed="true"] { background: var(--u3-primary); border-color: var(--u3-primary); color: #fff; }
.ull360-geomap { height: 270px; }

/* ============ Pantallas (bienvenida / final / ayuda) ============ */
.ull360-screen { position: absolute; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center;
  background: rgba(4, 7, 18, .68); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 24px;
  animation: u3fadein .25s ease; }
.ull360-screen__card { max-width: 600px; text-align: center; background: var(--u3-bg-solid); color: var(--u3-fg);
  padding: 40px 44px; border-radius: 24px; border: 1px solid var(--u3-border); box-shadow: 0 32px 90px rgba(0,0,0,.6);
  max-height: 88vh; overflow-y: auto; position: relative; animation: u3panelin .3s cubic-bezier(.2,.9,.3,1.1); }
.ull360-screen__card::before { content: ""; position: absolute; top: 0; left: 15%; right: 15%; height: 2px;
  background: linear-gradient(90deg, transparent, var(--u3-primary-strong), transparent); }
.ull360-screen__card img { max-width: 100%; border-radius: 14px; margin-bottom: 20px; }
.ull360-screen__card h1 { margin: 0 0 12px; font-size: 27px; font-weight: 750; letter-spacing: -0.025em; }
.ull360-screen__card p { color: var(--u3-fg-dim); line-height: 1.6; font-size: 15px; }
.ull360-screen__controls { display: flex; justify-content: center; gap: 26px; margin: 24px 0 6px; color: var(--u3-fg-dim); font-size: 12.5px; }
.ull360-screen__controls div { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 120px; }
.ull360-screen__controls svg { color: var(--u3-primary-strong); }

/* ============ Popover de menus (idioma, proyeccion) ============ */
.ull360-menu-pop { position: absolute; right: 74px; background: var(--u3-bg-solid); color: var(--u3-fg); border-radius: 14px;
  border: 1px solid var(--u3-border); box-shadow: 0 16px 48px rgba(0,0,0,.55); z-index: 22; padding: 6px; min-width: 170px;
  animation: u3panelin .16s ease; }
.ull360-menu-pop button { display: flex; width: 100%; border: none; background: none; color: inherit; padding: 10px 14px;
  cursor: pointer; border-radius: 9px; font-size: 14px; font-weight: 550; font-family: inherit; text-align: left;
  transition: background .12s ease; }
.ull360-menu-pop button:hover { background: var(--u3-surface-2); }
.ull360-menu-pop button[aria-pressed="true"] { background: var(--u3-primary); color: #fff; }

/* ============ Marca de agua ============ */
.ull360-watermark { position: absolute; left: 16px; top: max(74px, calc(env(safe-area-inset-top) + 60px)); z-index: 17;
  opacity: .92; filter: drop-shadow(0 2px 6px rgba(0,0,0,.5)); transition: opacity .15s ease; }
.ull360-watermark:hover { opacity: 1; }
.ull360-watermark img { height: 42px; }

/* ============ Toast ============ */
.ull360-toast { position: absolute; left: 50%; bottom: 92px; transform: translateX(-50%); background: var(--u3-glass-strong);
  backdrop-filter: var(--u3-blur); -webkit-backdrop-filter: var(--u3-blur); border: 1px solid var(--u3-glass-border);
  color: var(--u3-glass-fg); border-radius: 999px; padding: 11px 20px; font-size: 14px; font-weight: 550; z-index: 60;
  box-shadow: var(--u3-shadow); animation: u3toastin .25s cubic-bezier(.2,.9,.3,1.2); }
@keyframes u3toastin { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* ============ Indicador de carga ============ */
.ull360-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 15; pointer-events: none; }
.ull360-loading__spinner { width: 52px; height: 52px; border-radius: 50%; position: relative;
  border: 3px solid rgba(255,255,255,.18); border-top-color: #fff; animation: u3spin .9s cubic-bezier(.5,.2,.5,.8) infinite;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,.4)); }
.ull360-loading__spinner::after { content: ""; position: absolute; inset: 7px; border-radius: 50%;
  border: 3px solid transparent; border-top-color: var(--u3-primary-strong); animation: u3spin 1.4s linear infinite reverse; }
@keyframes u3spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ull360-loading__spinner, .ull360-loading__spinner::after { animation-duration: 2.5s; } }

/* ============ Modo accesible ============ */
.ull360-accessible { position: absolute; inset: 0; z-index: 50; overflow-y: auto; background: var(--u3-bg-solid); color: var(--u3-fg);
  padding: 28px 24px; }
.ull360-accessible main { max-width: 780px; margin: 0 auto; }
.ull360-accessible h1 { font-size: 30px; letter-spacing: -0.025em; }
.ull360-accessible img { max-width: 100%; border-radius: 14px; }
.ull360-accessible section { border-bottom: 1px solid var(--u3-border); padding: 28px 0; }
.ull360-skiplink { position: absolute; left: 10px; top: -60px; z-index: 70; background: var(--u3-primary); color: #fff;
  padding: 11px 18px; border-radius: 10px; font-weight: 600; text-decoration: none; transition: top .2s; }
.ull360-skiplink:focus { top: 10px; }

/* ============ Sala en vivo ============ */
.ull360-live { position: absolute; right: 16px; top: max(74px, calc(env(safe-area-inset-top) + 60px)); width: min(310px, 82vw);
  background: var(--u3-bg-solid); color: var(--u3-fg); border-radius: 18px; z-index: 23; border: 1px solid var(--u3-border);
  box-shadow: 0 16px 56px rgba(0,0,0,.5); display: flex; flex-direction: column; max-height: 52vh; animation: u3panelin .2s ease; }
.ull360-live__head { padding: 13px 16px; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 9px;
  border-bottom: 1px solid var(--u3-border); }
.ull360-live__head svg { color: #ff6b60; animation: u3livepulse 2s ease infinite; }
@keyframes u3livepulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
.ull360-live__msgs { flex: 1; overflow-y: auto; padding: 6px 16px; font-size: 13.5px; }
.ull360-live__msgs p { margin: 7px 0; line-height: 1.45; }
.ull360-live__msgs .who { color: var(--u3-primary-strong); font-weight: 700; }
.ull360-live__input { display: flex; gap: 7px; padding: 12px; border-top: 1px solid var(--u3-border); }
.ull360-live__input input { flex: 1; padding: 9px 13px; border-radius: 10px; border: 1px solid var(--u3-border);
  background: var(--u3-surface-2); color: inherit; font-family: inherit; font-size: 13.5px; }
.ull360-live__input input:focus { outline: none; border-color: var(--u3-primary); }
.ull360-live-pointer { position: absolute; width: 24px; height: 24px; margin: -12px 0 0 -12px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, var(--u3-primary-strong), var(--u3-primary)); border: 3px solid #fff;
  z-index: 24; pointer-events: none; box-shadow: 0 0 0 6px rgba(139,152,232,.3), 0 3px 12px rgba(0,0,0,.5); }

/* ============ Barra de video ============ */
.ull360-videobar { position: absolute; left: 50%; transform: translateX(-50%); bottom: 84px; display: flex; align-items: center;
  gap: 10px; background: var(--u3-glass); backdrop-filter: var(--u3-blur); -webkit-backdrop-filter: var(--u3-blur);
  border: 1px solid var(--u3-glass-border); border-radius: 999px; padding: 8px 18px; z-index: 20;
  color: var(--u3-glass-fg); box-shadow: var(--u3-shadow); }
.ull360-videobar input[type="range"] { width: min(320px, 42vw); accent-color: var(--u3-primary-strong); }
.ull360-videobar button { background: none; border: none; color: inherit; cursor: pointer; width: 38px; height: 38px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background .15s ease; }
.ull360-videobar button:hover { background: rgba(255,255,255,.14); }
.ull360-videobar select { background: transparent; color: inherit; border: none; font-size: 13px; font-family: inherit; font-weight: 600; }
.ull360-videobar select option { color: #111; }

/* ============ HUD del tesoro ============ */
.ull360-toast--hud { bottom: auto; top: max(74px, calc(env(safe-area-inset-top) + 60px)); animation: none; }
/* Retículo de mirada (giroscopio): sostener la mirada acciona el marcador */
.ull360-gaze{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:60;opacity:.7;transition:opacity .2s}
.ull360-gaze.is-cursor{opacity:.95}
.ull360-gaze.is-active{opacity:1}
.ull360-gaze-track{fill:none;stroke:rgba(255,255,255,.32);stroke-width:4}
.ull360-gaze-ring{fill:none;stroke:var(--u3-primary,#5c068c);stroke-width:4;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;filter:drop-shadow(0 0 3px rgba(0,0,0,.55))}
.ull360-gaze-dot{fill:#fff;filter:drop-shadow(0 0 2px rgba(0,0,0,.6))}
.ull360-gaze-tip{position:absolute;left:50%;top:calc(100% + 8px);transform:translateX(-50%);white-space:nowrap;max-width:70vw;overflow:hidden;text-overflow:ellipsis;padding:5px 12px;border-radius:999px;background:rgba(8,10,22,.86);color:#fff;font:600 13px/1.3 var(--u3-font,system-ui);box-shadow:0 2px 10px rgba(0,0,0,.35);opacity:0;transition:opacity .15s}
.ull360-gaze.is-active .ull360-gaze-tip{opacity:1}
.ull360-gaze-tip:empty{display:none}
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
