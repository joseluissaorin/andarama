import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, LayoutGrid, Map as MapIcon, Plus, Trash2, Undo2, Wand2 } from "lucide-react";
import { Button, Input, Select, Tooltip, useToast } from "@ull360/ui";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { readJson } from "./editorApi";
import {
  createNavHotspot,
  deleteEdge,
  reconnectEdge,
  graphEdges,
  graphIssues,
  readAutopilot,
  writeAutopilot,
  type AutopilotRouteDraft,
  type GraphIssue,
  type ReconnectResult,
} from "./graphModel";
import { hasMediaDrag, readMediaDrag, scenesFromMedia } from "../media/drag";
import { GraphHelp } from "./GraphHelp";
import { GraphIssues } from "./GraphIssues";

/**
 * Editor del grafo de escenas al estilo de un editor de nodos (Blender):
 * lienzo SVG con pan/zoom al cursor, nodos con miniatura y puertos,
 * conexiones arrastrando desde el puerto de salida con bezier fantasma,
 * selección múltiple (marquee + Shift), arrastre en grupo, teclado
 * (Supr borra conexiones, F encuadra, Esc deselecciona), doble clic para
 * abrir la escena, menú contextual, auto-orden por niveles y minimapa
 * interactivo. Los colores usan las variables del tema (claro y oscuro).
 */

interface NodePos {
  x: number;
  y: number;
}

const NODE_W = 168;
const NODE_H = 92;
const PORT_R = 6;

