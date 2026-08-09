import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, LayoutGrid, Trash2, Wand2 } from "lucide-react";
import { Button, Select, Tooltip } from "@ull360/ui";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { clientId, readJson } from "./editorApi";

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
  const [ghost, setGhost] = useState<{ from: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; sceneId: string } | null>(null);
  const dragRef = useRef<
    | { kind: "pan"; startX: number; startY: number; ox: number; oy: number }
    | { kind: "nodes"; startX: number; startY: number; orig: Record<string, NodePos>; moved: boolean }
    | { kind: "connect"; from: string }
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

  // Aristas: conexiones explícitas + derivadas de hotspots de navegación
  const edges = useMemo(() => {
    const explicit = snapshot.connections.map((c) => ({ id: c.id, from: c.fromScene, to: c.toScene, explicit: true, entryMode: c.entryMode, hotspotId: null as string | null, sceneId: null as string | null }));
    const derived: typeof explicit = [];
    for (const h of snapshot.hotspots) {
      if (h.type !== "navigation") continue;
      const content = readJson<{ target?: string }>(h.contentJson, {});
      if (content.target != null && content.target !== "") {
        derived.push({ id: `hs-${h.id}`, from: h.sceneId, to: content.target, explicit: false, entryMode: "", hotspotId: h.id, sceneId: h.sceneId });
      }
    }
    return [...explicit, ...derived].filter((e) => positions[e.from] != null && positions[e.to] != null);
  }, [snapshot.connections, snapshot.hotspots, positions]);

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
      } else if (e.key === "Escape") {
        setSelectedNodes(new Set());
        setSelectedEdge(null);
        setMenu(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit && selectedEdge != null && !selectedEdge.startsWith("hs-")) {
        editor.apply((draft) => {
          draft.connections = draft.connections.filter((c) => c.id !== selectedEdge);
        });
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitView, canEdit, selectedEdge, editor]);

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
      if (canEdit && Math.hypot(x - (p.x + NODE_W), y - (p.y + NODE_H / 2)) < PORT_R * 2.2) {
        dragRef.current = { kind: "connect", from: nodeId };
        setGhost({ from: nodeId, x, y });
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
          // Snap suave a rejilla de 10 px
          next[id] = { x: Math.round((o.x + dx) / 10) * 10, y: Math.round((o.y + dy) / 10) * 10 };
        }
        return next;
      });
    } else if (st.kind === "connect") {
      setGhost({ from: st.from, x, y });
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
      setGhost(null);
      if (target != null && target !== st.from && canEdit) {
        const dup = snapshot.connections.some((c) => c.fromScene === st.from && c.toScene === target);
        if (!dup) {
          const id = clientId();
          editor.apply((draft) => {
            draft.connections.push({
              id,
              projectId: draft.scenes[0]?.projectId ?? "",
              fromScene: st.from,
              toScene: target,
              entryMode: "relative",
              entryViewJson: null,
              transitionJson: null,
            });
          });
          setSelectedEdge(id);
        }
      }
    } else if (st.kind === "nodes") {
      if (st.moved && canEdit) persistLayout();
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

  const selectedConn = snapshot.connections.find((c) => c.id === selectedEdge) ?? null;
  const selectedDerived = selectedEdge?.startsWith("hs-") === true
    ? snapshot.hotspots.find((h) => `hs-${h.id}` === selectedEdge) ?? null
    : null;

  const startScene = (snapshot.settings.startScene as string) ?? snapshot.scenes[0]?.id;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra de herramientas del grafo */}
        <div className="flex items-center gap-2 border-b border-[var(--ull-border)] bg-[var(--ull-surface)] px-3 py-1.5">
          <span className="text-[13px] text-[var(--ull-text-dim)]">{t("graph_help")}</span>
          <div className="flex-1" />
          {orphans.size > 0 ? (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600">
              {t("orphan_scenes", { count: String(orphans.size) })}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-600">{t("all_reachable")}</span>
          )}
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
          <svg
            ref={svgRef}
            className="h-full w-full touch-none select-none bg-[var(--ull-bg)]"
            role="application"
            aria-label={t("graph")}
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

            <g transform={`translate(${view.ox} ${view.oy}) scale(${view.scale})`}>
              {/* Aristas */}
              {edges.map((e) => {
                const { d, mid } = edgePath(e, positions, edges);
                const selected = selectedEdge === e.id;
                return (
                  <g key={e.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={selected ? "var(--ull-primary)" : "var(--ull-text-dim)"}
                      strokeOpacity={selected ? 1 : 0.55}
                      strokeWidth={selected ? 2.5 : 1.8}
                      strokeDasharray={e.explicit ? undefined : "6 4"}
                    />
                    {/* Punta de flecha */}
                    <circle cx={mid.x} cy={mid.y} r={selected ? 4 : 3} fill={selected ? "var(--ull-primary)" : "var(--ull-text-dim)"} fillOpacity={selected ? 1 : 0.6} />
                  </g>
                );
              })}

              {/* Bezier fantasma al conectar */}
              {ghost != null && positions[ghost.from] != null && (
                <path
                  d={`M ${positions[ghost.from]!.x + NODE_W} ${positions[ghost.from]!.y + NODE_H / 2} C ${positions[ghost.from]!.x + NODE_W + 60} ${positions[ghost.from]!.y + NODE_H / 2}, ${ghost.x - 60} ${ghost.y}, ${ghost.x} ${ghost.y}`}
                  fill="none"
                  stroke="var(--ull-primary)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              )}

              {/* Nodos */}
              {snapshot.scenes.map((scene) => {
                const p = positions[scene.id];
                if (p == null) return null;
                const selected = selectedNodes.has(scene.id);
                const isStart = startScene === scene.id;
                const orphan = orphans.has(scene.id);
                return (
                  <g key={scene.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: "grab" }}>
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={12}
                      fill="var(--ull-surface)"
                      stroke={selected ? "var(--ull-primary)" : orphan ? "#d97706" : "var(--ull-border)"}
                      strokeWidth={selected ? 2.5 : 1.5}
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
                    <circle
                      cx={NODE_W}
                      cy={NODE_H / 2}
                      r={PORT_R}
                      fill={canEdit ? "var(--ull-primary)" : "var(--ull-surface)"}
                      stroke="var(--ull-primary)"
                      strokeWidth={1.5}
                      style={{ cursor: canEdit ? "crosshair" : "default" }}
                    />
                  </g>
                );
              })}

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
      {(selectedConn != null || selectedDerived != null) && (
        <aside className="w-72 space-y-4 overflow-y-auto border-l border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
          {selectedConn != null && (
            <>
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("connection")}</h3>
              <p className="text-[13px]">
                {snapshot.scenes.find((s) => s.id === selectedConn.fromScene)?.title} → {snapshot.scenes.find((s) => s.id === selectedConn.toScene)?.title}
              </p>
              <label className="block text-[13px]">
                <span className="mb-1 block font-medium">{t("entry_mode")}</span>
                <Select
                  value={selectedConn.entryMode}
                  disabled={!canEdit}
                  onChange={(e) => {
                    editor.apply((draft) => {
                      const conn = draft.connections.find((c) => c.id === selectedConn.id);
                      if (conn != null) conn.entryMode = e.target.value;
                    });
                  }}
                >
                  <option value="fixed">{t("entry_fixed")}</option>
                  <option value="relative">{t("entry_relative")}</option>
                  <option value="lookBack">{t("entry_lookback")}</option>
                </Select>
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit}
                onClick={() => {
                  editor.apply((draft) => {
                    draft.connections = draft.connections.filter((c) => c.id !== selectedConn.id);
                  });
                  setSelectedEdge(null);
                }}
              >
                <Trash2 className="h-4 w-4" /> {t("delete")}
              </Button>
              <p className="text-xs text-[var(--ull-text-dim)]">{t("delete_edge_hint")}</p>
            </>
          )}
          {selectedDerived != null && (
            <>
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("nav_hotspot_edge")}</h3>
              <p className="text-[13px] text-[var(--ull-text-dim)]">{t("nav_hotspot_edge_hint")}</p>
              <Button size="sm" variant="outline" onClick={() => onOpenScene?.(selectedDerived.sceneId, selectedDerived.id)}>
                <LayoutGrid className="h-4 w-4" /> {t("edit_hotspot")}
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
