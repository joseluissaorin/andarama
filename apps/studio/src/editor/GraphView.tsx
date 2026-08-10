import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Copy,
  Expand,
  Layers,
  LayoutGrid,
  Magnet,
  Plus,
  Search,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { Button, Dialog, Input, Select, Tooltip, useToast } from "@andarama/ui";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { readJson } from "./editorApi";
import {
  createNavHotspot,
  deleteEdge,
  deleteScene,
  duplicateScene,
  graphEdges,
  graphIssues,
  nodeStatus,
  reconnectEdge,
  readAutopilot,
  setOneWay,
  writeAutopilot,
  type AutopilotRouteDraft,
  type GraphEdge,
  type GraphIssue,
  type ReconnectResult,
} from "./graphModel";
import {
  areaOfScene,
  areasOf,
  assignScene,
  clearPlacement,
  createArea,
  deleteArea,
  geoOf,
  migrateAreas,
  needsAreaMigration,
  patchArea,
  placeScene,
  placementOf,
  setGeo,
  setNorth,
  type Area,
} from "./areas";
import { alignNodes, autoLayoutByArea, boundsOf, distributeNodes, snapToNeighbours, type NodePos } from "./layoutOps";
import {
  DEFAULT_TILE_URL,
  OSM_ATTRIBUTION,
  REFERENCE_ZOOM,
  TILE_SIZE,
  fitGeoBounds,
  latToWorldY,
  lngToWorldX,
  tileUrl,
  tileZoomFor,
  tilesForView,
  worldXToLng,
  worldYToLat,
} from "./geo";
import { hasMediaDrag, readMediaDrag, scenesFromMedia } from "../media/drag";
import { GraphHelp } from "./GraphHelp";
import { GraphIssues } from "./GraphIssues";
import { GraphAreas } from "./GraphAreas";
import { MediaPicker } from "./MediaPicker";

/**
 * Lienzo del tour.
 *
 * Cuatro modos sobre el mismo material, porque son la misma pregunta hecha de
 * cuatro maneras:
 *
 * - **Esquema**: el grafo libre, donde la posición del nodo solo ordena la
 *   vista.
 * - **Plano**: el plano de planta del área debajo, y ahí la posición del nodo
 *   **es** la del marcador que verá el visitante en su minimapa. Antes eran dos
 *   pestañas y se colocaba lo mismo dos veces sin que una supiera de la otra.
 * - **Mapa**: OpenStreetMap debajo, y la posición del nodo escribe la latitud y
 *   la longitud de la escena.
 * - **Autopilot**: los recorridos guiados, dibujados sobre el esquema.
 *
 * Las **áreas** agrupan los nodos, dan la categoría del menú de escenas y, si
 * tienen plano, son la planta del selector de nivel. Una sola cosa.
 */

type Mode = "scenes" | "plan" | "geo" | "autopilot";

const NODE_W = 168;
const NODE_H = 92;
const MARK_W = 148;
const MARK_H = 34;
const PORT_R = 6;
/** Ancho del plano en unidades del mundo del lienzo. */
const PLAN_W = 1200;

interface View {
  ox: number;
  oy: number;
  scale: number;
}

const DEFAULT_VIEW: View = { ox: 60, oy: 60, scale: 1 };

/**
 * ¿Sigue el encuadre sin tocar? Se compara **por valor**: el encuadre guardado
 * vuelve de localStorage como otro objeto, y comparándolo por referencia el
 * lienzo creía que el autor ya lo había movido y no encuadraba nunca.
 */
function isDefaultView(v: View): boolean {
  return v.ox === DEFAULT_VIEW.ox && v.oy === DEFAULT_VIEW.oy && v.scale === DEFAULT_VIEW.scale;
}

/**
 * Límites del zoom. En el mapa el mundo mide dieciséis millones de píxeles, así
 * que para verlo entero hay que bajar muchísimo más que en el esquema.
 */
function clampScale(scale: number, mode: Mode): number {
  const min = mode === "geo" ? 1e-5 : 0.05;
  return Math.min(4, Math.max(min, scale));
}

export const GRAPH_MODES: Mode[] = ["scenes", "plan", "geo", "autopilot"];
export type GraphMode = Mode;

