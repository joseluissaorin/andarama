import type { Hotspot, Scene } from "@ull360/schema";
import { resolveUrl, type TourViewer } from "@ull360/viewer";
import { el } from "./dom.js";
import { renderMarkdown } from "./markdown.js";
import type { Translator } from "./i18n.js";

/**
 * Modo de contenido accesible: vista alternativa lineal del tour (lista de
 * escenas con descripciones, imagenes y contenidos de hotspots en HTML
 * semantico). Tambien la genera el servidor para SEO; esta version corre en
 * cliente para el boton "version accesible" del visor y los exports.
 */
export function buildAccessibleView(viewer: TourViewer, t: Translator, baseUrl: string, onClose: () => void): HTMLElement {
  const tour = viewer.tour;
  const root = el("div", { className: "ull360-accessible", role: "document", lang: viewer.currentLang() });
  const main = el("main");
  const back = el("button", { className: "ull360-primary-btn", type: "button", text: t("back_to_360") });
  back.addEventListener("click", onClose);
  main.appendChild(back);
  main.appendChild(el("h1", { text: viewer.text(tour.meta.title) }));
  const desc = viewer.text(tour.meta.description);
  if (desc !== "") main.appendChild(el("p", { text: desc }));
  main.appendChild(el("p", { text: t("accessible_intro") }));

  const visibleScenes = tour.scenes.filter((s) => s.hidden !== true);
  visibleScenes.forEach((scene, i) => {
    main.appendChild(renderScene(viewer, scene, i, visibleScenes.length, t, baseUrl, onClose));
  });
  root.appendChild(main);
  return root;
}

function renderScene(
  viewer: TourViewer,
  scene: Scene,
  index: number,
  total: number,
  t: Translator,
  baseUrl: string,
  onClose: () => void,
): HTMLElement {
  const section = el("section", { "aria-label": viewer.text(scene.title) });
  section.appendChild(el("p", { text: t("scene_of", { index: index + 1, total }), style: "color:var(--u3-fg-dim);font-size:13px;margin:0;" }));
  section.appendChild(el("h2", { text: viewer.text(scene.title) }));
  const alt = viewer.text(scene.altText);
  const thumb = scene.thumbnail ?? (scene.source.kind === "multires" ? scene.source.preview : (scene.source as { preview?: string }).preview);
  if (thumb != null) {
    section.appendChild(el("img", { src: resolveUrl(baseUrl, thumb), alt, loading: "lazy" }));
  } else if (alt !== "") {
    section.appendChild(el("p", { text: alt }));
  }
  const desc = viewer.text(scene.description);
  if (desc !== "") section.appendChild(el("p", { text: desc }));

  const jump = el("button", { className: "ull360-primary-btn", type: "button", text: viewer.text(scene.title), "aria-label": `${t("back_to_360")}: ${viewer.text(scene.title)}` });
  jump.addEventListener("click", () => {
    onClose();
    void viewer.goTo(scene.id);
  });
  section.appendChild(jump);

  const items = scene.hotspots
    .map((hs) => renderHotspot(viewer, hs, baseUrl))
    .filter((n): n is HTMLElement => n != null);
  if (items.length > 0) {
    const list = el("ul");
    for (const item of items) {
      const li = el("li");
      li.appendChild(item);
      list.appendChild(li);
    }
    section.appendChild(list);
  }
  return section;
}

function renderHotspot(viewer: TourViewer, hs: Hotspot, baseUrl: string): HTMLElement | null {
  const label = viewer.text(hs.label) || viewer.text(hs.altText);
  switch (hs.type) {
    case "text": {
      const div = el("div");
      if (label !== "") div.appendChild(el("h3", { text: label }));
      const prose = el("div", { className: "ull360-prose" });
      prose.innerHTML = renderMarkdown(viewer.text(hs.body));
      div.appendChild(prose);
      return div;
    }
    case "image": {
      const fig = el("figure");
      fig.appendChild(el("img", { src: resolveUrl(baseUrl, hs.url), alt: viewer.text(hs.altText) || label, loading: "lazy" }));
      const caption = viewer.text(hs.caption);
      if (caption !== "") fig.appendChild(el("figcaption", { text: caption }));
      return fig;
    }
    case "gallery": {
      const div = el("div");
      if (label !== "") div.appendChild(el("h3", { text: label }));
      for (const item of hs.items) {
        const fig = el("figure");
        fig.appendChild(el("img", { src: resolveUrl(baseUrl, item.url), alt: viewer.text(item.title), loading: "lazy" }));
        const cap = viewer.text(item.description);
        if (cap !== "") fig.appendChild(el("figcaption", { text: cap }));
        div.appendChild(fig);
      }
      return div;
    }
    case "audio": {
      const div = el("div");
      if (label !== "") div.appendChild(el("h3", { text: label }));
      const audio = el("audio", { controls: true, src: resolveUrl(baseUrl, hs.url) });
      div.appendChild(audio);
      const transcript = viewer.text(hs.transcript);
      if (transcript !== "") div.appendChild(el("p", { text: transcript }));
      return div;
    }
    case "videoFile": {
      const div = el("div");
      if (label !== "") div.appendChild(el("h3", { text: label }));
      div.appendChild(el("video", { controls: true, src: resolveUrl(baseUrl, hs.url), style: "max-width:100%;" }));
      return div;
    }
    case "pdf":
      return el("a", { href: resolveUrl(baseUrl, hs.url), text: label || "PDF", target: "_blank", rel: "noopener" });
    case "link":
      return el("a", { href: hs.url, text: label || hs.url, target: "_blank", rel: "noopener" });
    case "embedVideo":
      return el("a", {
        href:
          hs.provider === "youtube"
            ? `https://www.youtube.com/watch?v=${encodeURIComponent(hs.videoId)}`
            : hs.provider === "vimeo"
              ? `https://vimeo.com/${encodeURIComponent(hs.videoId)}`
              : `${hs.host ?? ""}/w/${encodeURIComponent(hs.videoId)}`,
        text: label || "Video",
        target: "_blank",
        rel: "noopener",
      });
    case "tooltip":
      return el("p", { text: viewer.text(hs.text) });
    case "navigation":
    case "quiz":
    case "form":
    case "state":
    case "polygon":
    case "compare":
    case "web":
    case "model3d":
      return label !== "" ? el("p", { text: label }) : null;
    default:
      return null;
  }
}
