import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Box,
  Building2,
  Camera,
  Coffee,
  Columns2,
  DoorOpen,
  ExternalLink,
  Eye,
  FileText,
  FlaskConical,
  Footprints,
  GalleryHorizontalEnd,
  Globe,
  GraduationCap,
  CircleHelp,
  Image as ImageIcon,
  Info,
  ClipboardList,
  Landmark,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  Pentagon,
  Play,
  Star,
  Text,
  ToggleLeft,
  Trees,
  Video,
  Volume2,
} from "lucide";
import type { HotspotType } from "@andarama/schema";

/**
 * Iconografia SVG del visor (lucide, licencia ISC). Nunca emojis.
 * IconNode: [tag, attrs][]
 */
export type IconNode = [string, Record<string, string>][];

const REGISTRY: Record<string, IconNode> = {
  "arrow-down": ArrowDown as IconNode,
  "arrow-left": ArrowLeft as IconNode,
  "arrow-right": ArrowRight as IconNode,
  "arrow-up": ArrowUp as IconNode,
  "arrow-up-right": ArrowUpRight as IconNode,
  "audio-lines": AudioLines as IconNode,
  "book-open": BookOpen as IconNode,
  "building-2": Building2 as IconNode,
  camera: Camera as IconNode,
  coffee: Coffee as IconNode,
  eye: Eye as IconNode,
  "flask-conical": FlaskConical as IconNode,
  footprints: Footprints as IconNode,
  "graduation-cap": GraduationCap as IconNode,
  landmark: Landmark as IconNode,
  "log-in": LogIn as IconNode,
  "log-out": LogOut as IconNode,
  star: Star as IconNode,
  trees: Trees as IconNode,
  box: Box as IconNode,
  "columns-2": Columns2 as IconNode,
  "door-open": DoorOpen as IconNode,
  "external-link": ExternalLink as IconNode,
  "file-text": FileText as IconNode,
  "gallery-horizontal-end": GalleryHorizontalEnd as IconNode,
  globe: Globe as IconNode,
  "circle-help": CircleHelp as IconNode,
  image: ImageIcon as IconNode,
  info: Info as IconNode,
  "clipboard-list": ClipboardList as IconNode,
  "map-pin": MapPin as IconNode,
  "message-square": MessageSquare as IconNode,
  pentagon: Pentagon as IconNode,
  play: Play as IconNode,
  text: Text as IconNode,
  "toggle-left": ToggleLeft as IconNode,
  video: Video as IconNode,
  "volume-2": Volume2 as IconNode,
};

/** Permite a la skin (u otros consumidores) registrar iconos adicionales. */
export function registerIcons(icons: Record<string, IconNode>): void {
  Object.assign(REGISTRY, icons);
}

export const DEFAULT_ICON_BY_TYPE: Record<HotspotType, string> = {
  navigation: "arrow-up",
  text: "text",
  image: "image",
  gallery: "gallery-horizontal-end",
  videoFile: "video",
  embedVideo: "play",
  audio: "volume-2",
  pdf: "file-text",
  model3d: "box",
  web: "globe",
  form: "clipboard-list",
  compare: "columns-2",
  quiz: "circle-help",
  polygon: "pentagon",
  tooltip: "message-square",
  link: "external-link",
  state: "door-open",
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function createIconSvg(name: string, size = 24, color = "currentColor"): SVGSVGElement {
  const node = REGISTRY[name] ?? REGISTRY.info!;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of node) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}

/** Saneado minimo de SVG propio de autor: elimina scripts y manejadores. */
export function sanitizeSvg(svgMarkup: string): string {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg") return "";
  const walk = (el: Element): void => {
    for (const child of [...el.children]) {
      const tag = child.tagName.toLowerCase();
      if (tag === "script" || tag === "foreignobject" || tag === "iframe") {
        child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        const n = attr.name.toLowerCase();
        if (n.startsWith("on") || (n === "href" && attr.value.trim().toLowerCase().startsWith("javascript:")) ||
            (n === "xlink:href" && attr.value.trim().toLowerCase().startsWith("javascript:"))) {
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };
  for (const attr of [...svg.attributes]) {
    if (attr.name.toLowerCase().startsWith("on")) svg.removeAttribute(attr.name);
  }
  walk(svg);
  return new XMLSerializer().serializeToString(svg);
}
