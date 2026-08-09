import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Select } from "@ull360/ui";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { clientId, readJson } from "./editorApi";

/**
 * Editor del grafo de escenas (§3.4): lienzo con nodos arrastrables,
 * aristas (conexiones + hotspots de navegacion), minimapa, deteccion de
 * escenas huerfanas y creacion de conexiones arrastrando entre nodos.
 * Render por canvas (rendimiento con 500+ escenas §4.1).
 */

interface NodePos {
  x: number;
  y: number;
}

export function GraphView({ canEdit }: { canEdit: boolean }): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const [positions, setPositions] = useState<Record<string, NodePos>>({});
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const dragState = useRef<{ kind: "node" | "connect" | "pan"; id?: string; startX: number; startY: number; moved: boolean } | null>(null);
  const viewRef = useRef({ ox: 40, oy: 40, scale: 1 });
  const [connectPreview, setConnectPreview] = useState<{ from: string; x: number; y: number } | null>(null);

  // Posiciones: guardadas en settings.graphLayout o disposicion automatica en rejilla
  useEffect(() => {
    const saved = (snapshot.settings.graphLayout as Record<string, NodePos>) ?? {};
    const next: Record<string, NodePos> = {};
    snapshot.scenes.forEach((scene, i) => {
      next[scene.id] = saved[scene.id] ?? { x: (i % 5) * 190, y: Math.floor(i / 5) * 120 };
    });
    setPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.scenes.length]);

  // Aristas: conexiones explicitas + derivadas de hotspots de navegacion
  const edges = useMemo(() => {
    const explicit = snapshot.connections.map((c) => ({ id: c.id, from: c.fromScene, to: c.toScene, explicit: true }));
    const derived: { id: string; from: string; to: string; explicit: boolean }[] = [];
    for (const h of snapshot.hotspots) {
      if (h.type !== "navigation") continue;
      const content = readJson<{ target?: string }>(h.contentJson, {});
      if (content.target != null && content.target !== "") {
        derived.push({ id: `hs-${h.id}`, from: h.sceneId, to: content.target, explicit: false });
      }
    }
    return [...explicit, ...derived];
  }, [snapshot.connections, snapshot.hotspots]);

  // Escenas huerfanas (no alcanzables desde la inicial)
  const orphans = useMemo(() => {
    const start = (snapshot.settings.startScene as string) ?? snapshot.scenes[0]?.id;
    if (start == null) return new Set<string>();
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    }
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

  const NODE_W = 150;
  const NODE_H = 64;

  const draw = useCallback((): void => {
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { ox, oy, scale } = viewRef.current;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue("--ull-primary").trim() || "#5c68a5";

    // Aristas
    for (const edge of edges) {
      const a = positions[edge.from];
      const b = positions[edge.to];
      if (a == null || b == null) continue;
      const x1 = a.x + NODE_W / 2;
      const y1 = a.y + NODE_H / 2;
      const x2 = b.x + NODE_W / 2;
      const y2 = b.y + NODE_H / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const mx = (x1 + x2) / 2;
      ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
      ctx.strokeStyle = selectedEdge === edge.id ? "#d9a521" : edge.explicit ? primary : "#9aa2c2";
      ctx.lineWidth = selectedEdge === edge.id ? 3 : 1.5;
      if (!edge.explicit) ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Punta de flecha
      const angle = Math.atan2(y2 - y1, x2 - mx);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 10 * Math.cos(angle - 0.4), y2 - 10 * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - 10 * Math.cos(angle + 0.4), y2 - 10 * Math.sin(angle + 0.4));
      ctx.fillStyle = edge.explicit ? primary : "#9aa2c2";
      ctx.fill();
    }

    // Previsualizacion de conexion en curso
    if (connectPreview != null) {
      const a = positions[connectPreview.from];
      if (a != null) {
        ctx.beginPath();
        ctx.moveTo(a.x + NODE_W / 2, a.y + NODE_H / 2);
        ctx.lineTo(connectPreview.x, connectPreview.y);
        ctx.strokeStyle = "#d9a521";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Nodos
    for (const scene of snapshot.scenes) {
      const pos = positions[scene.id];
      if (pos == null) continue;
      const isStart = snapshot.settings.startScene === scene.id;
      const isOrphan = orphans.has(scene.id);
      const isSelected = editor.selectedSceneId === scene.id;
      ctx.beginPath();
      ctx.roundRect(pos.x, pos.y, NODE_W, NODE_H, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = isSelected ? primary : isOrphan ? "#c2453a" : "#d8dcea";
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();
      if (isStart) {
        ctx.fillStyle = primary;
        ctx.beginPath();
        ctx.arc(pos.x + 12, pos.y + 12, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#1c2340";
      ctx.font = "600 12px system-ui";
      const title = scene.title.length > 20 ? `${scene.title.slice(0, 19)}...` : scene.title;
      ctx.fillText(title, pos.x + 12, pos.y + 30);
      ctx.fillStyle = "#5a627e";
      ctx.font = "11px system-ui";
      const outgoing = edges.filter((e) => e.from === scene.id).length;
      ctx.fillText(`${outgoing} ->`, pos.x + 12, pos.y + 48);
      if (isOrphan) {
        ctx.fillStyle = "#c2453a";
        ctx.fillText("!", pos.x + NODE_W - 18, pos.y + 20);
      }
      // Asa de conexion (borde derecho)
      ctx.beginPath();
      ctx.arc(pos.x + NODE_W, pos.y + NODE_H / 2, 6, 0, Math.PI * 2);
      ctx.fillStyle = primary;
      ctx.fill();
    }
    ctx.restore();

    // Minimapa
    const mini = miniRef.current;
    if (mini != null) {
      const mctx = mini.getContext("2d")!;
      mini.width = 160;
      mini.height = 110;
      mctx.fillStyle = "rgba(238, 240, 247, 0.95)";
      mctx.fillRect(0, 0, 160, 110);
      const allX = Object.values(positions).map((p) => p.x);
      const allY = Object.values(positions).map((p) => p.y);
      if (allX.length > 0) {
        const minX = Math.min(...allX) - 50;
        const maxX = Math.max(...allX) + NODE_W + 50;
        const minY = Math.min(...allY) - 50;
        const maxY = Math.max(...allY) + NODE_H + 50;
        const sx = 160 / (maxX - minX);
        const sy = 110 / (maxY - minY);
        const s = Math.min(sx, sy);
        for (const scene of snapshot.scenes) {
          const p = positions[scene.id];
          if (p == null) continue;
          mctx.fillStyle = orphans.has(scene.id) ? "#c2453a" : primary;
          mctx.fillRect((p.x - minX) * s, (p.y - minY) * s, Math.max(3, NODE_W * s), Math.max(2, NODE_H * s));
        }
        // Viewport
        const { ox, oy, scale } = viewRef.current;
        mctx.strokeStyle = "#1c2340";
        mctx.strokeRect((-ox / scale - minX) * s, (-oy / scale - minY) * s, (w / scale) * s, (h / scale) * s);
      }
    }
  }, [edges, positions, snapshot.scenes, snapshot.settings.startScene, orphans, editor.selectedSceneId, connectPreview, selectedEdge]);

  useEffect(() => {
    draw();
  }, [draw]);
  useEffect(() => {
    const onResize = (): void => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  const toWorld = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { ox, oy, scale } = viewRef.current;
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale };
  };

  const hitNode = (x: number, y: number): string | null => {
    for (const scene of [...snapshot.scenes].reverse()) {
      const p = positions[scene.id];
      if (p != null && x >= p.x && x <= p.x + NODE_W && y >= p.y && y <= p.y + NODE_H) return scene.id;
    }
    return null;
  };

  const hitHandle = (x: number, y: number): string | null => {
    for (const scene of snapshot.scenes) {
      const p = positions[scene.id];
      if (p != null && Math.hypot(x - (p.x + NODE_W), y - (p.y + NODE_H / 2)) <= 10) return scene.id;
    }
    return null;
  };

  const hitEdge = (x: number, y: number): string | null => {
    for (const edge of edges) {
      const a = positions[edge.from];
      const b = positions[edge.to];
      if (a == null || b == null) continue;
      const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H / 2;
      const x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H / 2;
      const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      if (len2 === 0) continue;
      const t2 = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / len2));
      const dist = Math.hypot(x - (x1 + t2 * (x2 - x1)), y - (y1 + t2 * (y2 - y1)));
      if (dist < 8) return edge.id;
    }
    return null;
  };

  const persistLayout = (): void => {
    editor.apply((draft) => {
      draft.settings.graphLayout = positions;
    });
  };

  const selectedConn = snapshot.connections.find((c) => c.id === selectedEdge);

  return (
    <div className="relative h-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab touch-none"
        role="application"
        aria-label={t("graph")}
        onPointerDown={(e) => {
          const { x, y } = toWorld(e);
          const handle = canEdit ? hitHandle(x, y) : null;
          const node = hitNode(x, y);
          canvasRef.current!.setPointerCapture(e.pointerId);
          if (handle != null) {
            dragState.current = { kind: "connect", id: handle, startX: x, startY: y, moved: false };
          } else if (node != null) {
            dragState.current = { kind: "node", id: node, startX: x, startY: y, moved: false };
            editor.select(node);
          } else {
            const edge = hitEdge(x, y);
            setSelectedEdge(edge);
            dragState.current = { kind: "pan", startX: e.clientX, startY: e.clientY, moved: false };
          }
        }}
        onPointerMove={(e) => {
          const st = dragState.current;
          if (st == null) return;
          st.moved = true;
          if (st.kind === "node" && st.id != null && canEdit) {
            const { x, y } = toWorld(e);
            setPositions((prev) => ({ ...prev, [st.id!]: { x: x - NODE_W / 2, y: y - NODE_H / 2 } }));
          } else if (st.kind === "connect" && st.id != null) {
            const { x, y } = toWorld(e);
            setConnectPreview({ from: st.id, x, y });
          } else if (st.kind === "pan") {
            viewRef.current.ox += e.clientX - st.startX;
            viewRef.current.oy += e.clientY - st.startY;
            st.startX = e.clientX;
            st.startY = e.clientY;
            draw();
          }
        }}
        onPointerUp={(e) => {
          const st = dragState.current;
          dragState.current = null;
          if (st?.kind === "connect" && st.id != null) {
            const { x, y } = toWorld(e);
            const target = hitNode(x, y);
            setConnectPreview(null);
            if (target != null && target !== st.id && canEdit) {
              editor.apply((draft) => {
                draft.connections.push({
                  id: clientId(),
                  projectId: draft.scenes[0]?.projectId ?? "",
                  fromScene: st.id!,
                  toScene: target,
                  entryMode: "relative",
                  entryViewJson: null,
                  transitionJson: null,
                });
              });
            }
          } else if (st?.kind === "node" && st.moved && canEdit) {
            persistLayout();
          }
        }}
        onWheel={(e) => {
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          const rect = canvasRef.current!.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const v = viewRef.current;
          const ns = Math.min(2.5, Math.max(0.2, v.scale * factor));
          v.ox = cx - ((cx - v.ox) / v.scale) * ns;
          v.oy = cy - ((cy - v.oy) / v.scale) * ns;
          v.scale = ns;
          draw();
        }}
      />
      <canvas ref={miniRef} className="absolute bottom-3 right-3 rounded-lg border border-[var(--ull-border)] shadow" aria-hidden="true" />
      <div className="absolute left-3 top-3 max-w-xs rounded-lg bg-[var(--ull-surface)] p-3 text-xs shadow">
        <p className="text-[var(--ull-text-dim)]">{t("graph_hint")}</p>
        {orphans.size > 0 ? (
          <p className="mt-1.5 font-medium text-[var(--ull-danger)]">
            {t("orphan_scenes")}: {[...orphans].map((id) => snapshot.scenes.find((s) => s.id === id)?.title ?? id).join(", ")}
          </p>
        ) : (
          <p className="mt-1.5 text-[var(--ull-ok)]">{t("no_orphans")}</p>
        )}
      </div>
      {selectedConn != null && (
        <div className="absolute right-3 top-3 w-64 space-y-2 rounded-lg bg-[var(--ull-surface)] p-3 text-sm shadow">
          <p className="font-medium">
            {snapshot.scenes.find((s) => s.id === selectedConn.fromScene)?.title} {"->"}{" "}
            {snapshot.scenes.find((s) => s.id === selectedConn.toScene)?.title}
          </p>
          <Select
            value={selectedConn.entryMode}
            disabled={!canEdit}
            aria-label={t("entry_mode")}
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
          <Button
            size="sm"
            variant="danger"
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
        </div>
      )}
    </div>
  );
}
