import type { Hotspot, Scene, Tour } from "./types.js";
import { TOUR_SCHEMA_VERSION } from "./types.js";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const HOTSPOT_TYPES = new Set([
  "navigation",
  "text",
  "image",
  "gallery",
  "videoFile",
  "embedVideo",
  "audio",
  "pdf",
  "model3d",
  "web",
  "form",
  "compare",
  "quiz",
  "polygon",
  "tooltip",
  "link",
  "state",
]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Validador estructural y semantico de tour.json.
 * No sustituye al JSON Schema (que se publica para tooling externo);
 * anade comprobaciones referenciales que un schema no puede expresar:
 * unicidad de IDs, existencia de destinos, alcanzabilidad, alt-text.
 */
export function validateTour(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (code: string, path: string, message: string) =>
    issues.push({ severity: "error", code, path, message });
  const warn = (code: string, path: string, message: string) =>
    issues.push({ severity: "warning", code, path, message });

  if (typeof input !== "object" || input === null) {
    err("not-object", "$", "El tour debe ser un objeto JSON");
    return { valid: false, issues };
  }
  const tour = input as Partial<Tour>;

  if (!isFiniteNumber(tour.version)) {
    err("missing-version", "$.version", "Falta el numero de version del esquema");
  } else if (tour.version > TOUR_SCHEMA_VERSION) {
    err(
      "unknown-version",
      "$.version",
      `Version ${tour.version} posterior a la soportada (${TOUR_SCHEMA_VERSION})`,
    );
  }

  if (tour.meta == null || typeof tour.meta !== "object") {
    err("missing-meta", "$.meta", "Falta el bloque meta");
  } else {
    if (tour.meta.title == null) err("missing-title", "$.meta.title", "Falta el titulo del tour");
    if (typeof tour.meta.defaultLang !== "string" || tour.meta.defaultLang === "")
      err("missing-default-lang", "$.meta.defaultLang", "Falta el idioma por defecto");
    if (!Array.isArray(tour.meta.langs) || tour.meta.langs.length === 0)
      err("missing-langs", "$.meta.langs", "Falta la lista de idiomas");
    else if (
      typeof tour.meta.defaultLang === "string" &&
      !tour.meta.langs.includes(tour.meta.defaultLang)
    )
      err(
        "default-lang-not-listed",
        "$.meta.langs",
        `El idioma por defecto "${tour.meta.defaultLang}" no esta en la lista de idiomas`,
      );
  }

  if (!Array.isArray(tour.scenes) || tour.scenes.length === 0) {
    err("no-scenes", "$.scenes", "El tour no tiene escenas");
    return { valid: false, issues };
  }

  const sceneIds = new Set<string>();
  for (const [i, scene] of tour.scenes.entries()) {
    const p = `$.scenes[${i}]`;
    if (typeof scene.id !== "string" || scene.id === "") {
      err("scene-no-id", p, "Escena sin id");
      continue;
    }
    if (sceneIds.has(scene.id)) err("dup-scene-id", p, `ID de escena duplicado: ${scene.id}`);
    sceneIds.add(scene.id);
  }

  if (tour.start == null || typeof tour.start.scene !== "string") {
    err("missing-start", "$.start", "Falta la escena inicial");
  } else if (!sceneIds.has(tour.start.scene)) {
    err("start-not-found", "$.start.scene", `La escena inicial "${tour.start.scene}" no existe`);
  }

  const hotspotIds = new Set<string>();
  const referencedScenes = new Set<string>();
  if (tour.start?.scene != null) referencedScenes.add(tour.start.scene);

  for (const [i, scene] of tour.scenes.entries()) {
    const p = `$.scenes[${i}]`;
    validateScene(scene, p, sceneIds, hotspotIds, referencedScenes, err, warn);
  }

  if (Array.isArray(tour.connections)) {
    for (const [i, conn] of tour.connections.entries()) {
      const p = `$.connections[${i}]`;
      if (!sceneIds.has(conn.from)) err("conn-from-missing", p, `Origen inexistente: ${conn.from}`);
      if (!sceneIds.has(conn.to)) err("conn-to-missing", p, `Destino inexistente: ${conn.to}`);
      if (sceneIds.has(conn.to)) referencedScenes.add(conn.to);
    }
  }

  // Alcanzabilidad: BFS desde la escena inicial por hotspots de navegacion + conexiones.
  if (tour.start?.scene != null && sceneIds.has(tour.start.scene)) {
    const adj = new Map<string, Set<string>>();
    for (const scene of tour.scenes) {
      const targets = new Set<string>();
      for (const hs of scene.hotspots ?? []) {
        if (hs.type === "navigation" && typeof (hs as { target?: string }).target === "string")
          targets.add((hs as { target: string }).target);
        if (hs.type === "state" && typeof (hs as { thenGoto?: string }).thenGoto === "string")
          targets.add((hs as { thenGoto: string }).thenGoto);
        if (hs.type === "polygon") {
          const action = (hs as { action?: { kind?: string; target?: string } }).action;
          if (action?.kind === "goto" && typeof action.target === "string") targets.add(action.target);
        }
      }
      adj.set(scene.id, targets);
    }
    for (const conn of tour.connections ?? []) {
      adj.get(conn.from)?.add(conn.to);
    }
    const visited = new Set<string>([tour.start.scene]);
    const queue = [tour.start.scene];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (sceneIds.has(next) && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    for (const id of sceneIds) {
      if (!visited.has(id)) {
        warn("orphan-scene", `$.scenes[id=${id}]`, `La escena "${id}" no es alcanzable desde la escena inicial`);
      }
    }
  }

  // Rutas de autopilot y busqueda del tesoro
  for (const [i, route] of (tour.autopilot ?? []).entries()) {
    for (const [j, step] of route.steps.entries()) {
      if (!sceneIds.has(step.scene))
        err("autopilot-scene-missing", `$.autopilot[${i}].steps[${j}]`, `Escena inexistente: ${step.scene}`);
    }
  }
  for (const [i, target] of (tour.treasureHunt?.targets ?? []).entries()) {
    if (!sceneIds.has(target.sceneId))
      err("hunt-scene-missing", `$.treasureHunt.targets[${i}]`, `Escena inexistente: ${target.sceneId}`);
  }

  // Planos de planta referenciados
  const floorplanIds = new Set((tour.floorplans ?? []).map((f) => f.id));
  for (const [i, scene] of tour.scenes.entries()) {
    const fp = scene.map?.floorplan;
    if (fp != null && !floorplanIds.has(fp))
      err("floorplan-missing", `$.scenes[${i}].map.floorplan`, `Plano inexistente: ${fp}`);
  }

  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

function validateScene(
  scene: Scene,
  p: string,
  sceneIds: Set<string>,
  hotspotIds: Set<string>,
  referencedScenes: Set<string>,
  err: (c: string, p: string, m: string) => void,
  warn: (c: string, p: string, m: string) => void,
): void {
  if (scene.title == null) err("scene-no-title", `${p}.title`, `Escena "${scene.id}" sin titulo`);
  if (scene.altText == null || scene.altText === "")
    warn("scene-no-alt", `${p}.altText`, `Escena "${scene.id}" sin texto alternativo accesible`);
  if (scene.source == null || typeof scene.source !== "object") {
    err("scene-no-source", `${p}.source`, `Escena "${scene.id}" sin fuente de medios`);
  } else {
    const kind = (scene.source as { kind?: string }).kind;
    if (!["multires", "equirect", "cubemap", "flat", "video"].includes(kind ?? ""))
      err("scene-bad-source", `${p}.source.kind`, `Tipo de fuente desconocido: ${kind}`);
    if (kind === "multires") {
      const s = scene.source as { levels?: number; tileSize?: number; faceSize?: number; base?: string };
      if (!isFiniteNumber(s.levels) || s.levels < 1) err("multires-levels", `${p}.source.levels`, "Niveles invalidos");
      if (!isFiniteNumber(s.tileSize) || s.tileSize < 64)
        err("multires-tilesize", `${p}.source.tileSize`, "tileSize invalido");
      if (typeof s.base !== "string") err("multires-base", `${p}.source.base`, "Falta el prefijo base de tiles");
      if (isFiniteNumber(s.faceSize) && s.faceSize > 8192)
        warn("multires-face-large", `${p}.source.faceSize`, "Cara de cubo > 8192 px (equivale a >32K equirect)");
    }
  }
  if (scene.initialView != null) validateView(scene.initialView, `${p}.initialView`, err);

  for (const [j, hs] of (scene.hotspots ?? []).entries()) {
    const hp = `${p}.hotspots[${j}]`;
    if (typeof hs.id !== "string" || hs.id === "") {
      err("hotspot-no-id", hp, "Hotspot sin id");
      continue;
    }
    const globalId = `${scene.id}/${hs.id}`;
    if (hotspotIds.has(globalId)) err("dup-hotspot-id", hp, `ID de hotspot duplicado en la escena: ${hs.id}`);
    hotspotIds.add(globalId);
    if (!HOTSPOT_TYPES.has(hs.type)) {
      err("hotspot-bad-type", `${hp}.type`, `Tipo de hotspot desconocido: ${hs.type}`);
      continue;
    }
    if (hs.type !== "polygon") {
      if (!isFiniteNumber(hs.yaw) || !isFiniteNumber(hs.pitch))
        err("hotspot-no-pos", hp, `Hotspot "${hs.id}" sin posicion yaw/pitch valida`);
    }
    if (hs.altText == null && hs.type !== "tooltip" && hs.type !== "polygon")
      warn("hotspot-no-alt", `${hp}.altText`, `Hotspot "${hs.id}" sin texto alternativo accesible`);
    validateHotspotContent(hs, hp, sceneIds, referencedScenes, err, warn);
  }
}

function validateHotspotContent(
  hs: Hotspot,
  hp: string,
  sceneIds: Set<string>,
  referencedScenes: Set<string>,
  err: (c: string, p: string, m: string) => void,
  warn: (c: string, p: string, m: string) => void,
): void {
  switch (hs.type) {
    case "navigation":
      if (typeof hs.target !== "string" || !sceneIds.has(hs.target))
        err("nav-target-missing", `${hp}.target`, `Destino inexistente: ${String(hs.target)}`);
      else referencedScenes.add(hs.target);
      break;
    case "text":
      if (hs.body == null) err("text-no-body", `${hp}.body`, "Hotspot de texto sin contenido");
      break;
    case "image":
      if (typeof hs.url !== "string") err("image-no-url", `${hp}.url`, "Hotspot de imagen sin URL");
      break;
    case "gallery":
      if (!Array.isArray(hs.items) || hs.items.length === 0)
        err("gallery-empty", `${hp}.items`, "Galeria sin elementos");
      break;
    case "videoFile":
      if (typeof hs.url !== "string") err("video-no-url", `${hp}.url`, "Hotspot de video sin URL");
      if (hs.mode === "projected" && (!Array.isArray(hs.corners) || hs.corners.length !== 4))
        err("video-corners", `${hp}.corners`, "El modo proyectado requiere 4 esquinas");
      break;
    case "embedVideo":
      if (typeof hs.videoId !== "string") err("embed-no-id", `${hp}.videoId`, "Embed sin videoId");
      if (hs.provider === "peertube" && typeof hs.host !== "string")
        err("peertube-no-host", `${hp}.host`, "PeerTube requiere host de instancia");
      break;
    case "form":
      if (!Array.isArray(hs.fields) || hs.fields.length === 0)
        err("form-no-fields", `${hp}.fields`, "Formulario sin campos");
      for (const [k, f] of (hs.fields ?? []).entries()) {
        if (f.type === "select" && (!Array.isArray(f.options) || f.options.length === 0))
          err("select-no-options", `${hp}.fields[${k}]`, "Campo select sin opciones");
      }
      if (hs.destination == null || (!hs.destination.api && !hs.destination.webhook && !hs.destination.email))
        warn("form-no-destination", `${hp}.destination`, "Formulario sin destino de envio");
      break;
    case "compare":
      if (hs.mode === "panoramas") {
        for (const side of ["before", "after"] as const) {
          const ref = hs[side]?.sceneId;
          if (ref == null || !sceneIds.has(ref))
            err("compare-scene-missing", `${hp}.${side}`, `Escena de comparacion inexistente: ${String(ref)}`);
        }
      } else {
        if (hs.before?.url == null || hs.after?.url == null)
          err("compare-no-images", hp, "Comparador de imagenes sin ambas imagenes");
      }
      break;
    case "quiz": {
      if (!Array.isArray(hs.options) || hs.options.length < 2)
        err("quiz-few-options", `${hp}.options`, "Quiz con menos de 2 opciones");
      const correct = (hs.options ?? []).filter((o) => o.correct).length;
      if (correct === 0) err("quiz-no-correct", `${hp}.options`, "Quiz sin opcion correcta");
      if (hs.kind === "single" && correct > 1)
        err("quiz-multi-correct", `${hp}.options`, "Quiz de opcion unica con varias correctas");
      break;
    }
    case "polygon":
      if (!Array.isArray(hs.points) || hs.points.length < 3)
        err("polygon-few-points", `${hp}.points`, "Poligono con menos de 3 vertices");
      if (hs.action?.kind === "goto") {
        if (!sceneIds.has(hs.action.target))
          err("polygon-target-missing", `${hp}.action.target`, `Destino inexistente: ${hs.action.target}`);
        else referencedScenes.add(hs.action.target);
      }
      break;
    case "link":
      if (typeof hs.url !== "string") err("link-no-url", `${hp}.url`, "Enlace sin URL");
      break;
    case "state":
      if (!Array.isArray(hs.actions) || hs.actions.length === 0)
        err("state-no-actions", `${hp}.actions`, "Hotspot de estado sin acciones");
      if (hs.thenGoto != null && !sceneIds.has(hs.thenGoto))
        err("state-target-missing", `${hp}.thenGoto`, `Destino inexistente: ${hs.thenGoto}`);
      break;
    default:
      break;
  }
}

function validateView(
  view: { yaw?: number; pitch?: number; fov?: number },
  p: string,
  err: (c: string, p: string, m: string) => void,
): void {
  if (view.yaw != null && !isFiniteNumber(view.yaw)) err("bad-yaw", `${p}.yaw`, "yaw invalido");
  if (view.pitch != null && (!isFiniteNumber(view.pitch) || Math.abs(view.pitch) > Math.PI / 2 + 1e-6))
    err("bad-pitch", `${p}.pitch`, "pitch fuera de rango [-PI/2, PI/2]");
  if (view.fov != null && (!isFiniteNumber(view.fov) || view.fov <= 0 || view.fov >= Math.PI))
    err("bad-fov", `${p}.fov`, "fov fuera de rango (0, PI)");
}