export function GraphView({ canEdit, onOpenScene }: {
  canEdit: boolean;
  onOpenScene?: (sceneId: string, hotspotId?: string) => void;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Record<string, NodePos>>({});
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const [view, setView] = useState({ ox: 60, oy: 60, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // El fantasma de la conexión se mueve en cada fotograma: se dibuja tocando
  // el DOM directamente en vez de repintar todo el SVG con React, que con
  // treinta nodos se notaba pastoso.
  const ghostPathRef = useRef<SVGPathElement>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const hoverNodeRef = useRef<string | null>(null);
  hoverNodeRef.current = hoverNode;
  const [menu, setMenu] = useState<{ x: number; y: number; sceneId: string } | null>(null);
  const dragRef = useRef<
    | { kind: "pan"; startX: number; startY: number; ox: number; oy: number }
    | { kind: "nodes"; startX: number; startY: number; orig: Record<string, NodePos>; moved: boolean }
    | { kind: "connect"; from: string }
    | { kind: "reconnect"; edgeId: string; end: "from" | "to"; anchor: string }
    | { kind: "marquee"; x0: number; y0: number }
    | null
  >(null);

  // Posiciones guardadas o rejilla inicial
  useEffect(() => {
    const saved = (snapshot.settings.graphLayout as Record<string, NodePos>) ?? {};
    const next: Record<string, NodePos> = {};
    snapshot.scenes.forEach((scene, i) => {
      next[scene.id] = positionsRef.current[scene.id] ?? saved[scene.id] ?? { x: (i % 5) * (NODE_W + 60), y: Math.floor(i / 5) * (NODE_H + 60) };
    });
    setPositions(next);
  }, [snapshot.scenes.length]);

  const persistLayout = useCallback((): void => {
    editor.apply((draft) => {
      draft.settings.graphLayout = { ...positionsRef.current };
    });
  }, [editor]);

  // Una arista es un hotspot de navegación: no hay datos de grafo aparte.
  const edges = useMemo(
    () => graphEdges(snapshot).filter((e) => positions[e.from] != null && positions[e.to] != null),
    [snapshot, positions],
  );

  // Modo del lienzo, al estilo del editor de nodos de Blender: se dibuja el
  // recorrido del visitante o el del autopilot, nunca los dos mezclados.
  const [mode, setMode] = useState<"scenes" | "autopilot">("scenes");
  const routes = useMemo(() => readAutopilot(snapshot.settings), [snapshot.settings]);
  const [routeIndex, setRouteIndex] = useState(0);
  const route: AutopilotRouteDraft | null = routes[routeIndex] ?? null;
  const [mediaOver, setMediaOver] = useState(false);
  // Crear el paso de vuelta al conectar: es lo habitual en un recorrido.
  const [bothWays, setBothWays] = useState(true);
  const [showPlan, setShowPlan] = useState(false);
  // Imán a la rejilla: se puede apagar para colocar a ojo
  const [snap, setSnap] = useState(true);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  /** Primer plano de planta del tour: se puede calcar bajo el grafo. */
  const floorplan = ((snapshot.settings.floorplans as { id: string; title: string; url: string }[] | undefined) ?? [])[0] ?? null;
  const floorplanUrl = ((): string | null => {
    if (floorplan == null) return null;
    const m = /^media:(.+)$/.exec(floorplan.url);
    return m != null ? `/api/v1/media/${m[1]}/file` : floorplan.url;
  })();

  // En modo autopilot el lienzo dibuja el recorrido, no los pasos del visitante
  const routeEdges = useMemo(() => {
    if (route == null) return [];
    const list: { id: string; from: string; to: string; unplaced: boolean; step: number }[] = [];
    for (let i = 0; i < route.steps.length - 1; i++) {
      const from = route.steps[i]!.scene;
      const to = route.steps[i + 1]!.scene;
      if (positions[from] == null || positions[to] == null) continue;
      list.push({ id: `ap-${i}`, from, to, unplaced: false, step: i + 1 });
    }
    return list;
  }, [route, positions]);
  const visibleEdges = mode === "scenes" ? edges : routeEdges;

  const patchRoutes = (fn: (list: AutopilotRouteDraft[]) => AutopilotRouteDraft[]): void => {
    editor.apply((draft) => {
      writeAutopilot(draft.settings, fn(readAutopilot(draft.settings)));
    });
  };

  // Escenas huérfanas (no alcanzables desde la inicial)
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

  /** Dibuja el hilo de conexión directamente en el SVG, sin repintar el árbol. */
  const drawGhost = useCallback((from: string, x: number, y: number, target?: string | null): void => {
    const path = ghostPathRef.current;
    const start = positionsRef.current[from];
    if (path == null || start == null) return;
    // Si hay un destino bajo el cursor, el hilo se pega a su puerto de entrada
    const end = target != null ? positionsRef.current[target] : null;
    const ex = end != null ? end.x : x;
    const ey = end != null ? end.y + NODE_H / 2 : y;
    const sx = start.x + NODE_W;
    const sy = start.y + NODE_H / 2;
    path.setAttribute("d", `M ${sx} ${sy} C ${sx + 60} ${sy}, ${ex - 60} ${ey}, ${ex} ${ey}`);
    path.style.display = "";
    path.setAttribute("stroke-dasharray", end != null ? "0" : "5 4");
  }, []);

  const hideGhost = useCallback((): void => {
    if (ghostPathRef.current != null) ghostPathRef.current.style.display = "none";
  }, []);

  const hitNode = useCallback((x: number, y: number): string | null => {
    for (const scene of [...snapshot.scenes].reverse()) {
      const p = positionsRef.current[scene.id];
      if (p != null && x >= p.x && x <= p.x + NODE_W && y >= p.y && y <= p.y + NODE_H) return scene.id;
    }
    return null;
  }, [snapshot.scenes]);

  const fitView = useCallback((): void => {
    const pts = Object.values(positionsRef.current);
    if (pts.length === 0 || svgRef.current == null) return;
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x + NODE_W));
    const maxY = Math.max(...pts.map((p) => p.y + NODE_H));
    const rect = svgRef.current.getBoundingClientRect();
    const scale = Math.min(2, Math.max(0.2, Math.min((rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY))));
    setView({
      scale,
      ox: (rect.width - (maxX - minX) * scale) / 2 - minX * scale,
      oy: (rect.height - (maxY - minY) * scale) / 2 - minY * scale,
    });
  }, []);

  // Auto-orden por niveles (BFS desde la escena de inicio)
  const autoLayout = useCallback((): void => {
    const start = (snapshot.settings.startScene as string) ?? snapshot.scenes[0]?.id;
    const depth = new Map<string, number>();
    if (start != null) {
      const adj = new Map<string, string[]>();
      for (const e of edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
      depth.set(start, 0);
      const queue = [start];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const nxt of adj.get(cur) ?? []) {
          if (!depth.has(nxt)) {
            depth.set(nxt, depth.get(cur)! + 1);
            queue.push(nxt);
          }
        }
      }
    }
    let orphanRow = 0;
    const rows = new Map<number, number>();
    const next: Record<string, NodePos> = {};
    for (const scene of snapshot.scenes) {
      const d = depth.get(scene.id);
      if (d == null) {
        next[scene.id] = { x: -1 * (NODE_W + 80), y: orphanRow++ * (NODE_H + 40) };
      } else {
        const row = rows.get(d) ?? 0;
        rows.set(d, row + 1);
        next[scene.id] = { x: d * (NODE_W + 90), y: row * (NODE_H + 48) };
      }
    }
    setPositions(next);
    positionsRef.current = next;
    if (canEdit) persistLayout();
    requestAnimationFrame(fitView);
  }, [snapshot.scenes, snapshot.settings.startScene, edges, canEdit, persistLayout, fitView]);

  // Teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (e.key === "f" || e.key === "F") {
        fitView();
      } else if (e.key === "g" || e.key === "G") {
        setSnap((v) => !v);
      } else if (e.key === "l" || e.key === "L") {
        if (canEdit) autoLayout();
      } else if (e.key === "p" || e.key === "P") {
        setShowPlan((v) => !v);
      } else if ((e.key === "a" || e.key === "A") && !e.metaKey && !e.ctrlKey) {
        setSelectedNodes(new Set(snapshot.scenes.map((sc) => sc.id)));
      } else if (e.key === "Escape") {
        if (dragRef.current?.kind === "connect" || dragRef.current?.kind === "reconnect") {
          dragRef.current = null;
          setConnecting(null);
          setHoverNode(null);
          hideGhost();
          return;
        }
        setSelectedNodes(new Set());
        setSelectedEdge(null);
        setMenu(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit && selectedEdge != null) {
        // Borrar la arista es borrar su hotspot: son la misma cosa.
        editor.apply((draft) => deleteEdge(draft, selectedEdge));
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitView, canEdit, selectedEdge, editor, hideGhost, autoLayout, snapshot.scenes]);

  // Rueda: zoom anclado al cursor
  const onWheel = (e: React.WheelEvent): void => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const scale = Math.min(2.5, Math.max(0.15, v.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      const k = scale / v.scale;
      return { scale, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
    });
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (menu != null) setMenu(null);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toWorld(e.clientX, e.clientY);
    // Botón central o derecho, o Espacio: pan
    if (e.button === 1 || e.button === 2) {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, ox: view.ox, oy: view.oy };
      return;
    }
    const nodeId = hitNode(x, y);
    if (nodeId != null) {
      const p = positionsRef.current[nodeId]!;
      // ¿Puerto de salida? (círculo derecho)
      // Zona de conexión generosa: el puerto y todo el borde derecho. Apuntar
      // a un círculo de trece píxeles era pelearse con la interfaz.
      const onPort = Math.hypot(x - (p.x + NODE_W), y - (p.y + NODE_H / 2)) < PORT_R * 3.2;
      const onRightEdge = x > p.x + NODE_W - 14 && y > p.y + 8 && y < p.y + NODE_H - 8;
      if (canEdit && (onPort || onRightEdge)) {
        dragRef.current = { kind: "connect", from: nodeId };
        setConnecting(nodeId);
        drawGhost(nodeId, x, y);
        return;
      }
      const next = new Set(e.shiftKey ? selectedNodes : selectedNodes.has(nodeId) ? selectedNodes : []);
      next.add(nodeId);
      setSelectedNodes(next);
      setSelectedEdge(null);
      const orig: Record<string, NodePos> = {};
      for (const id of next) orig[id] = { ...positionsRef.current[id]! };
      dragRef.current = { kind: "nodes", startX: x, startY: y, orig, moved: false };
      return;
    }
    // Arista bajo el cursor
    const edge = hitEdge(x, y);
    if (edge != null) {
      setSelectedEdge(edge);
      setSelectedNodes(new Set());
      return;
    }
    // Lienzo vacío: marquee (o pan con Alt)
    if (e.altKey) {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, ox: view.ox, oy: view.oy };
    } else {
      dragRef.current = { kind: "marquee", x0: x, y0: y };
      setMarquee({ x0: x, y0: y, x1: x, y1: y });
      setSelectedEdge(null);
    }
  };

  const hitEdge = (x: number, y: number): string | null => {
    if (mode !== "scenes") return null;
    for (const e of edges) {
      const pts = edgePath(e, positionsRef.current, edges).sample;
      for (const p of pts) {
        if (Math.hypot(p.x - x, p.y - y) < 10) return e.id;
      }
    }
    return null;
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const st = dragRef.current;
    if (st == null) return;
    if (st.kind === "pan") {
      setView((v) => ({ ...v, ox: st.ox + (e.clientX - st.startX), oy: st.oy + (e.clientY - st.startY) }));
      return;
    }
    const { x, y } = toWorld(e.clientX, e.clientY);
    if (st.kind === "nodes") {
      const dx = x - st.startX;
      const dy = y - st.startY;
      if (!st.moved && Math.hypot(dx, dy) < 3) return;
      st.moved = true;
      setPositions((prev) => {
        const next = { ...prev };
        for (const [id, o] of Object.entries(st.orig)) {
          // Imán suave a rejilla de 10 px, desactivable con G
          const gx = o.x + dx;
          const gy = o.y + dy;
          next[id] = snapRef.current ? { x: Math.round(gx / 10) * 10, y: Math.round(gy / 10) * 10 } : { x: gx, y: gy };
        }
        return next;
      });
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
    }
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    const st = dragRef.current;
    dragRef.current = null;
    if (st == null) return;
    if (st.kind === "connect") {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const target = hitNode(x, y);
      setConnecting(null);
      setHoverNode(null);
      hideGhost();
      if (target != null && target !== st.from && canEdit) {
        let created: string | null = null;
        editor.apply((draft) => {
          created = createNavHotspot(draft, st.from, target);
          // La vuelta es lo que casi siempre se quiere, y además es lo que
          // hace funcionar el modo de entrada «mirar atrás».
          if (created != null && bothWays) createNavHotspot(draft, target, st.from, { entryMode: "lookBack" });
        });
        if (created != null) setSelectedEdge(created);
      }
    } else if (st.kind === "reconnect") {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const target = hitNode(x, y);
      setConnecting(null);
      setHoverNode(null);
      hideGhost();
      // Soltar en el vacío no borra nada: para eso está el aspa
      if (target != null && target !== st.anchor && canEdit) {
        // TypeScript no ve la asignación dentro del callback: se recoge fuera
        const outcome: { result: ReconnectResult } = { result: "missing" };
        editor.apply((draft) => {
          outcome.result = reconnectEdge(draft, st.edgeId, st.end === "to" ? { to: target } : { from: target });
        });
        const result = outcome.result;
        if (result === "duplicate") toast.push(t("reconnect_duplicate"), "error");
        else if (result === "same") toast.push(t("reconnect_same"), "error");
        else if (result === "ok" && st.end === "from") toast.push(t("reconnect_moved"), "ok");
      }
    } else if (st.kind === "nodes") {
      if (st.moved && canEdit) persistLayout();
      else if (!st.moved && mode === "autopilot" && canEdit && route != null) {
        const clicked = [...selectedNodes][0];
        if (clicked != null) {
          patchRoutes((list) =>
            list.map((r, i) => (i === routeIndex ? { ...r, steps: [...r.steps, { scene: clicked, seconds: 6 }] } : r)),
          );
        }
      }
    } else if (st.kind === "marquee" && marquee != null) {
      const x0 = Math.min(marquee.x0, marquee.x1);
      const x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1);
      const y1 = Math.max(marquee.y0, marquee.y1);
      const inside = snapshot.scenes.filter((s) => {
        const p = positionsRef.current[s.id];
        return p != null && p.x + NODE_W > x0 && p.x < x1 && p.y + NODE_H > y0 && p.y < y1;
      });
      setSelectedNodes(new Set(inside.map((s) => s.id)));
      setMarquee(null);
    }
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

  const selectedHotspot = selectedEdge != null ? (snapshot.hotspots.find((h) => h.id === selectedEdge) ?? null) : null;
  const selectedContent = readJson<{ target?: string; label?: string; unplaced?: boolean; entry?: { mode?: string }; transition?: { kind?: string } }>(
    selectedHotspot?.contentJson ?? null,
    {},
  );
  const issues = useMemo(() => graphIssues(snapshot, edges, orphans), [snapshot, edges, orphans]);

  /** Centrar la vista sobre lo que señala un aviso y seleccionarlo. */
  const focusIssue = useCallback(
    (issue: GraphIssue): void => {
      const pos = positionsRef.current[issue.sceneId];
      if (pos != null && svgRef.current != null) {
        const rect = svgRef.current.getBoundingClientRect();
        const scale = Math.max(0.6, viewRef.current.scale);
        setView({
          scale,
          ox: rect.width / 2 - (pos.x + NODE_W / 2) * scale,
          oy: rect.height / 2 - (pos.y + NODE_H / 2) * scale,
        });
      }
      if (issue.hotspotId != null) {
        setSelectedEdge(issue.hotspotId);
        setSelectedNodes(new Set());
      } else {
        setSelectedNodes(new Set([issue.sceneId]));
        setSelectedEdge(null);
      }
    },
    [],
  );

  /** Arreglo automático del aviso, cuando existe uno sensato. */
  const issueAction = useCallback(
    (issue: GraphIssue): { label: string; run: () => void } | null => {
      if (!canEdit) return null;
      if (issue.kind === "no-return") {
        const edge = edges.find((e) => e.id === issue.hotspotId);
        if (edge == null) return null;
        return {
          label: t("add_return"),
          run: () => editor.apply((draft) => createNavHotspot(draft, edge.to, edge.from, { entryMode: "lookBack" })),
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
      if (issue.kind === "unplaced") {
        return {
          label: t("place_in_panorama"),
          run: () => onOpenScene?.(issue.sceneId, issue.hotspotId),
        };
      }
      if (issue.kind === "orphan") {
        return { label: t("open_scene"), run: () => onOpenScene?.(issue.sceneId) };
      }
      return null;
    },
    [canEdit, edges, editor, onOpenScene, t],
  );

  /** Editar la arista es editar su hotspot. */
  const patchEdgeContent = (patch: Record<string, unknown>): void => {
    if (selectedHotspot == null) return;
    editor.apply((draft) => {
      const target = draft.hotspots.find((h) => h.id === selectedHotspot.id);
      if (target == null) return;
      const content = readJson<Record<string, unknown>>(target.contentJson, {});
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete content[k];
        else content[k] = v;
      }
      target.contentJson = JSON.stringify(content);
    });
  };

  const startScene = (snapshot.settings.startScene as string) ?? snapshot.scenes[0]?.id;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra de herramientas del grafo */}
        <div className="flex items-center gap-2 border-b border-[var(--ull-border)] bg-[var(--ull-surface)] px-3 py-1.5">
          {/* Qué se está dibujando: los pasos del visitante o un recorrido guiado */}
          <div className="flex rounded-lg bg-[var(--ull-surface-2)] p-0.5">
            {(["scenes", "autopilot"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setSelectedEdge(null);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === m ? "bg-[var(--ull-surface)] text-[var(--ull-text)] shadow-sm" : "text-[var(--ull-text-dim)]"
                }`}
              >
                {m === "scenes" ? t("graph_mode_scenes") : t("graph_mode_autopilot")}
              </button>
            ))}
          </div>
          <span className="hidden text-[13px] text-[var(--ull-text-dim)] lg:inline">
            {mode === "scenes" ? t("graph_help_short") : t("graph_help_autopilot")}
          </span>
          <div className="flex-1" />
          {mode === "scenes" && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--ull-text-dim)]">
              <input type="checkbox" checked={bothWays} onChange={(e) => setBothWays(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--ull-primary)]" />
              {t("create_return")}
            </label>
          )}
          <GraphIssues issues={issues} onFocus={focusIssue} actionFor={issueAction} />
          {floorplan != null && (
            <Tooltip content={t("toggle_floorplan")}>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("toggle_floorplan")}
                aria-pressed={showPlan}
                onClick={() => setShowPlan((v) => !v)}
              >
                <MapIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
          <GraphHelp mode={mode} />
          <Tooltip content={`${t("fit_view")} (F)`}>
            <Button size="sm" variant="ghost" aria-label={t("fit_view")} onClick={fitView}>
              <Expand className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content={t("auto_layout")}>
            <Button size="sm" variant="ghost" aria-label={t("auto_layout")} onClick={autoLayout} disabled={!canEdit}>
              <Wand2 className="h-4 w-4" />
            </Button>
          </Tooltip>
          <span className="w-12 text-right text-xs tabular-nums text-[var(--ull-text-dim)]">{Math.round(view.scale * 100)}%</span>

        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {connecting != null && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-[var(--ull-primary)] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              {hoverNode != null
                ? t("connect_release_on", { name: snapshot.scenes.find((sc) => sc.id === hoverNode)?.title ?? "" })
                : t("connect_drag_hint")}
            </div>
          )}
          <svg
            ref={svgRef}
            className={`h-full w-full touch-none select-none bg-[var(--ull-bg)] ${mediaOver ? "outline outline-2 -outline-offset-2 outline-[var(--ull-primary)]" : ""}`}
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
              // Los nodos nacen donde se han soltado, en fila
              const at = toWorld(e.clientX, e.clientY);
              let ids: string[] = [];
              editor.apply((draft) => {
                ids = scenesFromMedia(draft, draft.scenes[0]?.projectId ?? "", items);
              });
              setPositions((prev) => {
                const next = { ...prev };
                ids.forEach((id, i) => {
                  next[id] = { x: Math.round((at.x + (i % 4) * (NODE_W + 40)) / 10) * 10, y: Math.round((at.y + Math.floor(i / 4) * (NODE_H + 40)) / 10) * 10 };
                });
                positionsRef.current = next;
                return next;
              });
              persistLayout();
            }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
          >
            {/* Rejilla de puntos */}
            <defs>
              <pattern id="graph-dots" width={24 * view.scale} height={24 * view.scale} patternUnits="userSpaceOnUse" x={view.ox % (24 * view.scale)} y={view.oy % (24 * view.scale)}>
                <circle cx="1" cy="1" r="1" fill="var(--ull-border)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#graph-dots)" />

            {/* Plano de planta calcado debajo: colocar el grafo sobre la
                planta real hace evidente qué falta conectar */}
            {showPlan && floorplanUrl != null && (
              <g transform={`translate(${view.ox} ${view.oy}) scale(${view.scale})`} style={{ pointerEvents: "none" }}>
                <image href={floorplanUrl} x={-40} y={-40} width={1200} height={900} opacity={0.28} preserveAspectRatio="xMidYMid meet" />
              </g>
            )}

            <g transform={`translate(${view.ox} ${view.oy}) scale(${view.scale})`}>
              {/* Aristas */}
              {visibleEdges.map((e) => {
                const { d, mid } = edgePath(e, positions, visibleEdges);
                const selected = selectedEdge === e.id;
                const step = (e as { step?: number }).step;
                const color = mode === "autopilot" ? "var(--ull-accent)" : selected ? "var(--ull-primary)" : "var(--ull-text-dim)";
                return (
                  <g key={e.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeOpacity={selected || mode === "autopilot" ? 1 : 0.55}
                      strokeWidth={selected ? 2.5 : 1.8}
                      strokeDasharray={e.unplaced ? "6 4" : undefined}
                    />
                    {/* Zona ancha invisible: acertar en una curva de 2 px es
                        imposible, y desenlazar tiene que ser fácil */}
                    <path d={d} fill="none" stroke="transparent" strokeWidth={16} style={{ cursor: "pointer" }} />
                    {step != null ? (
                      <>
                        <circle cx={mid.x} cy={mid.y} r={9} fill="var(--ull-accent)" />
                        <text x={mid.x} y={mid.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                          {step}
                        </text>
                      </>
                    ) : (
                      <circle cx={mid.x} cy={mid.y} r={selected ? 4 : 3} fill={color} fillOpacity={selected ? 1 : 0.6} />
                    )}
                    {/* Desenlazar: visible en la arista seleccionada, sin
                        tener que adivinar que existe la tecla Supr */}
                    {selected && mode === "scenes" && canEdit && (
                      <g
                        style={{ cursor: "pointer" }}
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          editor.apply((draft) => deleteEdge(draft, e.id));
                          setSelectedEdge(null);
                        }}
                      >
                        <title>{t("unlink_scenes")}</title>
                        <circle cx={mid.x} cy={mid.y - 18} r={10} fill="var(--ull-danger, #dc2626)" />
                        <path
                          d={`M ${mid.x - 4} ${mid.y - 22} L ${mid.x + 4} ${mid.y - 14} M ${mid.x + 4} ${mid.y - 22} L ${mid.x - 4} ${mid.y - 14}`}
                          stroke="#fff"
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Bezier fantasma al conectar: se dibuja sin pasar por React */}
              <path
                ref={ghostPathRef}
                fill="none"
                stroke="var(--ull-primary)"
                strokeWidth={2.5}
                strokeDasharray="5 4"
                strokeLinecap="round"
                style={{ display: "none", pointerEvents: "none" }}
              />

              {/* Nodos */}
              {snapshot.scenes.map((scene) => {
                const isDropTarget = hoverNode === scene.id;
                const p = positions[scene.id];
                if (p == null) return null;
                const selected = selectedNodes.has(scene.id);
                const isStart = startScene === scene.id;
                const orphan = orphans.has(scene.id);
                return (
                  <g
                    key={scene.id}
                    transform={`translate(${p.x} ${p.y})`}
                    style={{ cursor: connecting != null ? "crosshair" : "grab" }}
                  >
                    {/* Halo del destino candidato mientras se arrastra el hilo */}
                    {isDropTarget && (
                      <rect
                        x={-5}
                        y={-5}
                        width={NODE_W + 10}
                        height={NODE_H + 10}
                        rx={16}
                        fill="var(--ull-primary)"
                        fillOpacity={0.14}
                        stroke="var(--ull-primary)"
                        strokeWidth={2}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={12}
                      fill="var(--ull-surface)"
                      stroke={isDropTarget || selected ? "var(--ull-primary)" : orphan ? "#d97706" : "var(--ull-border)"}
                      strokeWidth={isDropTarget || selected ? 2.5 : 1.5}
                    />
                    {scene.mediaId != null && (
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
                    <text x={10} y={NODE_H - 22} fontSize={12} fontWeight={600} fill="var(--ull-text)" style={{ pointerEvents: "none" }}>
                      {scene.title.length > 20 ? `${scene.title.slice(0, 19)}…` : scene.title}
                    </text>
                    <text x={10} y={NODE_H - 8} fontSize={10} fill="var(--ull-text-dim)" style={{ pointerEvents: "none" }}>
                      {isStart ? `★ ${t("start_scene_badge")}` : `${edges.filter((e) => e.from === scene.id).length} →`}
                    </text>
                    {/* Puertos */}
                    <circle cx={0} cy={NODE_H / 2} r={PORT_R} fill="var(--ull-surface)" stroke="var(--ull-text-dim)" strokeWidth={1.5} />
                    {/* Zona de agarre generosa e invisible sobre el puerto */}
                    {canEdit && (
                      <rect
                        x={NODE_W - 14}
                        y={8}
                        width={26}
                        height={NODE_H - 16}
                        fill="transparent"
                        style={{ cursor: "crosshair" }}
                      />
                    )}
                    <circle
                      cx={NODE_W}
                      cy={NODE_H / 2}
                      r={connecting === scene.id ? PORT_R + 3 : PORT_R}
                      fill={canEdit ? "var(--ull-primary)" : "var(--ull-surface)"}
                      stroke="var(--ull-primary)"
                      strokeWidth={connecting === scene.id ? 3 : 1.5}
                      style={{ cursor: canEdit ? "crosshair" : "default", pointerEvents: "none" }}
                    />
                  </g>
                );
              })}

              {/* Extremos agarrables de la arista seleccionada. Van en su
                  propia capa, después de los nodos: dibujados con las aristas
                  quedaban debajo del nodo y no se podían agarrar. */}
              {mode === "scenes" && canEdit && selectedHotspot != null && (() => {
                const edge = edges.find((e) => e.id === selectedHotspot.id);
                if (edge == null) return null;
                const from = positions[edge.from];
                const to = positions[edge.to];
                if (from == null || to == null) return null;
                const handles = [
                  { end: "from" as const, x: from.x + NODE_W + 12, y: from.y + NODE_H / 2, anchor: edge.to, hint: t("reconnect_source") },
                  { end: "to" as const, x: to.x - 12, y: to.y + NODE_H / 2, anchor: edge.from, hint: t("reconnect_target") },
                ];
                return (
                  <g>
                    {handles.map((h) => (
                      <g key={h.end} style={{ cursor: "grab" }}
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          const { x, y } = toWorld(ev.clientX, ev.clientY);
                          dragRef.current = { kind: "reconnect", edgeId: edge.id, end: h.end, anchor: h.anchor };
                          setConnecting(h.anchor);
                          drawGhost(h.anchor, x, y);
                        }}
                      >
                        <title>{h.hint}</title>
                        <circle cx={h.x} cy={h.y} r={11} fill="var(--ull-primary)" fillOpacity={0.15} />
                        <circle cx={h.x} cy={h.y} r={6.5} fill="var(--ull-surface)" stroke="var(--ull-primary)" strokeWidth={3} />
                      </g>
                    ))}
                  </g>
                );
              })()}

              {/* Marquee */}
              {marquee != null && (
                <rect
                  x={Math.min(marquee.x0, marquee.x1)}
                  y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)}
                  height={Math.abs(marquee.y1 - marquee.y0)}
                  fill="var(--ull-primary)"
                  fillOpacity={0.08}
                  stroke="var(--ull-primary)"
                  strokeDasharray="4 3"
                />
              )}
            </g>
          </svg>

          {/* Menú contextual */}
          {menu != null && (
            <div
              className="absolute z-20 w-48 rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-1 text-[13px] shadow-[var(--ull-shadow-lg)]"
              style={{ left: menu.x, top: menu.y }}
            >
              <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-[var(--ull-surface-2)]" onClick={() => { onOpenScene?.(menu.sceneId); setMenu(null); }}>
                {t("open_scene")}
              </button>
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-[var(--ull-surface-2)] disabled:opacity-50"
                disabled={!canEdit}
                onClick={() => {
                  editor.apply((draft) => {
                    draft.settings.startScene = menu.sceneId;
                  });
                  setMenu(null);
                }}
              >
                {t("set_as_start")}
              </button>
            </div>
          )}

          {/* Minimapa interactivo */}
          <Minimap positions={positions} view={view} svgRef={svgRef} onMove={(ox, oy) => setView((v) => ({ ...v, ox, oy }))} />
        </div>
      </div>

      {/* Inspector lateral (nunca tapa el lienzo) */}
      {mode === "scenes" && selectedHotspot != null && (
        <aside className="w-72 space-y-4 overflow-y-auto border-l border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("nav_hotspot_edge")}</h3>
          <p className="text-[13px]">
            {snapshot.scenes.find((sc) => sc.id === selectedHotspot.sceneId)?.title} →{" "}
            {snapshot.scenes.find((sc) => sc.id === selectedContent.target)?.title ?? "—"}
          </p>
          {selectedContent.unplaced === true && (
            <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-600">{t("unplaced_hint")}</p>
          )}

          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">{t("label")}</span>
            <Input
              value={selectedContent.label ?? ""}
              disabled={!canEdit}
              onChange={(e) => patchEdgeContent({ label: e.target.value })}
            />
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

          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">{t("entry_mode")}</span>
            <Select
              value={selectedContent.entry?.mode ?? "relative"}
              disabled={!canEdit}
              onChange={(e) => patchEdgeContent({ entry: { ...(selectedContent.entry ?? {}), mode: e.target.value } })}
            >
              <option value="fixed">{t("entry_fixed")}</option>
              <option value="relative">{t("entry_relative")}</option>
              <option value="lookBack">{t("entry_lookback")}</option>
            </Select>
          </label>

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
                  editor.apply((draft) => {
                    createNavHotspot(draft, target, selectedHotspot.sceneId, { entryMode: "lookBack" });
                  });
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
                setSelectedEdge(null);
              }}
            >
              <Trash2 className="h-4 w-4" /> {t("delete")}
            </Button>
          </div>
          <p className="text-xs text-[var(--ull-text-dim)]">{t("delete_edge_hint")}</p>
        </aside>
      )}

      {/* Recorridos del autopilot: el otro «material» que se dibuja aquí */}
      {mode === "autopilot" && (
        <aside className="w-72 space-y-4 overflow-y-auto border-l border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("autopilot_routes")}</h3>
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
              <p className="text-xs text-[var(--ull-text-dim)]">{t("autopilot_click_hint")}</p>
              <ol className="space-y-1">
                {route.steps.map((step, i) => (
                  <li key={`${step.scene}-${i}`} className="flex items-center gap-2 rounded-lg bg-[var(--ull-surface-2)] px-2 py-1.5 text-[13px]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ull-primary)] text-[11px] font-semibold text-white">
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
                      onClick={() =>
                        patchRoutes((list) => list.map((r, ri) => (ri === routeIndex ? { ...r, steps: r.steps.filter((_, si) => si !== i) } : r)))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
              {route.steps.length === 0 && <p className="text-xs text-[var(--ull-text-dim)]">{t("route_empty")}</p>}
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={route.loop === true}
                  disabled={!canEdit}
                  className="h-4 w-4 accent-[var(--ull-primary)]"
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
    </div>
  );
}

/** Curva de una arista, con separación para pares A↔B y puntos de muestreo para el hit-test. */
function edgePath(
  e: { id: string; from: string; to: string },
  positions: Record<string, NodePos>,
  all: { from: string; to: string }[],
): { d: string; mid: { x: number; y: number }; sample: { x: number; y: number }[] } {
  const a = positions[e.from]!;
  const b = positions[e.to]!;
  const x0 = a.x + NODE_W;
  const y0 = a.y + NODE_H / 2;
  const x1 = b.x;
  const y1 = b.y + NODE_H / 2;
  // Si existe la arista inversa, separar las curvas para que no se solapen
  const hasReverse = all.some((o) => o.from === e.to && o.to === e.from);
  const offset = hasReverse ? 14 : 0;
  const dx = Math.max(50, Math.abs(x1 - x0) * 0.45);
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
  return { d, mid: sample[5]!, sample };
}

function Minimap({ positions, view, svgRef, onMove }: {
  positions: Record<string, NodePos>;
  view: { ox: number; oy: number; scale: number };
  svgRef: React.RefObject<SVGSVGElement | null>;
  onMove: (ox: number, oy: number) => void;
}): React.ReactNode {
  const pts = Object.values(positions);
  if (pts.length === 0 || svgRef.current == null) return null;
  const minX = Math.min(...pts.map((p) => p.x)) - 40;
  const minY = Math.min(...pts.map((p) => p.y)) - 40;
  const maxX = Math.max(...pts.map((p) => p.x + NODE_W)) + 40;
  const maxY = Math.max(...pts.map((p) => p.y + NODE_H)) + 40;
  const W = 168;
  const H = 112;
  const k = Math.min(W / (maxX - minX), H / (maxY - minY));
  const rect = svgRef.current.getBoundingClientRect();
  // Viewport actual en coordenadas de mundo
  const vx = (-view.ox / view.scale - minX) * k;
  const vy = (-view.oy / view.scale - minY) * k;
  const vw = (rect.width / view.scale) * k;
  const vh = (rect.height / view.scale) * k;
  const moveTo = (e: React.PointerEvent): void => {
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const wx = (e.clientX - box.left) / k + minX;
    const wy = (e.clientY - box.top) / k + minY;
    onMove(rect.width / 2 - wx * view.scale, rect.height / 2 - wy * view.scale);
  };
  return (
    <svg
      width={W}
      height={H}
      className="absolute bottom-3 right-3 cursor-pointer rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)]/90 shadow-sm"
      aria-hidden="true"
      onPointerDown={(e) => {
        e.stopPropagation();
        moveTo(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) moveTo(e);
      }}
    >
      {Object.entries(positions).map(([id, p]) => (
        <rect key={id} x={(p.x - minX) * k} y={(p.y - minY) * k} width={NODE_W * k} height={NODE_H * k} rx={2} fill="var(--ull-text-dim)" fillOpacity={0.5} />
      ))}
      <rect x={vx} y={vy} width={vw} height={vh} fill="none" stroke="var(--ull-primary)" strokeWidth={1.5} />
    </svg>
  );
}