export function GraphView({ canEdit, onOpenScene, mode, onModeChange }: {
  canEdit: boolean;
  onOpenScene?: (sceneId: string, hotspotId?: string) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const projectId = editor.projectId ?? "";
  const svgRef = useRef<SVGSVGElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [views, setViews] = useState<Record<Mode, View>>({ scenes: DEFAULT_VIEW, plan: DEFAULT_VIEW, geo: DEFAULT_VIEW, autopilot: DEFAULT_VIEW });
  const view = views[mode];
  const viewRef = useRef(view);
  viewRef.current = view;
  const setView = useCallback((next: View | ((v: View) => View)): void => {
    setViews((all) => ({ ...all, [modeRef.current]: typeof next === "function" ? next(all[modeRef.current]) : next }));
  }, []);

  // Áreas: planta, zona y categoría son lo mismo
  // `areasOf` deduce las áreas de los planos y categorías antiguos mientras el
  // tour no se haya convertido, para que quien no puede editar vea lo mismo.
  const areas = useMemo(() => areasOf(snapshot), [snapshot]);
  const areasRef = useRef(areas);
  areasRef.current = areas;
  const [areasOpen, setAreasOpen] = useState(false);
  const [planArea, setPlanArea] = useState<string | null>(null);
  const [planPicker, setPlanPicker] = useState<string | null>(null);
  const [planTarget, setPlanTarget] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState<{ areaId: string; a?: { x: number; y: number }; b?: { x: number; y: number } } | null>(null);
  const [calibrationMeters, setCalibrationMeters] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  // Conversión de los antiguos planos y categorías sueltas. Una sola vez.
  useEffect(() => {
    if (!canEdit) return;
    if (needsAreaMigration(snapshot)) editor.apply((draft) => migrateAreas(draft));
  }, [canEdit, snapshot.scenes.length]);

  const planAreas = useMemo(() => areas.filter((a) => a.plan != null).sort((a, b) => (b.level ?? 0) - (a.level ?? 0)), [areas]);
  const currentPlan = useMemo(() => planAreas.find((a) => a.id === planArea) ?? planAreas[0] ?? null, [planAreas, planArea]);
  const planUrl = currentPlan?.plan != null ? mediaUrl(currentPlan.plan.url) : null;
  const [aspects, setAspects] = useState<Record<string, number>>({});
  useEffect(() => {
    if (planUrl == null || aspects[planUrl] != null) return;
    const img = new Image();
    img.onload = () => setAspects((a) => ({ ...a, [planUrl]: img.naturalWidth / Math.max(1, img.naturalHeight) }));
    img.src = planUrl;
  }, [planUrl]);
  const planH = PLAN_W / (planUrl != null ? (aspects[planUrl] ?? 1.4) : 1.4);
  const planHRef = useRef(planH);
  planHRef.current = planH;
  const currentPlanRef = useRef(currentPlan);
  currentPlanRef.current = currentPlan;

  /**
   * Tamaño del nodo en unidades del mundo.
   *
   * Sobre un plano o un mapa el marcador tiene que medir siempre lo mismo en
   * pantalla —así funcionan todos los mapas—, así que ocupa menos mundo cuanto
   * más se amplía. El dibujo compensa con la escala inversa, y `k` lleva esa
   * misma corrección a los adornos que viven fuera del nodo.
   */
  const compactNodes = mode === "plan" || mode === "geo";
  const k = compactNodes ? 1 / view.scale : 1;
  const size = compactNodes ? { w: MARK_W * k, h: MARK_H * k } : { w: NODE_W, h: NODE_H };
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const nodeTransformSuffix = compactNodes ? ` scale(${k})` : "";
  const suffixRef = useRef(nodeTransformSuffix);
  suffixRef.current = nodeTransformSuffix;

  // ---------------------------------------------------------------------
  // Posiciones: cada modo las saca de un sitio distinto y las guarda en el
  // suyo. En Esquema son decorativas; en Plano y Mapa son el dato real.
  // ---------------------------------------------------------------------
  const [layout, setLayout] = useState<Record<string, NodePos>>({});
  useEffect(() => {
    const saved = (snapshot.settings.graphLayout as Record<string, NodePos>) ?? {};
    setLayout((prev) => {
      const next: Record<string, NodePos> = {};
      let changed = snapshot.scenes.length !== Object.keys(prev).length;
      snapshot.scenes.forEach((scene, i) => {
        // El dato guardado manda: así deshacer y rehacer mueven los nodos de
        // verdad, que antes se quedaban donde estaban aunque el tour volviera
        // atrás.
        next[scene.id] = saved[scene.id] ?? prev[scene.id] ?? { x: (i % 5) * (NODE_W + 60), y: Math.floor(i / 5) * (NODE_H + 60) };
        const before = prev[scene.id];
        if (before == null || before.x !== next[scene.id]!.x || before.y !== next[scene.id]!.y) changed = true;
      });
      return changed ? next : prev;
    });
  }, [snapshot.scenes, snapshot.settings.graphLayout]);

  const positions = useMemo((): Record<string, NodePos> => {
    if (mode === "plan") {
      const out: Record<string, NodePos> = {};
      if (currentPlan == null) return out;
      for (const scene of snapshot.scenes) {
        const p = placementOf(scene);
        if (p == null || p.area !== currentPlan.id) continue;
        out[scene.id] = { x: p.x * PLAN_W - size.w / 2, y: p.y * planH - size.h / 2 };
      }
      return out;
    }
    if (mode === "geo") {
      const out: Record<string, NodePos> = {};
      for (const scene of snapshot.scenes) {
        const g = geoOf(scene);
        if (g == null) continue;
        out[scene.id] = { x: lngToWorldX(g.lng) - size.w / 2, y: latToWorldY(g.lat) - size.h / 2 };
      }
      return out;
    }
    return layout;
  }, [mode, layout, snapshot.scenes, currentPlan, planH, size.w, size.h]);

  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  /** Marcos de área. Se declara aquí porque el encuadre los necesita. */
  const framesRef = useRef<{ area: Area; x0: number; y0: number; x1: number; y1: number }[]>([]);
  const visibleScenes = useMemo(() => snapshot.scenes.filter((s) => positions[s.id] != null), [snapshot.scenes, positions]);
  const unplaced = useMemo(
    () => (compactNodes ? snapshot.scenes.filter((s) => positions[s.id] == null) : []),
    [compactNodes, snapshot.scenes, positions],
  );

  /** Escribe las posiciones movidas donde corresponda según el modo. */
  const commitPositions = useCallback(
    (moved: Record<string, NodePos>): void => {
      const m = modeRef.current;
      const sz = sizeRef.current;
      if (m === "plan") {
        const area = currentPlanRef.current;
        if (area == null) return;
        editor.apply((draft) => {
          for (const [id, p] of Object.entries(moved)) {
            const cx = (p.x + sz.w / 2) / PLAN_W;
            const cy = (p.y + sz.h / 2) / planHRef.current;
            // Sacado del plano: deja de estar colocado y vuelve a la lista
            if (cx < -0.05 || cx > 1.05 || cy < -0.05 || cy > 1.05) clearPlacement(draft, id);
            else placeScene(draft, id, area.id, cx, cy);
          }
        });
        return;
      }
      if (m === "geo") {
        editor.apply((draft) => {
          for (const [id, p] of Object.entries(moved)) {
            setGeo(draft, id, worldYToLat(p.y + sz.h / 2), worldXToLng(p.x + sz.w / 2));
          }
        });
        return;
      }
      setLayout((prev) => {
        const next = { ...prev, ...moved };
        positionsRef.current = next;
        editor.apply((draft) => {
          draft.settings.graphLayout = next;
        });
        return next;
      });
    },
    [editor],
  );

  // ---------------------------------------------------------------------
  // Selección y gestos
  // ---------------------------------------------------------------------
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const selectedNodesRef = useRef(selectedNodes);
  selectedNodesRef.current = selectedNodes;
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
  const selectedEdgesRef = useRef(selectedEdges);
  selectedEdgesRef.current = selectedEdges;
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const ghostPathRef = useRef<SVGPathElement>(null);
  const placeGhostRef = useRef<SVGRectElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const edgeRefs = useRef(new Map<string, SVGPathElement[]>());
  const [connecting, setConnecting] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const hoverNodeRef = useRef<string | null>(null);
  hoverNodeRef.current = hoverNode;
  const [menu, setMenu] = useState<{ x: number; y: number; sceneId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const focusedNodeRef = useRef(focusedNode);
  focusedNodeRef.current = focusedNode;
  const [keyboardConnect, setKeyboardConnect] = useState<string | null>(null);
  const keyboardConnectRef = useRef(keyboardConnect);
  keyboardConnectRef.current = keyboardConnect;
  const [search, setSearch] = useState<string | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;
  const calibratingRef = useRef(calibrating);
  calibratingRef.current = calibrating;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number; cx: number; cy: number } | null>(null);

  const dragRef = useRef<
    | { kind: "pan"; startX: number; startY: number; ox: number; oy: number }
    | { kind: "nodes"; startX: number; startY: number; orig: Record<string, NodePos>; moved: boolean; dx: number; dy: number }
    | { kind: "connect"; from: string }
    | { kind: "reconnect"; edgeId: string; end: "from" | "to"; anchor: string }
    | { kind: "marquee"; x0: number; y0: number; mode: "replace" | "add" | "subtract"; base: Set<string> }
    | { kind: "north"; sceneId: string }
    | { kind: "place"; sceneId: string }
    | null
  >(null);

  const edges = useMemo(() => graphEdges(snapshot), [snapshot]);
  const drawnEdges = useMemo(() => edges.filter((e) => positions[e.from] != null && positions[e.to] != null), [edges, positions]);

  const routes = useMemo(() => readAutopilot(snapshot.settings), [snapshot.settings]);
  const [routeIndex, setRouteIndex] = useState(0);
  const route: AutopilotRouteDraft | null = routes[routeIndex] ?? null;
  const [mediaOver, setMediaOver] = useState(false);
  const [bothWays, setBothWays] = useState(() => localStorage.getItem("andarama.graphBothWays") !== "off");
  const [snap, setSnap] = useState(true);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    localStorage.setItem("andarama.graphBothWays", bothWays ? "on" : "off");
  }, [bothWays]);

  // Encuadre por proyecto y modo: volver a entrar no te devuelve a la esquina
  useEffect(() => {
    const raw = localStorage.getItem(`andarama.graphView.${projectId}`);
    if (raw == null) return;
    try {
      const saved = JSON.parse(raw) as Partial<Record<Mode, View>>;
      setViews((v) => ({ ...v, ...saved }));
    } catch {
      // encuadre ilegible
    }
  }, [projectId]);
  useEffect(() => {
    if (projectId === "") return;
    const id = setTimeout(() => localStorage.setItem(`andarama.graphView.${projectId}`, JSON.stringify(views)), 400);
    return () => clearTimeout(id);
  }, [views, projectId]);

  const setMode = useCallback(
    (next: Mode): void => {
      setSelectedEdges(new Set());
      setSelectedNodes(new Set());
      onModeChange(next);
    },
    [onModeChange],
  );

  const routeEdges = useMemo(() => {
    if (route == null) return [];
    const list: { id: string; from: string; to: string; unplaced: boolean; oneWay: boolean; step: number }[] = [];
    for (let i = 0; i < route.steps.length - 1; i++) {
      const from = route.steps[i]!.scene;
      const to = route.steps[i + 1]!.scene;
      if (positions[from] == null || positions[to] == null) continue;
      list.push({ id: `ap-${i}`, from, to, unplaced: false, oneWay: false, step: i + 1 });
    }
    return list;
  }, [route, positions]);
  const visibleEdges = mode === "autopilot" ? routeEdges : drawnEdges;
  const drawnEdgesRef = useRef(visibleEdges);
  drawnEdgesRef.current = visibleEdges;

  const patchRoutes = (fn: (list: AutopilotRouteDraft[]) => AutopilotRouteDraft[]): void => {
    editor.apply((draft) => {
      writeAutopilot(draft.settings, fn(readAutopilot(draft.settings)));
    });
  };

  const orphans = useMemo(() => {
    const start = (snapshot.settings.startScene as string) ?? snapshot.scenes[0]?.id;
    if (start == null) return new Set<string>();
    const adj = new Map<string, string[]>();
    for (const e of edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return new Set(snapshot.scenes.filter((s) => !visited.has(s.id)).map((s) => s.id));
  }, [edges, snapshot.scenes, snapshot.settings.startScene]);

  const toWorld = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.ox) / v.scale, y: (clientY - rect.top - v.oy) / v.scale };
  }, []);

  const drawGhost = useCallback((from: string, x: number, y: number, target?: string | null): void => {
    const path = ghostPathRef.current;
    const start = positionsRef.current[from];
    if (path == null || start == null) return;
    const sz = sizeRef.current;
    const end = target != null ? positionsRef.current[target] : null;
    const ex = end != null ? end.x : x;
    const ey = end != null ? end.y + sz.h / 2 : y;
    const sx = start.x + sz.w;
    const sy = start.y + sz.h / 2;
    const bend = sz.w * 0.4;
    path.setAttribute("d", `M ${sx} ${sy} C ${sx + bend} ${sy}, ${ex - bend} ${ey}, ${ex} ${ey}`);
    path.style.display = "";
    path.setAttribute("stroke-dasharray", end != null ? "0" : `${5 * (sz.w / MARK_W)} ${4 * (sz.w / MARK_W)}`);
  }, []);

  const hideGhost = useCallback((): void => {
    if (ghostPathRef.current != null) ghostPathRef.current.style.display = "none";
  }, []);

  const hitNode = useCallback((x: number, y: number): string | null => {
    const sz = sizeRef.current;
    const ids = Object.keys(positionsRef.current);
    for (let i = ids.length - 1; i >= 0; i--) {
      const p = positionsRef.current[ids[i]!]!;
      if (x >= p.x && x <= p.x + sz.w && y >= p.y && y <= p.y + sz.h) return ids[i]!;
    }
    return null;
  }, []);

  const fitView = useCallback(
    (ids?: string[]): void => {
      const list = ids != null && ids.length > 0 ? ids : Object.keys(positionsRef.current);
      const nodes = boundsOf(positionsRef.current, list, sizeRef.current);
      if (nodes == null || svgRef.current == null) return;
      // Encuadrar todo incluye los marcos de área: si no, sus títulos quedaban
      // cortados por arriba.
      const box = { ...nodes };
      if (ids == null) {
        for (const f of framesRef.current) {
          box.x0 = Math.min(box.x0, f.x0);
          box.y0 = Math.min(box.y0, f.y0);
          box.x1 = Math.max(box.x1, f.x1);
          box.y1 = Math.max(box.y1, f.y1);
        }
      }
      const rect = svgRef.current.getBoundingClientRect();
      // Nunca se amplía al encuadrar: un tour de tres escenas al 180 % es
      // ridículo y esconde el resto del lienzo.
      const scale = Math.min(
        1,
        clampScale(Math.min((rect.width - 80) / Math.max(1, box.x1 - box.x0), (rect.height - 80) / Math.max(1, box.y1 - box.y0)), modeRef.current),
      );
      setView({
        scale,
        ox: rect.width / 2 - ((box.x0 + box.x1) / 2) * scale,
        oy: rect.height / 2 - ((box.y0 + box.y1) / 2) * scale,
      });
    },
    [setView],
  );

  // Encuadre inicial del plano: entrar y ver una esquina al 100 % no dice
  // nada; lo que hace falta es la planta entera.
  const fittedPlan = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "plan" || currentPlan == null || svgRef.current == null) return;
    if (fittedPlan.current === currentPlan.id) return;
    if (planUrl != null && aspects[planUrl] == null) return;
    fittedPlan.current = currentPlan.id;
    // Si el autor ya había dejado un encuadre, manda el suyo
    if (!isDefaultView(views.plan)) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = Math.min((rect.width - 60) / PLAN_W, (rect.height - 60) / planH);
    setView({ scale, ox: (rect.width - PLAN_W * scale) / 2, oy: (rect.height - planH * scale) / 2 });
  }, [mode, currentPlan, planH, planUrl, aspects, setView]);

  // Encuadre inicial del mapa: sobre las escenas con coordenadas o, si aún no
  // hay ninguna, el mundo entero. Arrancar en la esquina noroeste del planeta
  // hacía que la primera escena aterrizara en mitad del Pacífico.
  useEffect(() => {
    if (mode !== "geo" || svgRef.current == null) return;
    if (!isDefaultView(views.geo)) return;
    const points = snapshot.scenes.map(geoOf).filter((g): g is { lat: number; lng: number } => g != null);
    const rect = svgRef.current.getBoundingClientRect();
    const fit = fitGeoBounds(points, { width: rect.width, height: rect.height });
    if (fit != null) {
      setView(fit);
      return;
    }
    const cfg = snapshot.settings.geoMap as { center?: { lat: number; lng: number }; zoom?: number } | undefined;
    if (cfg?.center != null) {
      const scale = 2 ** ((cfg.zoom ?? 16) - REFERENCE_ZOOM);
      setView({
        scale,
        ox: rect.width / 2 - lngToWorldX(cfg.center.lng) * scale,
        oy: rect.height / 2 - latToWorldY(cfg.center.lat) * scale,
      });
      return;
    }
    const world = TILE_SIZE * 2 ** REFERENCE_ZOOM;
    const scale = Math.min(rect.width, rect.height) / world;
    setView({ scale, ox: (rect.width - world * scale) / 2, oy: (rect.height - world * scale) / 2 });
  }, [mode, snapshot.scenes]);

  const autoLayout = useCallback((): void => {
    const start = (snapshot.settings.startScene as string) ?? snapshot.scenes[0]?.id;
    const { positions: next } = autoLayoutByArea(
      snapshot.scenes.map((s) => ({ id: s.id, area: areaOfScene(s) })),
      edges,
      areasRef.current,
      start,
      { w: NODE_W, h: NODE_H },
    );
    setLayout(next);
    positionsRef.current = next;
    if (canEdit) {
      editor.apply((draft) => {
        draft.settings.graphLayout = next;
      });
    }
    requestAnimationFrame(() => fitView());
  }, [snapshot.scenes, snapshot.settings.startScene, edges, canEdit, editor, fitView]);

  /** Arrastre sin repintar: se tocan los nodos y sus aristas en el DOM. */
  const paintDrag = useCallback((orig: Record<string, NodePos>, dx: number, dy: number): void => {
    const sz = sizeRef.current;
    const live: Record<string, NodePos> = { ...positionsRef.current };
    for (const [id, o] of Object.entries(orig)) {
      const p = { x: o.x + dx, y: o.y + dy };
      live[id] = p;
      nodeRefs.current.get(id)?.setAttribute("transform", `translate(${p.x} ${p.y})${suffixRef.current}`);
    }
    for (const edge of drawnEdgesRef.current) {
      if (orig[edge.from] == null && orig[edge.to] == null) continue;
      const { d } = edgePath(edge, live, drawnEdgesRef.current, sz);
      for (const path of edgeRefs.current.get(edge.id) ?? []) path.setAttribute("d", d);
    }
  }, []);

  // ---------------------------------------------------------------------
  // Teclado
  // ---------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) {
        if (e.key === "Escape") (target as HTMLInputElement).blur();
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearch("");
        return;
      }
      if (meta) return;
      // El paso de las flechas es el de pantalla: sobre un plano muy ampliado
      // un salto de diez unidades de mundo no movería nada.
      const unit = sizeRef.current.w / MARK_W;
      const step = (e.shiftKey ? 1 : 10) * (modeRef.current === "plan" || modeRef.current === "geo" ? unit : 1);
      if (e.key === "f" || e.key === "F") {
        fitView();
      } else if (e.key === "." || e.key === ",") {
        fitView([...selectedNodesRef.current]);
      } else if (e.key === "g" || e.key === "G") {
        setSnap((v) => !v);
      } else if (e.key === "l" || e.key === "L") {
        if (canEdit && (modeRef.current === "scenes" || modeRef.current === "autopilot")) autoLayout();
      } else if (e.key === "a" || e.key === "A") {
        setSelectedNodes(new Set(Object.keys(positionsRef.current)));
      } else if ((e.key === "c" || e.key === "C") && canEdit) {
        const from = focusedNodeRef.current ?? [...selectedNodesRef.current][0];
        if (from != null) {
          setKeyboardConnect(from);
          toast.push(t("keyboard_connect_hint"), "ok");
        }
      } else if (e.key === "F2" && canEdit) {
        const id = focusedNodeRef.current ?? [...selectedNodesRef.current][0];
        if (id != null) setRenaming(id);
      } else if (e.key.startsWith("Arrow") && selectedNodesRef.current.size > 0 && canEdit) {
        e.preventDefault();
        const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        const moved: Record<string, NodePos> = {};
        for (const id of selectedNodesRef.current) {
          const p = positionsRef.current[id];
          if (p != null) moved[id] = { x: p.x + dx, y: p.y + dy };
        }
        commitPositions(moved);
      } else if (e.key === "Escape") {
        if (dragRef.current?.kind === "connect" || dragRef.current?.kind === "reconnect") {
          dragRef.current = null;
          setConnecting(null);
          setHoverNode(null);
          hideGhost();
          return;
        }
        if (keyboardConnectRef.current != null) {
          setKeyboardConnect(null);
          return;
        }
        if (calibratingRef.current != null) {
          setCalibrating(null);
          return;
        }
        if (searchRef.current != null) {
          setSearch(null);
          return;
        }
        setSelectedNodes(new Set());
        setSelectedEdges(new Set());
        setMenu(null);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (!canEdit) return;
        if (selectedEdgesRef.current.size > 0) {
          const ids = [...selectedEdgesRef.current];
          editor.apply((draft) => {
            for (const id of ids) deleteEdge(draft, id);
          });
          setSelectedEdges(new Set());
        } else if (selectedNodesRef.current.size > 0) {
          setConfirmDelete([...selectedNodesRef.current]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitView, canEdit, editor, hideGhost, autoLayout, commitPositions, t, toast]);

  // ---------------------------------------------------------------------
  // Ratón, lápiz y dedos
  // ---------------------------------------------------------------------
  const onWheel = (e: React.WheelEvent): void => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const scale = clampScale(v.scale * (e.deltaY < 0 ? 1.1 : 0.9), modeRef.current);
      const kk = scale / v.scale;
      return { scale, ox: mx - (mx - v.ox) * kk, oy: my - (my - v.oy) * kk };
    });
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (menu != null) setMenu(null);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Dos dedos: mover y ampliar a la vez, como en cualquier mapa
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinchRef.current = {
        distance: Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y),
        scale: viewRef.current.scale,
        cx: (p1!.x + p2!.x) / 2,
        cy: (p1!.y + p2!.y) / 2,
      };
      dragRef.current = null;
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toWorld(e.clientX, e.clientY);

    if (calibrating != null && mode === "plan") {
      const point = { x: x / PLAN_W, y: y / planH };
      setCalibrating((c) => (c == null ? c : c.a == null ? { ...c, a: point } : { ...c, b: point }));
      return;
    }

    if (e.button === 1 || e.button === 2) {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, ox: view.ox, oy: view.oy };
      return;
    }

    const nodeId = hitNode(x, y);
    if (nodeId != null) {
      const p = positionsRef.current[nodeId]!;
      const onPort = Math.hypot(x - (p.x + size.w), y - (p.y + size.h / 2)) < PORT_R * 3.2 * k;
      const onRightEdge = x > p.x + size.w - 14 * k && y > p.y + 6 * k && y < p.y + size.h - 6 * k;
      if (canEdit && mode !== "autopilot" && (onPort || onRightEdge)) {
        dragRef.current = { kind: "connect", from: nodeId };
        setConnecting(nodeId);
        drawGhost(nodeId, x, y);
        return;
      }
      const next = new Set(e.shiftKey ? selectedNodes : selectedNodes.has(nodeId) ? selectedNodes : []);
      next.add(nodeId);
      setSelectedNodes(next);
      setSelectedEdges(new Set());
      const orig: Record<string, NodePos> = {};
      for (const id of next) if (positionsRef.current[id] != null) orig[id] = { ...positionsRef.current[id]! };
      dragRef.current = { kind: "nodes", startX: x, startY: y, orig, moved: false, dx: 0, dy: 0 };
      return;
    }

    const edge = hitEdge(x, y);
    if (edge != null) {
      setSelectedEdges((prev) => {
        if (!e.shiftKey) return new Set([edge]);
        const next = new Set(prev);
        if (next.has(edge)) next.delete(edge);
        else next.add(edge);
        return next;
      });
      setSelectedNodes(new Set());
      return;
    }

    // Lienzo vacío: con el dedo se mueve, con el ratón se hace recuadro
    if (e.altKey || e.pointerType === "touch") {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, ox: view.ox, oy: view.oy };
      return;
    }
    const selectionMode = e.shiftKey ? "add" : e.metaKey || e.ctrlKey ? "subtract" : "replace";
    dragRef.current = { kind: "marquee", x0: x, y0: y, mode: selectionMode, base: new Set(selectedNodes) };
    setMarquee({ x0: x, y0: y, x1: x, y1: y });
    setSelectedEdges(new Set());
  };

  const hitEdge = (x: number, y: number): string | null => {
    if (mode === "autopilot") return null;
    const tolerance = 10 * (sizeRef.current.w / MARK_W);
    for (const e of drawnEdgesRef.current) {
      const pts = edgePath(e, positionsRef.current, drawnEdgesRef.current, sizeRef.current).sample;
      for (const p of pts) {
        if (Math.hypot(p.x - x, p.y - y) < tolerance) return e.id;
      }
    }
    return null;
  };

  const drawGhostPlacement = (x: number, y: number): void => {
    const el = placeGhostRef.current;
    if (el == null) return;
    const sz = sizeRef.current;
    el.style.display = "";
    el.setAttribute("x", String(x - sz.w / 2));
    el.setAttribute("y", String(y - sz.h / 2));
    el.setAttribute("width", String(sz.w));
    el.setAttribute("height", String(sz.h));
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchRef.current != null) {
      const [p1, p2] = [...pointers.current.values()];
      const distance = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
      const rect = svgRef.current!.getBoundingClientRect();
      const start = pinchRef.current;
      const scale = clampScale((start.scale * distance) / Math.max(1, start.distance), modeRef.current);
      setView((v) => {
        const mx = start.cx - rect.left;
        const my = start.cy - rect.top;
        const kk = scale / v.scale;
        return { scale, ox: mx - (mx - v.ox) * kk, oy: my - (my - v.oy) * kk };
      });
      return;
    }
    const st = dragRef.current;
    if (st == null) return;
    if (st.kind === "pan") {
      setView((v) => ({ ...v, ox: st.ox + (e.clientX - st.startX), oy: st.oy + (e.clientY - st.startY) }));
      return;
    }
    const { x, y } = toWorld(e.clientX, e.clientY);
    if (st.kind === "nodes") {
      let dx = x - st.startX;
      let dy = y - st.startY;
      if (!st.moved && Math.hypot(dx, dy) < 3 * (sizeRef.current.w / MARK_W)) return;
      st.moved = true;
      if (snapRef.current) {
        const moving = Object.keys(st.orig);
        const shifted: Record<string, NodePos> = { ...positionsRef.current };
        for (const [id, o] of Object.entries(st.orig)) shifted[id] = { x: o.x + dx, y: o.y + dy };
        const others = Object.keys(positionsRef.current).filter((id) => !moving.includes(id));
        const guide = snapToNeighbours(shifted, moving, others, sizeRef.current, 6 * (sizeRef.current.w / MARK_W));
        dx += guide.dx;
        dy += guide.dy;
        setGuides({ v: guide.vertical, h: guide.horizontal });
      }
      st.dx = dx;
      st.dy = dy;
      paintDrag(st.orig, dx, dy);
    } else if (st.kind === "connect") {
      const over = hitNode(x, y);
      const target = over != null && over !== st.from ? over : null;
      if (target !== hoverNodeRef.current) setHoverNode(target);
      drawGhost(st.from, x, y, target);
    } else if (st.kind === "reconnect") {
      const over = hitNode(x, y);
      const target = over != null && over !== st.anchor ? over : null;
      if (target !== hoverNodeRef.current) setHoverNode(target);
      drawGhost(st.anchor, x, y, target);
    } else if (st.kind === "marquee") {
      setMarquee({ x0: st.x0, y0: st.y0, x1: x, y1: y });
    } else if (st.kind === "north") {
      const p = positionsRef.current[st.sceneId];
      if (p == null) return;
      const cx = p.x + sizeRef.current.w / 2;
      const cy = p.y + sizeRef.current.h / 2;
      // El cono del visor apunta arriba con norte 0 y gira en sentido horario
      const angle = Math.atan2(x - cx, -(y - cy));
      editor.apply((draft) => setNorth(draft, st.sceneId, angle));
    } else if (st.kind === "place") {
      drawGhostPlacement(x, y);
    }
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    const st = dragRef.current;
    dragRef.current = null;
    setGuides({ v: [], h: [] });
    if (st == null) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    if (st.kind === "connect") {
      const target = hitNode(x, y);
      setConnecting(null);
      setHoverNode(null);
      hideGhost();
      if (target != null && target !== st.from && canEdit) connect(st.from, target);
    } else if (st.kind === "reconnect") {
      const target = hitNode(x, y);
      setConnecting(null);
      setHoverNode(null);
      hideGhost();
      // Soltar en el vacío no borra nada: para eso está el aspa
      if (target != null && target !== st.anchor && canEdit) {
        const outcome: { result: ReconnectResult } = { result: "missing" };
        editor.apply((draft) => {
          outcome.result = reconnectEdge(draft, st.edgeId, st.end === "to" ? { to: target } : { from: target });
        });
        if (outcome.result === "duplicate") toast.push(t("reconnect_duplicate"), "error");
        else if (outcome.result === "same") toast.push(t("reconnect_same"), "error");
        else if (outcome.result === "ok" && st.end === "from") toast.push(t("reconnect_moved"), "ok");
      }
    } else if (st.kind === "nodes") {
      if (st.moved && canEdit) {
        const moved: Record<string, NodePos> = {};
        for (const [id, o] of Object.entries(st.orig)) moved[id] = { x: o.x + st.dx, y: o.y + st.dy };
        commitPositions(moved);
        // En Esquema, soltar dentro de un marco mete la escena en esa área
        if (mode === "scenes") {
          const box = areaHitAt(x, y);
          if (box != null) {
            editor.apply((draft) => {
              for (const id of Object.keys(st.orig)) assignScene(draft, id, box);
            });
          }
        }
      } else if (!st.moved && mode === "autopilot" && canEdit && route != null) {
        const clicked = [...selectedNodes][0];
        if (clicked != null) {
          patchRoutes((list) => list.map((r, i) => (i === routeIndex ? { ...r, steps: [...r.steps, { scene: clicked, seconds: 6 }] } : r)));
        }
      }
    } else if (st.kind === "place") {
      if (placeGhostRef.current != null) placeGhostRef.current.style.display = "none";
      if (mode === "plan" && currentPlan != null) {
        editor.apply((draft) => placeScene(draft, st.sceneId, currentPlan.id, x / PLAN_W, y / planH));
      } else if (mode === "geo") {
        editor.apply((draft) => setGeo(draft, st.sceneId, worldYToLat(y), worldXToLng(x)));
      }
    } else if (st.kind === "marquee" && marquee != null) {
      const x0 = Math.min(marquee.x0, marquee.x1);
      const x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1);
      const y1 = Math.max(marquee.y0, marquee.y1);
      const inside = Object.entries(positionsRef.current)
        .filter(([, p]) => p.x + size.w > x0 && p.x < x1 && p.y + size.h > y0 && p.y < y1)
        .map(([id]) => id);
      setSelectedNodes(() => {
        if (st.mode === "replace") return new Set(inside);
        const next = new Set(st.base);
        for (const id of inside) {
          if (st.mode === "add") next.add(id);
          else next.delete(id);
        }
        return next;
      });
      setMarquee(null);
    }
  };

  const connect = (from: string, to: string): void => {
    let created: string | null = null;
    editor.apply((draft) => {
      created = createNavHotspot(draft, from, to);
      if (created != null && bothWays) createNavHotspot(draft, to, from, { entryMode: "forward" });
    });
    if (created != null) setSelectedEdges(new Set([created]));
    else toast.push(t("connect_exists"), "error");
  };

  const onDoubleClick = (e: React.MouseEvent): void => {
    const { x, y } = toWorld(e.clientX, e.clientY);
    const nodeId = hitNode(x, y);
    if (nodeId != null) onOpenScene?.(nodeId);
    else fitView();
  };

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    const { x, y } = toWorld(e.clientX, e.clientY);
    const nodeId = hitNode(x, y);
    if (nodeId != null) {
      const rect = svgRef.current!.getBoundingClientRect();
      setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, sceneId: nodeId });
    }
  };

  // ---------------------------------------------------------------------
  // Marcos de área
  // ---------------------------------------------------------------------
  const frames = useMemo(() => {
    if (mode !== "scenes" && mode !== "autopilot") return [];
    const out: { area: Area; x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const area of areas) {
      const ids = snapshot.scenes.filter((s) => areaOfScene(s) === area.id).map((s) => s.id);
      const box = boundsOf(positions, ids, { w: NODE_W, h: NODE_H });
      if (box == null) continue;
      out.push({ area, x0: box.x0 - 22, y0: box.y0 - 40, x1: box.x1 + 22, y1: box.y1 + 22 });
    }
    // Los marcos grandes se dibujan primero para no tapar a los pequeños
    return out.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
  }, [areas, snapshot.scenes, positions, mode]);
  framesRef.current = frames;

  /** Área cuyo marco contiene el punto, la más pequeña si hay varias. */
  const areaHitAt = (x: number, y: number): string | null => {
    const inside = framesRef.current.filter((f) => x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1);
    if (inside.length === 0) return null;
    return inside[inside.length - 1]!.area.id;
  };

  const issues = useMemo(() => graphIssues(snapshot, edges, orphans), [snapshot, edges, orphans]);

  const focusIssue = useCallback(
    (issue: GraphIssue): void => {
      const pos = positionsRef.current[issue.sceneId];
      if (pos != null && svgRef.current != null) {
        const rect = svgRef.current.getBoundingClientRect();
        const scale = Math.max(0.6, viewRef.current.scale);
        setView({
          scale,
          ox: rect.width / 2 - (pos.x + sizeRef.current.w / 2) * scale,
          oy: rect.height / 2 - (pos.y + sizeRef.current.h / 2) * scale,
        });
      }
      if (issue.hotspotId != null) {
        setSelectedEdges(new Set([issue.hotspotId]));
        setSelectedNodes(new Set());
      } else {
        setSelectedNodes(new Set([issue.sceneId]));
        setSelectedEdges(new Set());
      }
    },
    [setView],
  );

  const issueAction = useCallback(
    (issue: GraphIssue): { label: string; run: () => void } | null => {
      if (!canEdit) return null;
      if (issue.kind === "no-return") {
        const edge = edges.find((e) => e.id === issue.hotspotId);
        if (edge == null) return null;
        return {
          label: t("add_return"),
          run: () => editor.apply((draft) => createNavHotspot(draft, edge.to, edge.from, { entryMode: "forward" })),
        };
      }
      if (issue.kind === "no-target" || issue.kind === "broken-target") {
        return {
          label: t("delete"),
          run: () => {
            if (issue.hotspotId != null) editor.apply((draft) => deleteEdge(draft, issue.hotspotId!));
          },
        };
      }
      if (issue.kind === "unplaced") return { label: t("place_in_panorama"), run: () => onOpenScene?.(issue.sceneId, issue.hotspotId) };
      if (issue.kind === "orphan") return { label: t("open_scene"), run: () => onOpenScene?.(issue.sceneId) };
      return null;
    },
    [canEdit, edges, editor, onOpenScene, t],
  );

  const selectedEdgeId = selectedEdges.size === 1 ? [...selectedEdges][0]! : null;
  const selectedHotspot = selectedEdgeId != null ? (snapshot.hotspots.find((h) => h.id === selectedEdgeId) ?? null) : null;
  const selectedContent = readJson<{ target?: string; label?: string; unplaced?: boolean; oneWay?: boolean; entry?: { mode?: string }; transition?: { kind?: string } }>(
    selectedHotspot?.contentJson ?? null,
    {},
  );

  const patchEdgeContent = (patch: Record<string, unknown>): void => {
    if (selectedHotspot == null) return;
    editor.apply((draft) => {
      const target = draft.hotspots.find((h) => h.id === selectedHotspot.id);
      if (target == null) return;
      const content = readJson<Record<string, unknown>>(target.contentJson, {});
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete content[key];
        else content[key] = value;
      }
      target.contentJson = JSON.stringify(content);
    });
  };

  const startScene = (snapshot.settings.startScene as string) ?? snapshot.scenes[0]?.id;
  const matches = useMemo(() => {
    const q = (search ?? "").trim().toLowerCase();
    if (q === "") return new Set<string>();
    return new Set(snapshot.scenes.filter((s) => s.title.toLowerCase().includes(q)).map((s) => s.id));
  }, [search, snapshot.scenes]);

  const applyAlign = (kind: Parameters<typeof alignNodes>[2]): void => {
    const ids = [...selectedNodes];
    const next = alignNodes(positionsRef.current, ids, kind, size);
    commitPositions(Object.fromEntries(ids.map((id) => [id, next[id]!])));
  };
  const applyDistribute = (axis: "h" | "v"): void => {
    const ids = [...selectedNodes];
    const next = distributeNodes(positionsRef.current, ids, axis, size);
    commitPositions(Object.fromEntries(ids.map((id) => [id, next[id]!])));
  };

  const areaCounts = useMemo(() => {
    const out: Record<string, { scenes: number; placed: number }> = {};
    for (const area of areas) {
      const list = snapshot.scenes.filter((s) => areaOfScene(s) === area.id);
      out[area.id] = { scenes: list.length, placed: list.filter((s) => placementOf(s)?.area === area.id).length };
    }
    return out;
  }, [areas, snapshot.scenes]);

  const worldRect = useMemo(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect == null) return { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    return {
      x0: -view.ox / view.scale,
      y0: -view.oy / view.scale,
      x1: (rect.width - view.ox) / view.scale,
      y1: (rect.height - view.oy) / view.scale,
    };
  }, [view, mode]);
  const tiles = useMemo(() => (mode === "geo" ? tilesForView(worldRect, view.scale) : []), [mode, worldRect, view.scale]);
  const tileTemplate = (snapshot.settings.geoMap as { tileUrl?: string } | undefined)?.tileUrl ?? DEFAULT_TILE_URL;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--anda-border)] bg-[var(--anda-surface)] px-3 py-1.5">
          <div className="flex rounded-lg bg-[var(--anda-surface-2)] p-0.5" role="group" aria-label={t("canvas_mode")}>
            {GRAPH_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === m ? "bg-[var(--anda-surface)] text-[var(--anda-text)] shadow-sm" : "text-[var(--anda-text-dim)]"
                }`}
              >
                {t(`graph_mode_${m}`)}
              </button>
            ))}
          </div>

          {mode === "plan" && planAreas.length > 1 && (
            <Select className="max-w-44" aria-label={t("floorplan")} value={currentPlan?.id ?? ""} onChange={(e) => setPlanArea(e.target.value)}>
              {planAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                  {a.level != null ? ` · ${t("floor_level")} ${a.level}` : ""}
                </option>
              ))}
            </Select>
          )}

          {selectedNodes.size >= 2 && canEdit && (
            <div className="flex items-center gap-0.5 rounded-lg bg-[var(--anda-surface-2)] p-0.5">
              {(
                [
                  ["left", AlignStartVertical, t("align_left")],
                  ["hcenter", AlignCenterVertical, t("align_hcenter")],
                  ["right", AlignEndVertical, t("align_right")],
                  ["top", AlignStartHorizontal, t("align_top")],
                  ["vcenter", AlignCenterHorizontal, t("align_vcenter")],
                  ["bottom", AlignEndHorizontal, t("align_bottom")],
                ] as const
              ).map(([kind, Icon, label]) => (
                <Tooltip key={kind} content={label}>
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={label} onClick={() => applyAlign(kind)}>
                    <Icon className="h-4 w-4" />
                  </Button>
                </Tooltip>
              ))}
              <Tooltip content={t("distribute_h")}>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("distribute_h")} onClick={() => applyDistribute("h")}>
                  <AlignHorizontalDistributeCenter className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Tooltip content={t("distribute_v")}>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("distribute_v")} onClick={() => applyDistribute("v")}>
                  <AlignVerticalDistributeCenter className="h-4 w-4" />
                </Button>
              </Tooltip>
            </div>
          )}

          <div className="flex-1" />

          {mode !== "autopilot" && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--anda-text-dim)]">
              <input type="checkbox" checked={bothWays} onChange={(e) => setBothWays(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--anda-primary)]" />
              {t("create_return")}
            </label>
          )}
          <GraphIssues issues={issues} onFocus={focusIssue} actionFor={issueAction} />
          <Tooltip content={`${t("search")} (Ctrl+F)`}>
            <Button size="sm" variant="ghost" aria-label={t("search")} onClick={() => setSearch((s) => (s == null ? "" : null))}>
              <Search className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content={t("areas")}>
            <Button size="sm" variant={areasOpen ? "outline" : "ghost"} aria-label={t("areas")} aria-pressed={areasOpen} onClick={() => setAreasOpen((v) => !v)}>
              <Layers className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content={`${t("snap_grid")} (G)`}>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("snap_grid")}
              aria-pressed={snap}
              className={snap ? "text-[var(--anda-primary)]" : ""}
              onClick={() => setSnap((v) => !v)}
            >
              <Magnet className="h-4 w-4" />
            </Button>
          </Tooltip>
          <GraphHelp mode={mode} />
          <Tooltip content={`${t("fit_view")} (F)`}>
            <Button size="sm" variant="ghost" aria-label={t("fit_view")} onClick={() => fitView()}>
              <Expand className="h-4 w-4" />
            </Button>
          </Tooltip>
          {(mode === "scenes" || mode === "autopilot") && (
            <Tooltip content={`${t("auto_layout")} (L)`}>
              <Button size="sm" variant="ghost" aria-label={t("auto_layout")} onClick={autoLayout} disabled={!canEdit}>
                <Wand2 className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
          {/* En el mapa el porcentaje no dice nada: lo que se entiende es el
              nivel de zoom, el mismo que usa OpenStreetMap */}
          <span className="w-14 text-right text-xs tabular-nums text-[var(--anda-text-dim)]">
            {mode === "geo" ? `z${tileZoomFor(view.scale)}` : `${Math.round(view.scale * 100)}%`}
          </span>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {search != null && (
            <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] px-2 py-1.5 shadow-[var(--anda-shadow-lg)]">
              <Search className="h-4 w-4 text-[var(--anda-text-dim)]" />
              <Input
                autoFocus
                className="h-8 w-56 text-[13px]"
                aria-label={t("search_scene")}
                placeholder={t("search_scene")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const first = [...matches][0];
                    if (first != null) {
                      setSelectedNodes(new Set([first]));
                      fitView([first]);
                    }
                  } else if (e.key === "Escape") setSearch(null);
                }}
              />
              <span className="text-xs tabular-nums text-[var(--anda-text-dim)]">{matches.size}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("close")} onClick={() => setSearch(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {connecting != null && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-[var(--anda-primary)] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              {hoverNode != null
                ? t("connect_release_on", { name: snapshot.scenes.find((sc) => sc.id === hoverNode)?.title ?? "" })
                : t("connect_drag_hint")}
            </div>
          )}
          {keyboardConnect != null && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-[var(--anda-primary)] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              {t("keyboard_connect_from", { name: snapshot.scenes.find((s) => s.id === keyboardConnect)?.title ?? "" })}
            </div>
          )}
          {calibrating != null && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-xl bg-[var(--anda-surface)] px-3 py-2 text-[13px] shadow-[var(--anda-shadow-lg)]">
              {calibrating.a == null ? t("calibrate_click_first") : calibrating.b == null ? t("calibrate_click_second") : t("calibrate_type_meters")}
            </div>
          )}

          {mode === "plan" && currentPlan == null ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--anda-bg)] text-center">
              <p className="max-w-sm text-[13px] text-[var(--anda-text-dim)]">{t("no_plan_yet")}</p>
              {/* El plano es de un área concreta: preguntarlo aquí evita
                  colgárselo a la primera de la lista y tener que deshacerlo */}
              <div className="flex items-center gap-2">
                {areas.length > 0 && (
                  <Select className="max-w-52" aria-label={t("area")} value={planTarget ?? areas[0]!.id} onChange={(e) => setPlanTarget(e.target.value)} disabled={!canEdit}>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </Select>
                )}
                <Button
                  disabled={!canEdit}
                  onClick={() => {
                    const chosen = planTarget ?? areas[0]?.id;
                    if (chosen != null) {
                      setPlanPicker(chosen);
                      return;
                    }
                    let id = "";
                    editor.apply((draft) => {
                      id = createArea(draft, t("area_default_name"));
                    });
                    setPlanPicker(id);
                  }}
                >
                  <Plus className="h-4 w-4" /> {t("add_plan")}
                </Button>
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className={`h-full w-full touch-none select-none bg-[var(--anda-bg)] ${mediaOver ? "outline outline-2 -outline-offset-2 outline-[var(--anda-primary)]" : ""}`}
              role="application"
              aria-label={t("graph")}
              onDragOver={(e) => {
                if (!canEdit || !hasMediaDrag(e.dataTransfer)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setMediaOver(true);
              }}
              onDragLeave={() => setMediaOver(false)}
              onDrop={(e) => {
                setMediaOver(false);
                const items = canEdit ? readMediaDrag(e.dataTransfer) : null;
                if (items == null) return;
                e.preventDefault();
                const at = toWorld(e.clientX, e.clientY);
                let ids: string[] = [];
                const area = mode === "plan" ? currentPlan?.id : mode === "scenes" ? areaHitAt(at.x, at.y) : null;
                editor.apply((draft) => {
                  ids = scenesFromMedia(draft, draft.scenes[0]?.projectId ?? "", items);
                  if (area != null) for (const id of ids) assignScene(draft, id, area);
                  if (mode === "plan" && currentPlan != null) {
                    ids.forEach((id, i) => placeScene(draft, id, currentPlan.id, (at.x + i * 40 * k) / PLAN_W, (at.y + i * 24 * k) / planH));
                  } else if (mode === "geo") {
                    ids.forEach((id, i) => setGeo(draft, id, worldYToLat(at.y + i * 24 * k), worldXToLng(at.x + i * 40 * k)));
                  }
                });
                if (mode === "scenes" || mode === "autopilot") {
                  const next = { ...positionsRef.current };
                  ids.forEach((id, i) => {
                    next[id] = {
                      x: Math.round((at.x + (i % 4) * (NODE_W + 40)) / 10) * 10,
                      y: Math.round((at.y + Math.floor(i / 4) * (NODE_H + 40)) / 10) * 10,
                    };
                  });
                  setLayout(next);
                  positionsRef.current = next;
                  editor.apply((draft) => {
                    draft.settings.graphLayout = next;
                  });
                }
              }}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
            >
              <defs>
                <pattern
                  id="graph-dots"
                  width={24 * view.scale}
                  height={24 * view.scale}
                  patternUnits="userSpaceOnUse"
                  x={view.ox % (24 * view.scale)}
                  y={view.oy % (24 * view.scale)}
                >
                  <circle cx="1" cy="1" r="1" fill="var(--anda-border)" />
                </pattern>
              </defs>
              {mode !== "geo" && <rect width="100%" height="100%" fill="url(#graph-dots)" />}

              <g transform={`translate(${view.ox} ${view.oy}) scale(${view.scale})`}>
                {/* Teselas del mapa */}
                {mode === "geo" &&
                  tiles.map((tile) => (
                    <image
                      key={`${tile.z}/${tile.x}/${tile.y}/${tile.wx}`}
                      href={tileUrl(tileTemplate, tile)}
                      x={tile.wx}
                      y={tile.wy}
                      width={tile.size}
                      height={tile.size}
                      style={{ pointerEvents: "none" }}
                    />
                  ))}

                {/* Plano de planta: aquí la posición del nodo es la del marcador */}
                {mode === "plan" && planUrl != null && (
                  <>
                    <rect x={0} y={0} width={PLAN_W} height={planH} fill="#fff" stroke="var(--anda-border)" strokeWidth={k} />
                    <image
                      href={planUrl}
                      x={0}
                      y={0}
                      width={PLAN_W}
                      height={planH}
                      opacity={currentPlan?.plan?.opacity ?? 1}
                      preserveAspectRatio="none"
                      style={{ pointerEvents: "none" }}
                    />
                    {calibrating?.a != null && (
                      <g style={{ pointerEvents: "none" }}>
                        <line
                          x1={calibrating.a.x * PLAN_W}
                          y1={calibrating.a.y * planH}
                          x2={(calibrating.b ?? calibrating.a).x * PLAN_W}
                          y2={(calibrating.b ?? calibrating.a).y * planH}
                          stroke="var(--anda-primary)"
                          strokeWidth={3 * k}
                        />
                        <circle cx={calibrating.a.x * PLAN_W} cy={calibrating.a.y * planH} r={5 * k} fill="var(--anda-primary)" />
                        {calibrating.b != null && <circle cx={calibrating.b.x * PLAN_W} cy={calibrating.b.y * planH} r={5 * k} fill="var(--anda-primary)" />}
                      </g>
                    )}
                  </>
                )}

                {/* Marcos de área */}
                {frames.map((f) => (
                  <g key={f.area.id} style={{ pointerEvents: "none" }}>
                    <rect
                      x={f.x0}
                      y={f.y0}
                      width={f.x1 - f.x0}
                      height={f.y1 - f.y0}
                      rx={18}
                      fill={f.area.color ?? "#7c3aed"}
                      fillOpacity={0.06}
                      stroke={f.area.color ?? "#7c3aed"}
                      strokeOpacity={0.5}
                      strokeWidth={1.5}
                    />
                    <text x={f.x0 + 14} y={f.y0 + 24} fontSize={14} fontWeight={700} fill={f.area.color ?? "#7c3aed"}>
                      {f.area.title}
                      {f.area.level != null ? ` · ${t("floor_level")} ${f.area.level}` : ""}
                    </text>
                  </g>
                ))}

                {/* Aristas */}
                {visibleEdges.map((e) => {
                  const { d, mid, midAngle, endAngle, sample } = edgePath(e, positions, visibleEdges, size);
                  const fin = sample[sample.length - 1] ?? mid;
                  const selected = selectedEdges.has(e.id);
                  const step = (e as { step?: number }).step;
                  const fromScene = snapshot.scenes.find((s) => s.id === e.from);
                  const toScene = snapshot.scenes.find((s) => s.id === e.to);
                  const crossArea = mode !== "autopilot" && fromScene != null && toScene != null && areaOfScene(fromScene) !== areaOfScene(toScene);
                  const color = mode === "autopilot" ? "var(--anda-accent)" : selected ? "var(--anda-primary)" : crossArea ? "#d97706" : "var(--anda-text-dim)";
                  const label = (e as GraphEdge).label ?? "";
                  return (
                    <g key={e.id}>
                      <path
                        ref={(el) => {
                          const list = edgeRefs.current.get(e.id) ?? [];
                          if (el != null && !list.includes(el)) edgeRefs.current.set(e.id, [...list, el]);
                        }}
                        d={d}
                        fill="none"
                        stroke={color}
                        strokeOpacity={selected || mode === "autopilot" || crossArea ? 1 : 0.55}
                        strokeWidth={(selected ? 2.5 : crossArea ? 2.2 : 1.8) * k}
                        strokeDasharray={e.unplaced ? `${6 * k} ${4 * k}` : undefined}
                      />
                      <path
                        ref={(el) => {
                          const list = edgeRefs.current.get(e.id) ?? [];
                          if (el != null && !list.includes(el)) edgeRefs.current.set(e.id, [...list, el]);
                        }}
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16 * k}
                        style={{ cursor: "pointer" }}
                      />
                      {/* Punta en el destino: se lee el sentido aunque el
                          centro de la curva quede fuera de la pantalla */}
                      <path
                        d={arrowPath(fin.x, fin.y, endAngle, 6 * k)}
                        fill={color}
                        fillOpacity={selected || mode === "autopilot" || crossArea ? 1 : 0.7}
                        style={{ pointerEvents: "none" }}
                      />
                      {step != null ? (
                        <>
                          <circle cx={mid.x} cy={mid.y} r={9 * k} fill="var(--anda-accent)" />
                          <text x={mid.x} y={mid.y + 3.5 * k} textAnchor="middle" fontSize={10 * k} fontWeight={700} fill="#fff">
                            {step}
                          </text>
                        </>
                      ) : (
                        <>
                          {/* La etiqueta del paso, visible sin tener que
                              seleccionar la flecha para saber qué dice */}
                          {label !== "" && view.scale > 0.55 && (
                            <text
                              x={mid.x}
                              y={mid.y - 6 * k}
                              textAnchor="middle"
                              fontSize={10 * k}
                              fill={color}
                              stroke="var(--anda-bg)"
                              strokeWidth={3 * k}
                              paintOrder="stroke"
                              style={{ pointerEvents: "none" }}
                            >
                              {shorten(label, 20)}
                              {(e as GraphEdge).oneWay === true ? " ›" : ""}
                            </text>
                          )}
                          {/* Una flecha dice el sentido; un punto, no */}
                          <path
                            d={arrowPath(mid.x, mid.y, midAngle, (selected ? 8 : 6.5) * k)}
                            fill={color}
                            fillOpacity={selected ? 1 : 0.75}
                            style={{ pointerEvents: "none" }}
                          />
                        </>
                      )}
                      {selected && mode !== "autopilot" && canEdit && (
                        <g
                          style={{ cursor: "pointer" }}
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            editor.apply((draft) => deleteEdge(draft, e.id));
                            setSelectedEdges(new Set());
                          }}
                        >
                          <title>{t("unlink_scenes")}</title>
                          <circle cx={mid.x} cy={mid.y - 18 * k} r={10 * k} fill="var(--anda-danger, #dc2626)" />
                          <path
                            d={`M ${mid.x - 4 * k} ${mid.y - 22 * k} L ${mid.x + 4 * k} ${mid.y - 14 * k} M ${mid.x + 4 * k} ${mid.y - 22 * k} L ${mid.x - 4 * k} ${mid.y - 14 * k}`}
                            stroke="#fff"
                            strokeWidth={2 * k}
                            strokeLinecap="round"
                          />
                        </g>
                      )}
                    </g>
                  );
                })}

                <path
                  ref={ghostPathRef}
                  fill="none"
                  stroke="var(--anda-primary)"
                  strokeWidth={2.5 * k}
                  strokeLinecap="round"
                  style={{ display: "none", pointerEvents: "none" }}
                />
                <rect
                  ref={placeGhostRef}
                  width={size.w}
                  height={size.h}
                  rx={8 * k}
                  fill="var(--anda-primary)"
                  fillOpacity={0.25}
                  stroke="var(--anda-primary)"
                  strokeWidth={k}
                  style={{ display: "none", pointerEvents: "none" }}
                />

                {/* Nodos. Dentro se dibuja en píxeles de pantalla: sobre un
                    plano o un mapa el marcador tiene que medir siempre igual. */}
                {visibleScenes.map((scene) => {
                  const p = positions[scene.id]!;
                  const isDropTarget = hoverNode === scene.id;
                  const selected = selectedNodes.has(scene.id);
                  const isStart = startScene === scene.id;
                  const orphan = orphans.has(scene.id);
                  const dimmed = search != null && search.trim() !== "" && !matches.has(scene.id);
                  const area = areas.find((a) => a.id === areaOfScene(scene));
                  const status = nodeStatus(snapshot, scene, edges);
                  const compact = compactNodes;
                  const nw = compact ? MARK_W : NODE_W;
                  const nh = compact ? MARK_H : NODE_H;
                  const leaving = compact ? edges.filter((e) => e.from === scene.id && positions[e.to] == null).length : 0;
                  return (
                    <g
                      key={scene.id}
                      ref={(el) => {
                        if (el != null) nodeRefs.current.set(scene.id, el);
                        else nodeRefs.current.delete(scene.id);
                      }}
                      transform={`translate(${p.x} ${p.y})${nodeTransformSuffix}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`${scene.title}${area != null ? ` · ${area.title}` : ""} · ${t("exits_n", { n: String(status.exits) })}`}
                      opacity={dimmed ? 0.25 : 1}
                      style={{ cursor: connecting != null ? "crosshair" : "grab", outline: "none" }}
                      onFocus={() => setFocusedNode(scene.id)}
                      onBlur={() => setFocusedNode((f) => (f === scene.id ? null : f))}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          if (keyboardConnect != null && keyboardConnect !== scene.id && canEdit) {
                            connect(keyboardConnect, scene.id);
                            setKeyboardConnect(null);
                          } else if (ev.key === "Enter") onOpenScene?.(scene.id);
                          else setSelectedNodes(new Set([scene.id]));
                        }
                      }}
                    >
                      {(isDropTarget || focusedNode === scene.id) && (
                        <rect
                          x={-5}
                          y={-5}
                          width={nw + 10}
                          height={nh + 10}
                          rx={16}
                          fill="var(--anda-primary)"
                          fillOpacity={isDropTarget ? 0.14 : 0}
                          stroke="var(--anda-primary)"
                          strokeWidth={2}
                          strokeDasharray={focusedNode === scene.id && !isDropTarget ? "4 3" : undefined}
                          style={{ pointerEvents: "none" }}
                        />
                      )}
                      {matches.has(scene.id) && (
                        <rect x={-3} y={-3} width={nw + 6} height={nh + 6} rx={14} fill="none" stroke="#f59e0b" strokeWidth={2.5} style={{ pointerEvents: "none" }} />
                      )}
                      <rect
                        width={nw}
                        height={nh}
                        rx={compact ? 10 : 12}
                        fill="var(--anda-surface)"
                        stroke={isDropTarget || selected ? "var(--anda-primary)" : orphan ? "#d97706" : (area?.color ?? "var(--anda-border)")}
                        strokeWidth={isDropTarget || selected ? 2.5 : 1.5}
                      />
                      {area != null && <rect x={0} y={0} width={4} height={nh} rx={2} fill={area.color ?? "#7c3aed"} style={{ pointerEvents: "none" }} />}
                      {!compact && scene.mediaId != null && (
                        <image
                          href={`/api/v1/media/${scene.mediaId}/derived/thumb`}
                          x={8}
                          y={8}
                          width={NODE_W - 16}
                          height={44}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath="inset(0 round 7)"
                          style={{ pointerEvents: "none" }}
                        />
                      )}
                      <text
                        x={compact ? 12 : 10}
                        y={compact ? nh / 2 + 4 : nh - 22}
                        fontSize={compact ? 11 : 12}
                        fontWeight={600}
                        fill="var(--anda-text)"
                        style={{ pointerEvents: "none" }}
                      >
                        {shorten(scene.title, compact ? 15 : 20)}
                      </text>
                      {!compact && (
                        <>
                          <text x={10} y={NODE_H - 8} fontSize={10} fill="var(--anda-text-dim)" style={{ pointerEvents: "none" }}>
                            {isStart ? `★ ${t("start_scene_badge")}` : `${status.exits} →`}
                          </text>
                          {/* Estado del nodo de un vistazo */}
                          <g transform={`translate(${NODE_W - 12} ${NODE_H - 12})`} style={{ pointerEvents: "none" }}>
                            {[
                              status.noMedia ? { color: "#dc2626", title: t("badge_no_media") } : null,
                              status.noAlt ? { color: "#d97706", title: t("badge_no_alt") } : null,
                              status.unplaced > 0 ? { color: "#f59e0b", title: t("badge_unplaced") } : null,
                              status.hidden ? { color: "#64748b", title: t("badge_hidden") } : null,
                              status.extras > 0 ? { color: "var(--anda-accent)", title: t("badge_extras") } : null,
                              status.audio ? { color: "#0891b2", title: t("badge_audio") } : null,
                            ]
                              .filter((b): b is { color: string; title: string } => b != null)
                              .map((b, i) => (
                                <circle key={b.title} cx={-i * 9} cy={0} r={3.5} fill={b.color}>
                                  <title>{b.title}</title>
                                </circle>
                              ))}
                          </g>
                        </>
                      )}
                      {compact && leaving > 0 && (
                        <g transform={`translate(${nw - 22} ${nh / 2})`} style={{ pointerEvents: "none" }}>
                          <title>{t("steps_leaving_plan", { n: String(leaving) })}</title>
                          <circle cx={0} cy={0} r={8} fill="#d97706" />
                          <text x={0} y={3} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
                            {leaving}
                          </text>
                        </g>
                      )}
                      {compact && isStart && (
                        <text x={nw - 36} y={nh / 2 + 4} fontSize={11} fill="var(--anda-primary)" style={{ pointerEvents: "none" }}>
                          ★
                        </text>
                      )}
                      <circle cx={0} cy={nh / 2} r={PORT_R} fill="var(--anda-surface)" stroke="var(--anda-text-dim)" strokeWidth={1.5} />
                      {canEdit && mode !== "autopilot" && <rect x={nw - 14} y={6} width={26} height={nh - 12} fill="transparent" style={{ cursor: "crosshair" }} />}
                      <circle
                        cx={nw}
                        cy={nh / 2}
                        r={connecting === scene.id ? PORT_R + 3 : PORT_R}
                        fill={canEdit ? "var(--anda-primary)" : "var(--anda-surface)"}
                        stroke="var(--anda-primary)"
                        strokeWidth={connecting === scene.id ? 3 : 1.5}
                        style={{ cursor: canEdit ? "crosshair" : "default", pointerEvents: "none" }}
                      />
                    </g>
                  );
                })}

                {/* Radar de orientación: girarlo es calibrar el norte */}
                {mode === "plan" &&
                  canEdit &&
                  [...selectedNodes]
                    .map((id) => ({ id, p: positions[id], scene: snapshot.scenes.find((s) => s.id === id) }))
                    .filter((n) => n.p != null && n.scene != null)
                    .map(({ id, p, scene }) => {
                      const north = placementOf(scene!)?.north ?? 0;
                      const cx = p!.x + size.w / 2;
                      const cy = p!.y + size.h / 2;
                      const r = 52 * k;
                      const handle = { x: cx + Math.sin(north) * r, y: cy - Math.cos(north) * r };
                      return (
                        <g key={`north-${id}`}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke="var(--anda-primary)"
                            strokeOpacity={0.35}
                            strokeDasharray={`${4 * k} ${4 * k}`}
                            strokeWidth={k}
                          />
                          <path
                            d={`M ${cx} ${cy} L ${cx + Math.sin(north - 0.35) * r} ${cy - Math.cos(north - 0.35) * r} A ${r} ${r} 0 0 1 ${cx + Math.sin(north + 0.35) * r} ${cy - Math.cos(north + 0.35) * r} Z`}
                            fill="var(--anda-primary)"
                            fillOpacity={0.25}
                            style={{ pointerEvents: "none" }}
                          />
                          <circle
                            cx={handle.x}
                            cy={handle.y}
                            r={9 * k}
                            fill="var(--anda-surface)"
                            stroke="var(--anda-primary)"
                            strokeWidth={3 * k}
                            style={{ cursor: "grab" }}
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                              dragRef.current = { kind: "north", sceneId: id };
                            }}
                          >
                            <title>{t("calibrate_north")}</title>
                          </circle>
                        </g>
                      );
                    })}

                {/* Extremos agarrables de la arista seleccionada. Van en su
                    propia capa, después de los nodos: dibujados con las aristas
                    quedaban debajo del nodo y no se podían agarrar. */}
                {mode !== "autopilot" &&
                  canEdit &&
                  selectedHotspot != null &&
                  (() => {
                    const edge = drawnEdges.find((e) => e.id === selectedHotspot.id);
                    if (edge == null) return null;
                    const from = positions[edge.from];
                    const to = positions[edge.to];
                    if (from == null || to == null) return null;
                    const handles = [
                      { end: "from" as const, x: from.x + size.w + 12 * k, y: from.y + size.h / 2, anchor: edge.to, hint: t("reconnect_source") },
                      { end: "to" as const, x: to.x - 12 * k, y: to.y + size.h / 2, anchor: edge.from, hint: t("reconnect_target") },
                    ];
                    return (
                      <g>
                        {handles.map((h) => (
                          <g
                            key={h.end}
                            style={{ cursor: "grab" }}
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                              const { x, y } = toWorld(ev.clientX, ev.clientY);
                              dragRef.current = { kind: "reconnect", edgeId: edge.id, end: h.end, anchor: h.anchor };
                              setConnecting(h.anchor);
                              drawGhost(h.anchor, x, y);
                            }}
                          >
                            <title>{h.hint}</title>
                            <circle cx={h.x} cy={h.y} r={11 * k} fill="var(--anda-primary)" fillOpacity={0.15} />
                            <circle cx={h.x} cy={h.y} r={6.5 * k} fill="var(--anda-surface)" stroke="var(--anda-primary)" strokeWidth={3 * k} />
                          </g>
                        ))}
                      </g>
                    );
                  })()}

                {/* Guías de alineación */}
                {guides.v.map((gx) => (
                  <line key={`v${gx}`} x1={gx} y1={worldRect.y0} x2={gx} y2={worldRect.y1} stroke="#f59e0b" strokeWidth={k} style={{ pointerEvents: "none" }} />
                ))}
                {guides.h.map((gy) => (
                  <line key={`h${gy}`} x1={worldRect.x0} y1={gy} x2={worldRect.x1} y2={gy} stroke="#f59e0b" strokeWidth={k} style={{ pointerEvents: "none" }} />
                ))}

                {marquee != null && (
                  <rect
                    x={Math.min(marquee.x0, marquee.x1)}
                    y={Math.min(marquee.y0, marquee.y1)}
                    width={Math.abs(marquee.x1 - marquee.x0)}
                    height={Math.abs(marquee.y1 - marquee.y0)}
                    fill="var(--anda-primary)"
                    fillOpacity={0.08}
                    stroke="var(--anda-primary)"
                    strokeWidth={k}
                    strokeDasharray={`${4 * k} ${3 * k}`}
                  />
                )}
              </g>
            </svg>
          )}

          {/* Renombrar sin salir del lienzo */}
          {renaming != null && positions[renaming] != null && (
            <input
              autoFocus
              className="absolute z-30 rounded-md border border-[var(--anda-primary)] bg-[var(--anda-surface)] px-1 text-[13px] shadow"
              style={{
                left: positions[renaming]!.x * view.scale + view.ox + 6,
                top: positions[renaming]!.y * view.scale + view.oy + (compactNodes ? 4 : 52),
                width: Math.max(120, (compactNodes ? MARK_W : NODE_W) - 12),
              }}
              defaultValue={snapshot.scenes.find((s) => s.id === renaming)?.title ?? ""}
              aria-label={t("scene_title")}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== "") {
                  editor.apply((draft) => {
                    const target = draft.scenes.find((s) => s.id === renaming);
                    if (target != null) target.title = value;
                  });
                }
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                else if (e.key === "Escape") setRenaming(null);
              }}
            />
          )}

          {/* Menú contextual */}
          {menu != null && (
            <div
              className="absolute z-20 w-56 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-1 text-[13px] shadow-[var(--anda-shadow-lg)]"
              style={{ left: Math.min(menu.x, (svgRef.current?.clientWidth ?? 400) - 230), top: menu.y }}
            >
              <MenuItem
                onClick={() => {
                  onOpenScene?.(menu.sceneId);
                  setMenu(null);
                }}
              >
                {t("open_scene")}
              </MenuItem>
              <MenuItem
                disabled={!canEdit}
                onClick={() => {
                  setRenaming(menu.sceneId);
                  setMenu(null);
                }}
              >
                {t("rename")} (F2)
              </MenuItem>
              <MenuItem
                disabled={!canEdit}
                onClick={() => {
                  editor.apply((draft) => {
                    draft.settings.startScene = menu.sceneId;
                  });
                  setMenu(null);
                }}
              >
                {t("set_as_start")}
              </MenuItem>
              <MenuItem
                disabled={!canEdit}
                onClick={() => {
                  let id: string | null = null;
                  editor.apply((draft) => {
                    id = duplicateScene(draft, menu.sceneId, t("copy_suffix"));
                  });
                  if (id != null && (mode === "scenes" || mode === "autopilot")) {
                    const from = positionsRef.current[menu.sceneId];
                    if (from != null) commitPositions({ [id]: { x: from.x + 40, y: from.y + 40 } });
                  }
                  setMenu(null);
                }}
              >
                <Copy className="h-3.5 w-3.5" /> {t("duplicate")}
              </MenuItem>
              <div className="my-1 border-t border-[var(--anda-border)]" />
              <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-[var(--anda-text-dim)]">{t("area")}</p>
              <div className="max-h-40 overflow-y-auto">
                <MenuItem
                  disabled={!canEdit}
                  onClick={() => {
                    editor.apply((draft) => assignScene(draft, menu.sceneId, null));
                    setMenu(null);
                  }}
                >
                  {t("area_none")}
                </MenuItem>
                {areas.map((a) => (
                  <MenuItem
                    key={a.id}
                    disabled={!canEdit}
                    onClick={() => {
                      editor.apply((draft) => assignScene(draft, menu.sceneId, a.id));
                      setMenu(null);
                    }}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color ?? "#7c3aed" }} />
                    {a.title}
                  </MenuItem>
                ))}
                <MenuItem
                  disabled={!canEdit}
                  onClick={() => {
                    editor.apply((draft) => {
                      const id = createArea(draft, t("area_default_name"));
                      assignScene(draft, menu.sceneId, id);
                    });
                    setMenu(null);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> {t("new_area")}
                </MenuItem>
              </div>
              <div className="my-1 border-t border-[var(--anda-border)]" />
              <MenuItem
                danger
                disabled={!canEdit}
                onClick={() => {
                  setConfirmDelete([menu.sceneId]);
                  setMenu(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("delete_scene")}
              </MenuItem>
            </div>
          )}

          {/* Escenas sin colocar: se arrastran al plano o al mapa */}
          {((mode === "plan" && currentPlan != null) || mode === "geo") && unplaced.length > 0 && (
            <div className="absolute bottom-3 left-3 z-20 max-h-56 w-56 overflow-y-auto rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-2 shadow-[var(--anda-shadow-lg)]">
              <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">
                {t("unplaced_scenes", { n: String(unplaced.length) })}
              </p>
              <ul>
                {unplaced.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!canEdit}
                      className="w-full cursor-grab truncate rounded-lg px-2 py-1 text-left text-[13px] hover:bg-[var(--anda-surface-2)] disabled:cursor-default"
                      onPointerDown={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        dragRef.current = { kind: "place", sceneId: s.id };
                        (e.target as Element).releasePointerCapture?.(e.pointerId);
                      }}
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="px-1 pt-1 text-[11px] text-[var(--anda-text-dim)]">{t("unplaced_hint_drag")}</p>
            </div>
          )}

          {mode === "geo" && (
            <p className="pointer-events-none absolute bottom-1 right-1 z-10 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">{OSM_ATTRIBUTION}</p>
          )}

          {mode !== "geo" && (
            <Minimap
              positions={positions}
              edges={visibleEdges}
              frames={frames}
              size={size}
              view={view}
              svgRef={svgRef}
              onMove={(ox, oy) => setView((v) => ({ ...v, ox, oy }))}
            />
          )}
        </div>

        {/* Equivalente accesible: sin esto el lienzo no existe para un lector
            de pantalla, y el grafo es la estructura del tour entero. */}
        <div className="sr-only">
          <table>
            <caption>{t("graph_table_caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("scene_title")}</th>
                <th scope="col">{t("area")}</th>
                <th scope="col">{t("steps")}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.scenes.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.title}</th>
                  <td>{areas.find((a) => a.id === areaOfScene(s))?.title ?? t("area_none")}</td>
                  <td>
                    {edges
                      .filter((e) => e.from === s.id)
                      .map((e) => snapshot.scenes.find((x) => x.id === e.to)?.title ?? e.to)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Columna derecha: el inspector manda si hay algo seleccionado */}
      {mode !== "autopilot" && selectedHotspot != null ? (
        <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-l border-[var(--anda-border)] bg-[var(--anda-surface)] p-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">{t("nav_hotspot_edge")}</h3>
          <p className="text-[13px]">
            {snapshot.scenes.find((sc) => sc.id === selectedHotspot.sceneId)?.title} →{" "}
            {snapshot.scenes.find((sc) => sc.id === selectedContent.target)?.title ?? "—"}
          </p>
          {selectedContent.unplaced === true && <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-600">{t("unplaced_hint")}</p>}

          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">{t("label")}</span>
            <Input value={selectedContent.label ?? ""} disabled={!canEdit} onChange={(e) => patchEdgeContent({ label: e.target.value })} />
          </label>

          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">{t("target_scene")}</span>
            <Select value={selectedContent.target ?? ""} disabled={!canEdit} onChange={(e) => patchEdgeContent({ target: e.target.value })}>
              {snapshot.scenes.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.title}
                </option>
              ))}
            </Select>
          </label>

          {/* La orientación de llegada se decide en el destino, mirando el
              panorama al que se entra; aquí solo se llega hasta allí. */}
          <div className="rounded-xl bg-[var(--anda-surface-2)] p-2.5">
            <p className="mb-1.5 text-xs text-[var(--anda-text-dim)]">
              {t("entry_mode")}: <strong>{t(`entry_${selectedContent.entry?.mode ?? "forward"}` as never)}</strong>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                if (selectedContent.target != null) onOpenScene?.(selectedContent.target);
              }}
            >
              <LayoutGrid className="h-4 w-4" /> {t("edit_arrival_there")}
            </Button>
          </div>

          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">{t("transition")}</span>
            <Select
              value={selectedContent.transition?.kind ?? ""}
              disabled={!canEdit}
              onChange={(e) => patchEdgeContent({ transition: e.target.value === "" ? undefined : { kind: e.target.value } })}
            >
              <option value="">{t("transition_default")}</option>
              <option value="fade">{t("transition_fade")}</option>
              <option value="cut">{t("transition_cut")}</option>
              <option value="crossRotate">{t("transition_crossrotate")}</option>
              <option value="zoom">{t("transition_zoom")}</option>
            </Select>
          </label>

          <label className="flex cursor-pointer items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--anda-primary)]"
              checked={selectedContent.oneWay === true}
              disabled={!canEdit}
              onChange={(e) => editor.apply((draft) => setOneWay(draft, selectedHotspot.id, e.target.checked))}
            />
            <span>
              {t("one_way")}
              <span className="block text-xs text-[var(--anda-text-dim)]">{t("one_way_hint")}</span>
            </span>
          </label>

          <div className="space-y-2 pt-1">
            <Button size="sm" variant="outline" className="w-full" onClick={() => onOpenScene?.(selectedHotspot.sceneId, selectedHotspot.id)}>
              <LayoutGrid className="h-4 w-4" /> {t("place_in_panorama")}
            </Button>
            {!edges.some((e) => e.from === selectedContent.target && e.to === selectedHotspot.sceneId) && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!canEdit || selectedContent.target == null}
                onClick={() => {
                  const target = selectedContent.target;
                  if (target == null) return;
                  editor.apply((draft) => createNavHotspot(draft, target, selectedHotspot.sceneId, { entryMode: "forward" }));
                }}
              >
                <Undo2 className="h-4 w-4" /> {t("add_return")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={!canEdit}
              onClick={() => {
                editor.apply((draft) => deleteEdge(draft, selectedHotspot.id));
                setSelectedEdges(new Set());
              }}
            >
              <Trash2 className="h-4 w-4" /> {t("delete")}
            </Button>
          </div>
          <p className="text-xs text-[var(--anda-text-dim)]">{t("delete_edge_hint")}</p>
        </aside>
      ) : mode !== "autopilot" && selectedEdges.size > 1 ? (
        <aside className="w-72 shrink-0 space-y-3 overflow-y-auto border-l border-[var(--anda-border)] bg-[var(--anda-surface)] p-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">{t("edges_selected", { n: String(selectedEdges.size) })}</h3>
          <Select
            aria-label={t("transition")}
            disabled={!canEdit}
            defaultValue=""
            onChange={(e) => {
              const kind = e.target.value;
              editor.apply((draft) => {
                for (const id of selectedEdges) {
                  const target = draft.hotspots.find((h) => h.id === id);
                  if (target == null) continue;
                  const content = readJson<Record<string, unknown>>(target.contentJson, {});
                  if (kind === "") delete content.transition;
                  else content.transition = { kind };
                  target.contentJson = JSON.stringify(content);
                }
              });
            }}
          >
            <option value="">{t("transition_default")}</option>
            <option value="fade">{t("transition_fade")}</option>
            <option value="cut">{t("transition_cut")}</option>
            <option value="crossRotate">{t("transition_crossrotate")}</option>
            <option value="zoom">{t("transition_zoom")}</option>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!canEdit}
            onClick={() =>
              editor.apply((draft) => {
                for (const id of selectedEdges) setOneWay(draft, id, true);
              })
            }
          >
            {t("mark_one_way")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!canEdit}
            onClick={() => {
              editor.apply((draft) => {
                for (const id of selectedEdges) deleteEdge(draft, id);
              });
              setSelectedEdges(new Set());
            }}
          >
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </Button>
        </aside>
      ) : areasOpen ? (
        <GraphAreas
          areas={areas}
          counts={areaCounts}
          looseCount={snapshot.scenes.filter((s) => areaOfScene(s) == null).length}
          currentPlan={currentPlan?.id ?? null}
          canEdit={canEdit}
          onCreate={(parent) => editor.apply((draft) => createArea(draft, t("area_default_name"), { parent }))}
          onPatch={(id, patch) => editor.apply((draft) => patchArea(draft, id, patch))}
          onDelete={(id) => editor.apply((draft) => deleteArea(draft, id))}
          onPickPlan={(id) => setPlanPicker(id)}
          onCalibrate={(id) => {
            setPlanArea(id);
            setMode("plan");
            setCalibrating({ areaId: id });
          }}
          onFocus={(id) => {
            const ids = snapshot.scenes.filter((s) => areaOfScene(s) === id).map((s) => s.id);
            setSelectedNodes(new Set(ids));
            fitView(ids);
          }}
          onOpenPlan={(id) => {
            setPlanArea(id);
            setMode("plan");
          }}
        />
      ) : null}

      {/* Recorridos del autopilot */}
      {mode === "autopilot" && (
        <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-l border-[var(--anda-border)] bg-[var(--anda-surface)] p-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">{t("autopilot_routes")}</h3>
          {routes.length > 0 && (
            <Select value={String(routeIndex)} onChange={(e) => setRouteIndex(Number(e.target.value))} aria-label={t("autopilot_routes")}>
              {routes.map((r, i) => (
                <option key={r.id} value={i}>
                  {r.title}
                </option>
              ))}
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!canEdit}
            onClick={() => {
              patchRoutes((list) => [...list, { id: `ruta-${list.length + 1}`, title: t("route_n", { n: String(list.length + 1) }), steps: [], loop: true }]);
              setRouteIndex(routes.length);
            }}
          >
            <Plus className="h-4 w-4" /> {t("new_route")}
          </Button>

          {route != null && (
            <>
              <label className="block text-[13px]">
                <span className="mb-1 block font-medium">{t("route_title")}</span>
                <Input
                  value={route.title}
                  disabled={!canEdit}
                  onChange={(e) => patchRoutes((list) => list.map((r, i) => (i === routeIndex ? { ...r, title: e.target.value } : r)))}
                />
              </label>
              <p className="text-xs text-[var(--anda-text-dim)]">{t("autopilot_click_hint")}</p>
              <ol className="space-y-1">
                {route.steps.map((step, i) => (
                  <li
                    key={`${step.scene}-${i}`}
                    className="flex items-center gap-2 rounded-lg bg-[var(--anda-surface-2)] px-2 py-1.5 text-[13px]"
                    draggable={canEdit}
                    onDragStart={(e) => e.dataTransfer.setData("text/route-step", String(i))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = parseInt(e.dataTransfer.getData("text/route-step"), 10);
                      if (!Number.isFinite(from) || from === i) return;
                      patchRoutes((list) =>
                        list.map((r, ri) => {
                          if (ri !== routeIndex) return r;
                          const steps = [...r.steps];
                          const [moved] = steps.splice(from, 1);
                          steps.splice(i, 0, moved!);
                          return { ...r, steps };
                        }),
                      );
                    }}
                  >
                    <span className="flex h-5 w-5 cursor-grab items-center justify-center rounded-full bg-[var(--anda-primary)] text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{snapshot.scenes.find((sc) => sc.id === step.scene)?.title ?? step.scene}</span>
                    <Input
                      type="number"
                      className="max-w-16"
                      aria-label={t("seconds")}
                      value={step.seconds != null ? String(step.seconds) : ""}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patchRoutes((list) =>
                          list.map((r, ri) =>
                            ri === routeIndex
                              ? { ...r, steps: r.steps.map((st, si) => (si === i ? { ...st, seconds: e.target.value === "" ? undefined : Number(e.target.value) } : st)) }
                              : r,
                          ),
                        )
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      aria-label={t("delete")}
                      disabled={!canEdit}
                      onClick={() => patchRoutes((list) => list.map((r, ri) => (ri === routeIndex ? { ...r, steps: r.steps.filter((_, si) => si !== i) } : r)))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
              {route.steps.length === 0 && <p className="text-xs text-[var(--anda-text-dim)]">{t("route_empty")}</p>}
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={route.loop === true}
                  disabled={!canEdit}
                  className="h-4 w-4 accent-[var(--anda-primary)]"
                  onChange={(e) => patchRoutes((list) => list.map((r, i) => (i === routeIndex ? { ...r, loop: e.target.checked } : r)))}
                />
                {t("route_loop")}
              </label>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!canEdit}
                onClick={() => {
                  patchRoutes((list) => list.filter((_, i) => i !== routeIndex));
                  setRouteIndex(0);
                }}
              >
                <Trash2 className="h-4 w-4" /> {t("delete_route")}
              </Button>
            </>
          )}
        </aside>
      )}

      <MediaPicker
        open={planPicker != null}
        onClose={() => setPlanPicker(null)}
        kind="floorplan"
        onSelect={(item) => {
          const id = planPicker;
          if (id == null) return;
          editor.apply((draft) => patchArea(draft, id, { plan: { url: `media:${item.id}` } }));
          setPlanArea(id);
          fittedPlan.current = null;
          setMode("plan");
        }}
      />

      <Dialog
        open={calibrating?.b != null}
        onOpenChange={(o) => {
          if (!o) setCalibrating(null);
        }}
        title={t("calibrate_plan")}
        description={t("calibrate_dialog_hint")}
        footer={
          <>
            <Button variant="outline" onClick={() => setCalibrating(null)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => {
                const meters = parseFloat(calibrationMeters.replace(",", "."));
                const c = calibrating;
                if (c?.a == null || c.b == null || !Number.isFinite(meters) || meters <= 0) return;
                // La distancia se mide en anchos de plano, que es la unidad en
                // la que se guarda la calibración
                const normalized = Math.hypot(c.b.x - c.a.x, (c.b.y - c.a.y) * (planH / PLAN_W));
                if (normalized <= 0) return;
                const area = areas.find((a) => a.id === c.areaId);
                if (area?.plan != null) {
                  editor.apply((draft) => patchArea(draft, c.areaId, { plan: { ...area.plan!, widthMeters: Math.round((meters / normalized) * 100) / 100 } }));
                }
                setCalibrating(null);
                setCalibrationMeters("");
              }}
            >
              {t("save")}
            </Button>
          </>
        }
      >
        <label className="block text-[13px]">
          <span className="mb-1 block font-medium">{t("real_distance_meters")}</span>
          <Input autoFocus value={calibrationMeters} onChange={(e) => setCalibrationMeters(e.target.value)} inputMode="decimal" />
        </label>
      </Dialog>

      <Dialog
        open={confirmDelete != null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
        title={t("delete_scene")}
        description={t("delete_scene_warning", { n: String(confirmDelete?.length ?? 0) })}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => {
                const ids = confirmDelete ?? [];
                editor.apply((draft) => {
                  for (const id of ids) deleteScene(draft, id);
                });
                setSelectedNodes(new Set());
                setConfirmDelete(null);
              }}
            >
              {t("delete")}
            </Button>
          </>
        }
      >
        <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-[13px]">
          {(confirmDelete ?? []).map((id) => (
            <li key={id}>{snapshot.scenes.find((s) => s.id === id)?.title ?? id}</li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function MenuItem({ children, onClick, disabled, danger }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}): React.ReactNode {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-[var(--anda-surface-2)] disabled:opacity-50 ${
        danger === true ? "text-[var(--anda-danger,#dc2626)]" : ""
      }`}
    >
      {children}
    </button>
  );
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function mediaUrl(ref: string): string {
  const m = /^media:(.+)$/.exec(ref);
  return m != null ? `/api/v1/media/${m[1]}/file` : ref;
}

/** Curva de una arista, con separación para pares A↔B y muestreo para el clic. */
function edgePath(
  e: { id: string; from: string; to: string },
  positions: Record<string, NodePos>,
  all: { from: string; to: string }[],
  size: { w: number; h: number },
): { d: string; mid: { x: number; y: number }; sample: { x: number; y: number }[]; midAngle: number; endAngle: number } {
  const a = positions[e.from];
  const b = positions[e.to];
  if (a == null || b == null) return { d: "", mid: { x: 0, y: 0 }, sample: [], midAngle: 0, endAngle: 0 };
  const x0 = a.x + size.w;
  const y0 = a.y + size.h / 2;
  const x1 = b.x;
  const y1 = b.y + size.h / 2;
  // Si existe el paso inverso, las dos curvas se separan a lados **opuestos**.
  // Con el mismo desplazamiento en ambas quedaban una encima de la otra y sus
  // etiquetas, ilegibles.
  const hasReverse = all.some((o) => o.from === e.to && o.to === e.from);
  const offset = hasReverse ? (e.from < e.to ? size.h * 0.45 : -size.h * 0.45) : 0;
  const dx = Math.max(size.w * 0.3, Math.abs(x1 - x0) * 0.45);
  const c0x = x0 + dx;
  const c1x = x1 - dx;
  const d = `M ${x0} ${y0 + offset} C ${c0x} ${y0 + offset}, ${c1x} ${y1 + offset}, ${x1} ${y1 + offset}`;
  const sample: { x: number; y: number }[] = [];
  for (let i = 0; i <= 10; i++) {
    const t0 = i / 10;
    const mt = 1 - t0;
    sample.push({
      x: mt ** 3 * x0 + 3 * mt ** 2 * t0 * c0x + 3 * mt * t0 ** 2 * c1x + t0 ** 3 * x1,
      y: mt ** 3 * (y0 + offset) + 3 * mt ** 2 * t0 * (y0 + offset) + 3 * mt * t0 ** 2 * (y1 + offset) + t0 ** 3 * (y1 + offset),
    });
  }
  const angulo = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.atan2(b.y - a.y, b.x - a.x);
  return {
    d,
    mid: sample[5]!,
    sample,
    // Tangentes: en el centro para la flecha grande y al final para la punta
    midAngle: angulo(sample[4]!, sample[6]!),
    endAngle: angulo(sample[9]!, sample[10]!),
  };
}

/** Triángulo apuntando en `angle`, centrado en (x, y). */
function arrowPath(x: number, y: number, angle: number, size: number): string {
  const p = (dx: number, dy: number): string => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return `${x + dx * c - dy * s} ${y + dx * s + dy * c}`;
  };
  return `M ${p(size, 0)} L ${p(-size * 0.75, size * 0.62)} L ${p(-size * 0.4, 0)} L ${p(-size * 0.75, -size * 0.62)} Z`;
}

function Minimap({ positions, edges, frames, size, view, svgRef, onMove }: {
  positions: Record<string, NodePos>;
  edges: { from: string; to: string }[];
  frames: { area: Area; x0: number; y0: number; x1: number; y1: number }[];
  size: { w: number; h: number };
  view: View;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onMove: (ox: number, oy: number) => void;
}): React.ReactNode {
  const pts = Object.values(positions);
  if (pts.length === 0 || svgRef.current == null) return null;
  const minX = Math.min(...pts.map((p) => p.x), ...frames.map((f) => f.x0)) - 40;
  const minY = Math.min(...pts.map((p) => p.y), ...frames.map((f) => f.y0)) - 40;
  const maxX = Math.max(...pts.map((p) => p.x + size.w), ...frames.map((f) => f.x1)) + 40;
  const maxY = Math.max(...pts.map((p) => p.y + size.h), ...frames.map((f) => f.y1)) + 40;
  const W = 168;
  const H = 112;
  const scale = Math.min(W / (maxX - minX), H / (maxY - minY));
  const rect = svgRef.current.getBoundingClientRect();
  const vx = (-view.ox / view.scale - minX) * scale;
  const vy = (-view.oy / view.scale - minY) * scale;
  const vw = (rect.width / view.scale) * scale;
  const vh = (rect.height / view.scale) * scale;
  const moveTo = (e: React.PointerEvent): void => {
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const wx = (e.clientX - box.left) / scale + minX;
    const wy = (e.clientY - box.top) / scale + minY;
    onMove(rect.width / 2 - wx * view.scale, rect.height / 2 - wy * view.scale);
  };
  return (
    <svg
      width={W}
      height={H}
      className="absolute bottom-3 right-3 hidden cursor-pointer rounded-lg border border-[var(--anda-border)] bg-[var(--anda-surface)]/90 shadow-sm sm:block"
      aria-hidden="true"
      onPointerDown={(e) => {
        e.stopPropagation();
        moveTo(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) moveTo(e);
      }}
    >
      {frames.map((f) => (
        <rect
          key={f.area.id}
          x={(f.x0 - minX) * scale}
          y={(f.y0 - minY) * scale}
          width={(f.x1 - f.x0) * scale}
          height={(f.y1 - f.y0) * scale}
          rx={3}
          fill={f.area.color ?? "#7c3aed"}
          fillOpacity={0.12}
          stroke={f.area.color ?? "#7c3aed"}
          strokeOpacity={0.4}
        />
      ))}
      {edges.map((e, i) => {
        const a = positions[e.from];
        const b = positions[e.to];
        if (a == null || b == null) return null;
        return (
          <line
            key={i}
            x1={(a.x + size.w / 2 - minX) * scale}
            y1={(a.y + size.h / 2 - minY) * scale}
            x2={(b.x + size.w / 2 - minX) * scale}
            y2={(b.y + size.h / 2 - minY) * scale}
            stroke="var(--anda-text-dim)"
            strokeOpacity={0.4}
          />
        );
      })}
      {Object.entries(positions).map(([id, p]) => (
        <rect key={id} x={(p.x - minX) * scale} y={(p.y - minY) * scale} width={size.w * scale} height={size.h * scale} rx={2} fill="var(--anda-text-dim)" fillOpacity={0.6} />
      ))}
      <rect x={vx} y={vy} width={vw} height={vh} fill="none" stroke="var(--anda-primary)" strokeWidth={1.5} />
    </svg>
  );
}
