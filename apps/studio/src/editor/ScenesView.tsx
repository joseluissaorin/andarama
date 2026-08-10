import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  Crosshair,
  GripVertical,
  Image as ImageIcon,
  Lock,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Field, Input, Tooltip, useToast } from "@andarama/ui";
import type { Tour } from "@andarama/schema";
import { mountViewer, type MountedSkin } from "@andarama/viewer-ui";
import { api } from "../api";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { clientId, readJson } from "./editorApi";
import { MediaPicker } from "./MediaPicker";
import { Criatura } from "../components/Criatura";
import { hasMediaDrag, readMediaDrag, scenesFromMedia } from "../media/drag";
import { arrivalsOf, resolveArrivalView } from "./arrivals";
import { PropertiesPanel } from "./PropertiesPanel";
import { HotspotPalette } from "./HotspotPalette";
import type { ProjectInfo } from "./EditorPage";
import type { MediaItem } from "../pages/MediaPage";

/** Vista principal: lista de escenas + previsualización WYSIWYG + propiedades. */
export function ScenesView({ project, canEdit, locks, myConnId }: {
  project: ProjectInfo;
  canEdit: boolean;
  locks: Record<string, { connectionId: string; name: string }>;
  myConnId: string | null;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const editor = useEditor();
  const [addOpen, setAddOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMedia, setNewMedia] = useState<MediaItem | null>(null);
  const [filter, setFilter] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<string | null>(null);

  const snapshot = editor.snapshot!;
  const scenes = snapshot.scenes;
  const selected = scenes.find((s) => s.id === editor.selectedSceneId) ?? scenes[0] ?? null;
  const visible = filter.trim() === ""
    ? scenes
    : scenes.filter((s) => s.title.toLowerCase().includes(filter.trim().toLowerCase()));

  const [mediaOver, setMediaOver] = useState(false);
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  const addScene = (): void => {
    if (newTitle.trim() === "") return;
    const id = clientId();
    const type = newMedia?.kind === "video" ? "video" : "image";
    editor.apply((draft) => {
      draft.scenes.push({
        id,
        projectId: project.id,
        sort: draft.scenes.length,
        title: newTitle.trim(),
        type,
        mediaId: newMedia?.id ?? null,
        sourceJson: null,
        initialViewJson: null,
        limitsJson: null,
        audioJson: null,
        mapJson: null,
        metaJson: newMedia != null ? JSON.stringify({ thumbnail: `thumb:${newMedia.id}` }) : "{}",
      });
      const settings = draft.settings;
      if (settings.startScene == null) settings.startScene = id;
    });
    editor.select(id);
    setAddOpen(false);
    setNewTitle("");
    setNewMedia(null);
  };

  const reorder = (fromId: string, toId: string): void => {
    if (fromId === toId) return;
    editor.apply((draft) => {
      const fromIdx = draft.scenes.findIndex((s) => s.id === fromId);
      const toIdx = draft.scenes.findIndex((s) => s.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [item] = draft.scenes.splice(fromIdx, 1);
      draft.scenes.splice(toIdx, 0, item!);
      draft.scenes.forEach((s, i) => {
        s.sort = i;
      });
    });
  };

  const duplicate = (sceneId: string): void => {
    const newId = clientId();
    editor.apply((draft) => {
      const idx = draft.scenes.findIndex((s) => s.id === sceneId);
      const src = draft.scenes[idx];
      if (src == null) return;
      draft.scenes.splice(idx + 1, 0, { ...structuredClone(src), id: newId, title: `${src.title} (copia)` });
      draft.scenes.forEach((s, i) => {
        s.sort = i;
      });
      for (const h of draft.hotspots.filter((h) => h.sceneId === sceneId)) {
        draft.hotspots.push({ ...structuredClone(h), id: clientId(), sceneId: newId });
      }
    });
    editor.select(newId);
  };

  const remove = (sceneId: string): void => {
    if (!confirm(t("confirm_delete_scene"))) return;
    editor.apply((draft) => {
      draft.scenes = draft.scenes.filter((s) => s.id !== sceneId);
      // Se van los hotspots de la escena y también los que apuntaban a ella:
      // un paso a una escena inexistente es un callejón sin salida.
      draft.hotspots = draft.hotspots.filter(
        (h) => h.sceneId !== sceneId && readJson<{ target?: string }>(h.contentJson, {}).target !== sceneId,
      );
      if (draft.settings.startScene === sceneId) draft.settings.startScene = draft.scenes[0]?.id;
    });
    if (editor.selectedSceneId === sceneId) editor.select(scenes.find((s) => s.id !== sceneId)?.id ?? null);
  };

  return (
    <div className="flex h-full">
      <aside
        className={`flex w-64 flex-col border-r bg-[var(--anda-surface)] ${
          mediaOver ? "border-[var(--anda-primary)] bg-[var(--anda-primary)]/5" : "border-[var(--anda-border)]"
        }`}
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
          let first: string | undefined;
          editor.apply((draft) => {
            first = scenesFromMedia(draft, project.id, items)[0];
          });
          if (first != null) editor.select(first);
          toast.push(t("scenes_created", { count: String(items.length) }), "ok");
        }}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">{t("scenes")}</h2>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)} aria-label={t("add_scene")}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        {scenes.length > 6 && (
          <div className="anda-buscador mx-2 mb-2">
            <Search />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="!py-1.5 !text-[13px]"
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {visible.map((scene) => {
            const lock = locks[scene.id];
            const lockedByOther = lock != null && lock.connectionId !== myConnId;
            const isStart = snapshot.settings.startScene === scene.id;
            return (
              <div
                key={scene.id}
                draggable={canEdit}
                onDragStart={(e) => {
                  setDragId(scene.id);
                  // Dentro de la lista reordena; sobre el panorama crea el paso
                  // hacia esta escena. El mismo gesto, dos destinos.
                  e.dataTransfer.setData(SCENE_DRAG_TYPE, scene.id);
                  e.dataTransfer.effectAllowed = "copyMove";
                }}
                onDragOver={(e) => {
                  if (dragId == null || dragId === scene.id) return;
                  e.preventDefault();
                  setDropAt(scene.id);
                }}
                onDragLeave={() => setDropAt((d) => (d === scene.id ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId != null && filter.trim() === "") reorder(dragId, scene.id);
                  setDragId(null);
                  setDropAt(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropAt(null);
                }}
                className={`anda-ficha group relative mb-1.5 p-2 ${
                  selected?.id === scene.id ? "anda-ficha--activa" : ""
                } ${dropAt === scene.id ? "!shadow-[inset_0_2px_0_var(--anda-primary)]" : ""} ${dragId === scene.id ? "opacity-40" : ""}`}
              >
                <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => editor.select(scene.id)}>
                  {canEdit && (
                    <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-[var(--anda-text-dim)] opacity-0 transition-opacity group-hover:opacity-60" />
                  )}
                  {scene.mediaId != null ? (
                    <img src={`/api/v1/media/${scene.mediaId}/derived/thumb`} alt="" className="h-9 w-14 rounded object-cover" loading="lazy"
                      onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                  ) : (
                    <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded bg-[var(--anda-surface-2)] text-[var(--anda-text-dim)]">
                      <ImageIcon className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{scene.title}</span>
                    <span className="flex items-center gap-1 text-[11px] text-[var(--anda-text-dim)]">
                      {isStart && <Badge tone="ok">{t("start_scene_badge")}</Badge>}
                      {scene.type !== "image" && <Badge>{scene.type}</Badge>}
                      {lockedByOther && (
                        <Tooltip content={t("scene_locked", { name: lock.name })}>
                          <Lock className="h-3 w-3 text-[var(--anda-accent)]" />
                        </Tooltip>
                      )}
                    </span>
                  </span>
                </button>
                {canEdit && (
                  <div className="absolute right-1.5 top-1.5 hidden gap-0.5 rounded-md bg-[var(--anda-surface)] p-0.5 shadow-sm group-focus-within:flex group-hover:flex">
                    <Tooltip content={t("duplicate")}>
                      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t("duplicate")} onClick={() => duplicate(scene.id)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t("delete")}>
                      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t("delete")} onClick={() => remove(scene.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                  </div>
                )}
              </div>
            );
          })}
          {scenes.length === 0 && <p className="p-3 text-[13px] text-[var(--anda-text-dim)]">{t("add_scene")}</p>}
          {scenes.length > 0 && visible.length === 0 && (
            <p className="p-3 text-[13px] text-[var(--anda-text-dim)]">{t("no_results")}</p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {selected != null ? (
          <ViewerPane key={selected.id} project={project} sceneId={selected.id} canEdit={canEdit} />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState icon={<Criatura size={64} andando />} title={t("no_scenes_yet")} hint={t("no_scenes_yet_hint")} />
          </div>
        )}
      </div>

      {selected != null && (
        <aside
          className="relative flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--anda-border)] bg-[var(--anda-surface)]"
          style={{ width: panelWidth }}
        >
          {/* Tirador: 320 px se queda corto para las etiquetas en español */}
          <div
            role="separator"
            aria-label={t("resize_panel")}
            aria-orientation="vertical"
            tabIndex={0}
            className="absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-[var(--anda-primary)]/25"
            onPointerDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = panelWidth;
              const move = (ev: PointerEvent): void => setPanelWidth(clampPanel(startW + (startX - ev.clientX)));
              const up = (): void => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidthRef.current));
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = clampPanel(panelWidth + (e.key === "ArrowLeft" ? 24 : -24));
              setPanelWidth(next);
              localStorage.setItem(PANEL_WIDTH_KEY, String(next));
            }}
          />
          <PropertiesPanel project={project} scene={selected} canEdit={canEdit} />
        </aside>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title={t("add_scene")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={addScene} disabled={newTitle.trim() === ""}>
              {t("create")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("scene_title")} htmlFor="ns-title">
            <Input id="ns-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
          </Field>
          <Field label={t("select_panorama")}>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setPickerOpen(true)}>
                {newMedia != null ? newMedia.filename : t("select_media")}
              </Button>
            </div>
          </Field>
        </div>
      </Dialog>
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setNewMedia} />
    </div>
  );
}

/** Arrastre de una escena de la lista: crea el paso hacia ella. */
export const SCENE_DRAG_TYPE = "application/x-anda-scene";

const PANEL_WIDTH_KEY = "andarama.panelWidth";
const PANEL_MIN = 320;
const PANEL_MAX = 620;

function clampPanel(width: number): number {
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(width)));
}

function readPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
  return Number.isFinite(saved) && saved > 0 ? clampPanel(saved) : 380;
}

// ---------------------------------------------------------------------------
// Previsualización WYSIWYG (el propio Viewer en modo edición §3.4)
// ---------------------------------------------------------------------------

export type PlacementMode =
  | { kind: "none" }
  | { kind: "hotspot"; type: string }
  | { kind: "polygon"; points: { yaw: number; pitch: number }[]; replaceId?: string }
  | { kind: "corners"; hotspotId: string; points: { yaw: number; pitch: number }[] };

let placementListeners: ((mode: PlacementMode) => void)[] = [];
let currentPlacement: PlacementMode = { kind: "none" };

export function setPlacementMode(mode: PlacementMode): void {
  currentPlacement = mode;
  for (const l of placementListeners) l(mode);
}

/**
 * Resaltar un marcador desde la lista del panel: pasar el ratón por la lista
 * enseña de cuál se habla sin tener que buscarlo en el panorama.
 */
let highlighted: string | null = null;
export function highlightHotspot(id: string | null): void {
  highlighted = id;
  for (const node of document.querySelectorAll<HTMLElement>(".anda-hotspot")) {
    const isIt = id != null && node.dataset.hotspotId === id;
    node.style.outline = isIt ? "3px solid var(--anda-primary)" : "";
    node.style.outlineOffset = isIt ? "3px" : "";
    node.style.zIndex = isIt ? "30" : "";
  }
}

export function currentHighlight(): string | null {
  return highlighted;
}

export function usePlacementMode(): PlacementMode {
  const [mode, setMode] = useState(currentPlacement);
  useEffect(() => {
    placementListeners.push(setMode);
    return () => {
      placementListeners = placementListeners.filter((l) => l !== setMode);
    };
  }, []);
  return mode;
}

/** Vista actual del visor embebido (para "usar vista actual"). */
let lastView: { yaw: number; pitch: number; fov: number } = { yaw: 0, pitch: 0, fov: 1.2 };
export function getCurrentEditorView(): { yaw: number; pitch: number; fov: number } {
  return { ...lastView };
}

/** Visor montado en el editor, para poder girarlo desde fuera. */
let mountedViewer: MountedSkin | null = null;

/**
 * Gira el panorama del editor hasta una vista concreta. Lo usa el panel de
 * llegadas: elegir una orientación de entrada sin verla no es editar.
 */
export function setEditorView(view: { yaw: number; pitch: number; fov?: number }): void {
  mountedViewer?.viewer.setView({ yaw: view.yaw, pitch: view.pitch, fov: view.fov ?? lastView.fov });
}

/**
 * Vista con la que abrir la siguiente escena que se monte.
 *
 * La orientación de llegada no es de la sala, es del camino: quien salta por
 * un paso concreto tiene que aterrizar mirando a donde mira el visitante que
 * viene por ahí. Se deja apuntada aquí porque quien monta el visor es el panel
 * de la escena de destino, que aún no existe cuando se pulsa el botón.
 */
let llegadaPendiente: { sceneId: string; view: { yaw: number; pitch: number; fov?: number } } | null = null;
export function programarVistaDeLlegada(sceneId: string, view: { yaw: number; pitch: number; fov?: number }): void {
  llegadaPendiente = { sceneId, view };
}

function ViewerPane({ project, sceneId, canEdit }: { project: ProjectInfo; sceneId: string; canEdit: boolean }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const editor = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const skinRef = useRef<MountedSkin | null>(null);
  const [issues, setIssues] = useState<{ severity: string; message: string }[]>([]);
  const placement = usePlacementMode();
  const placementRef = useRef(placement);
  placementRef.current = placement;
  const [compiling, setCompiling] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const firstMount = useRef(true);

  // Arrastrar una escena de la lista sobre el panorama crea el paso hacia ella
  // justo donde se suelta: es la acción más repetida al construir un tour.
  useEffect(() => {
    const node = containerRef.current;
    if (node == null || !canEdit) return;
    const ac = new AbortController();
    node.addEventListener(
      "dragover",
      (e) => {
        if (!Array.from(e.dataTransfer?.types ?? []).includes(SCENE_DRAG_TYPE)) return;
        e.preventDefault();
        if (e.dataTransfer != null) e.dataTransfer.dropEffect = "link";
      },
      { signal: ac.signal },
    );
    node.addEventListener(
      "drop",
      (e) => {
        const target = e.dataTransfer?.getData(SCENE_DRAG_TYPE);
        if (target == null || target === "" || target === sceneId) return;
        e.preventDefault();
        const viewer = skinRef.current?.viewer;
        const rect = node.getBoundingClientRect();
        const coords = viewer?.marzipanoViewer().view()?.screenToCoordinates?.({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        if (coords == null) return;
        const id = clientId();
        editor.apply((draft) => {
          draft.hotspots.push({
            id,
            sceneId,
            type: "navigation",
            positionJson: JSON.stringify({ yaw: coords.yaw, pitch: coords.pitch }),
            styleJson: null,
            contentJson: JSON.stringify({
              target,
              label: draft.scenes.find((sc) => sc.id === target)?.title ?? "",
              entry: { mode: "relative" },
            }),
            conditionsJson: null,
            sort: draft.hotspots.filter((h) => h.sceneId === sceneId).length,
          });
        });
        editor.select(sceneId, id);
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, [canEdit, sceneId, editor]);

  // Los listeners de colocación viven en el contenedor UNA sola vez, con
  // AbortController: los remontajes del visor no acumulan duplicados.
  useEffect(() => {
    const node = containerRef.current;
    if (node == null || !canEdit) return;
    const ac = new AbortController();
    const coordsFor = (e: MouseEvent): { yaw: number; pitch: number } | null => {
      const viewer = skinRef.current?.viewer;
      if (viewer == null) return null;
      const view = viewer.marzipanoViewer().view();
      const rect = node.getBoundingClientRect();
      return view?.screenToCoordinates?.({ x: e.clientX - rect.left, y: e.clientY - rect.top }) ?? null;
    };
    const isChrome = (e: MouseEvent): boolean => {
      const el = e.target as HTMLElement;
      return el.closest(".anda-hotspot, .anda-controls, .anda-compass, .anda-loading, button, a") != null;
    };
    node.addEventListener(
      "click",
      (e) => {
        const mode = placementRef.current;
        if (mode.kind === "none" || isChrome(e)) return;
        const coords = coordsFor(e);
        if (coords == null) return;
        e.stopPropagation();
        if (mode.kind === "hotspot") {
          const type = mode.type;
          const id = clientId();
          editor.apply((draft) => {
            draft.hotspots.push({
              id,
              sceneId,
              type,
              positionJson: JSON.stringify({ yaw: coords.yaw, pitch: coords.pitch }),
              styleJson: null,
              contentJson: JSON.stringify(defaultContent(type, draft.scenes.filter((s) => s.id !== sceneId)[0]?.id)),
              conditionsJson: null,
              sort: draft.hotspots.filter((h) => h.sceneId === sceneId).length,
            });
          });
          editor.select(sceneId, id);
          setPlacementMode({ kind: "none" });
        } else if (mode.kind === "corners") {
          const points = [...mode.points, coords];
          if (points.length < 4) {
            setPlacementMode({ kind: "corners", hotspotId: mode.hotspotId, points });
          } else {
            editor.apply((draft) => {
              const h = draft.hotspots.find((x) => x.id === mode.hotspotId);
              if (h == null) return;
              const c = h.contentJson != null ? (JSON.parse(h.contentJson) as Record<string, unknown>) : {};
              h.contentJson = JSON.stringify({ ...c, corners: points });
            });
            setPlacementMode({ kind: "none" });
          }
        } else {
          setPlacementMode({ kind: "polygon", points: [...mode.points, coords], replaceId: mode.replaceId });
        }
      },
      { signal: ac.signal },
    );
    node.addEventListener(
      "dblclick",
      () => {
        const mode = placementRef.current;
        if (mode.kind !== "polygon" || mode.points.length < 3) return;
        if (mode.replaceId != null) {
          // Redibujar el contorno de un polígono existente
          editor.apply((draft) => {
            const h = draft.hotspots.find((x) => x.id === mode.replaceId);
            if (h == null) return;
            h.positionJson = JSON.stringify({ yaw: mode.points[0]!.yaw, pitch: mode.points[0]!.pitch, points: mode.points });
          });
          editor.select(sceneId, mode.replaceId);
          setPlacementMode({ kind: "none" });
          return;
        }
        const id = clientId();
        editor.apply((draft) => {
          draft.hotspots.push({
            id,
            sceneId,
            type: "polygon",
            positionJson: JSON.stringify({ yaw: mode.points[0]!.yaw, pitch: mode.points[0]!.pitch, points: mode.points }),
            styleJson: null,
            contentJson: JSON.stringify({ altText: "Polígono" }),
            conditionsJson: null,
            sort: 0,
          });
        });
        editor.select(sceneId, id);
        setPlacementMode({ kind: "none" });
      },
      { signal: ac.signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && placementRef.current.kind !== "none") setPlacementMode({ kind: "none" });
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, [sceneId, canEdit, editor]);

  const remount = useCallback(async (): Promise<void> => {
    if (containerRef.current == null) return;
    setCompiling(true);
    try {
      const { tour, issues: compileIssues } = await api<{ tour: Tour; issues: { severity: string; message: string }[] }>(
        `/projects/${project.id}/compile`,
        { method: "POST", body: {} },
      );
      setIssues(compileIssues);
      skinRef.current?.destroy();
      skinRef.current = null;
      if (tour.scenes.length === 0) return;
      if (!tour.scenes.some((s) => s.id === sceneId)) {
        // Escena sin medios aún: nada que previsualizar
        return;
      }
      // Si se ha llegado por un paso, se entra con SU orientación; si no, tras
      // un guardado el encuadre se conserva y la vista previa no salta.
      const llegada = llegadaPendiente?.sceneId === sceneId ? llegadaPendiente.view : null;
      if (llegada != null) llegadaPendiente = null;
      const view = llegada != null
        ? { yaw: llegada.yaw, pitch: llegada.pitch, fov: llegada.fov ?? lastView.fov }
        : firstMount.current ? undefined : { ...lastView };
      firstMount.current = false;
      tour.start = { scene: sceneId, intro: "none", view };
      const mounted = mountViewer({
        container: containerRef.current,
        tour,
        baseUrl: `/api/v1/projects/${project.id}/preview`,
        editMode: true,
        deepLinks: false,
        analyticsEndpoint: null,
      });
      skinRef.current = mounted;
      mountedViewer = mounted;
      mounted.viewer.on("viewChange", (v) => {
        lastView = v;
      });
      // Clic sobre un marcador = seleccionarlo (el motor no ejecuta efectos
      // en editMode: ni navegar, ni abrir enlaces, ni mutar estado).
      mounted.viewer.on("hotspotActivate", (e) => {
        mounted.panelHost.close();
        editor.select(sceneId, e.hotspot.id);
      });
      // Arrastre de marcadores: al soltar se persiste la nueva posición.
      mounted.viewer.on("hotspotMove", (e) => {
        if (e.phase !== "end") return;
        editor.apply((draft) => {
          const h = draft.hotspots.find((x) => x.id === e.hotspot.id);
          if (h == null) return;
          const pos = h.positionJson != null ? (JSON.parse(h.positionJson) as Record<string, unknown>) : {};
          h.positionJson = JSON.stringify({ ...pos, yaw: e.yaw, pitch: e.pitch });
          // Arrastrarlo es colocarlo: se retira el aviso de posición provisional
          const content = readJson<Record<string, unknown>>(h.contentJson, {});
          if (content.unplaced === true) {
            delete content.unplaced;
            h.contentJson = JSON.stringify(content);
          }
        });
        editor.select(sceneId, e.hotspot.id);
      });
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setCompiling(false);
    }
  }, [project.id, sceneId]);

  // Remontar al cambiar de escena o tras guardado
  const saving = useEditor((s) => s.saving);
  const dirty = useEditor((s) => s.dirty);
  useEffect(() => {
    void remount();
    return () => {
      skinRef.current?.destroy();
      skinRef.current = null;
      mountedViewer = null;
    };
  }, [remount]);
  useEffect(() => {
    if (saving === "saved" && !dirty) void remount();
  }, [saving, dirty]);

  const scene = editor.snapshot?.scenes.find((s) => s.id === sceneId) ?? null;

  return (
    <>
      {/* Barra de herramientas del lienzo: nada flota sobre el visor */}
      <div className="anda-barra flex min-h-10 items-center gap-2 px-3 py-1.5">
        {placement.kind !== "none" ? (
          <span className="flex items-center gap-2 rounded-full bg-[var(--anda-primary-soft)] px-3 py-1 text-[13px] font-medium text-[var(--anda-primary)]">
            <Crosshair className="h-3.5 w-3.5" />
            {placement.kind === "polygon"
              ? `${t("polygon_hint")} (${placement.points.length})`
              : placement.kind === "corners"
                ? `${t("corners_click_hint")} (${placement.points.length}/4)`
                : t("hotspot_place_hint")}
            <button type="button" aria-label={t("cancel")} className="rounded-full p-0.5 hover:bg-[var(--anda-primary)]/10" onClick={() => setPlacementMode({ kind: "none" })}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <span className="truncate text-[13px] text-[var(--anda-text-dim)]">{scene?.title}</span>
        )}
        <div className="flex-1" />
        {compiling && <span className="text-xs text-[var(--anda-text-dim)]">{t("loading")}</span>}
        {issues.length > 0 && <IssuesButton issues={issues} />}
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setPaletteOpen(true)}>
            <Plus className="h-4 w-4" /> {t("add_hotspot_button")}
          </Button>
        )}
        {canEdit && (
          <Tooltip content={t("use_current_view_hint")}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const v = getCurrentEditorView();
                editor.apply((draft) => {
                  const s = draft.scenes.find((x) => x.id === sceneId);
                  if (s != null) s.initialViewJson = JSON.stringify(v);
                });
                toast.push(t("saved"), "ok");
              }}
            >
              <Crosshair className="h-4 w-4" /> {t("use_current_view")}
            </Button>
          </Tooltip>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className={`absolute inset-0 bg-[#0b1020] ${placement.kind !== "none" ? "cursor-crosshair" : ""}`}
        />
        <SaltoDeHotspot contenedor={containerRef} sceneId={sceneId} />
      </div>

      <HotspotPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPick={(type) => setPlacementMode(type === "polygon" ? { kind: "polygon", points: [] } : { kind: "hotspot", type })}
      />
    </>
  );
}

/**
 * El salto: al elegir un hotspot de navegación aparece, justo debajo de su
 * marcador, un botón que lleva a la escena de destino.
 *
 * Es la manera natural de recorrer el tour mientras se edita —seguir el paso
 * que se acaba de colocar— sin ir a buscar la escena en la lista. El botón
 * viaja pegado al marcador: cada fotograma lee dónde ha quedado, porque quien
 * mueve los marcadores es el motor del panorama, no React.
 */
function SaltoDeHotspot({ contenedor, sceneId }: {
  contenedor: React.RefObject<HTMLDivElement>;
  sceneId: string;
}): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const snapshot = editor.snapshot;
  const hotspotId = editor.selectedHotspotId;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const hotspot = hotspotId == null ? null : snapshot?.hotspots.find((h) => h.id === hotspotId) ?? null;
  const destinoId = hotspot != null && hotspot.type === "navigation"
    ? (readJson<{ target?: string }>(hotspot.contentJson, {}).target ?? null)
    : null;
  const destino = destinoId == null ? null : snapshot?.scenes.find((s) => s.id === destinoId) ?? null;

  useEffect(() => {
    if (hotspotId == null || destino == null || contenedor.current == null) {
      setPos(null);
      return;
    }
    const caja = contenedor.current;
    let vivo = true;
    let frame = 0;
    const seguir = (): void => {
      if (!vivo) return;
      const marcador = caja.querySelector<HTMLElement>(`.anda-hotspot[data-hotspot-id="${hotspotId}"]`);
      if (marcador == null || marcador.offsetParent == null) {
        setPos((p) => (p == null ? p : null));
      } else {
        const r = marcador.getBoundingClientRect();
        const c = caja.getBoundingClientRect();
        const x = r.left - c.left + r.width / 2;
        const y = r.bottom - c.top + 10;
        // Fuera del lienzo no se dibuja: el marcador puede quedar a la espalda
        const dentro = x > -60 && x < c.width + 60 && y > -40 && y < c.height + 40;
        setPos((p) => {
          if (!dentro) return p == null ? p : null;
          if (p != null && Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5) return p;
          return { x, y };
        });
      }
      frame = requestAnimationFrame(seguir);
    };
    frame = requestAnimationFrame(seguir);
    return () => {
      vivo = false;
      cancelAnimationFrame(frame);
    };
  }, [hotspotId, destino, contenedor, sceneId]);

  if (destino == null || pos == null) return null;
  return (
    <button
      type="button"
      onClick={() => {
        // Aterrizar como aterriza quien viene por este paso
        const llegada = snapshot == null ? null : arrivalsOf(snapshot, destino.id).find((a) => a.id === hotspotId);
        if (snapshot != null && llegada != null) {
          programarVistaDeLlegada(destino.id, resolveArrivalView(snapshot, destino.id, llegada));
        }
        editor.select(destino.id);
      }}
      style={{ left: pos.x, top: pos.y }}
      className="anda-salto absolute z-20 flex max-w-56 -translate-x-1/2 items-center gap-1.5 truncate rounded-full border border-[var(--anda-border)] bg-[image:var(--anda-tecla)] px-3 py-1.5 text-[12.5px] font-semibold text-[#33260f] shadow-[var(--anda-relieve)] hover:brightness-105"
    >
      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{t("go_to_scene")} {destino.title}</span>
    </button>
  );
}

function IssuesButton({ issues }: { issues: { severity: string; message: string }[] }): React.ReactNode {
  const t = useT();
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.severity === "error").length;
  return (
    <div className="relative">
      <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <AlertTriangle className={`h-4 w-4 ${errors > 0 ? "text-red-500" : "text-amber-500"}`} />
        {t("issues")} ({issues.length})
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-64 w-80 overflow-y-auto rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-2 shadow-[var(--anda-shadow-lg)]">
          <ul className="space-y-1 text-xs">
            {issues.map((issue, i) => (
              <li key={i} className={issue.severity === "error" ? "text-red-500" : "text-amber-600"}>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}

function defaultContent(type: string, otherSceneId?: string): Record<string, unknown> {
  switch (type) {
    case "navigation":
      return { target: otherSceneId ?? "", altText: "Ir a otra escena" };
    case "text":
      return { body: "Texto...", altText: "Información" };
    case "image":
      return { url: "", altText: "Imagen" };
    case "gallery":
      return { items: [], altText: "Galería" };
    case "videoFile":
      return { url: "", mode: "lightbox", altText: "Vídeo" };
    case "embedVideo":
      return { provider: "youtube", videoId: "", nocookie: true, altText: "Vídeo" };
    case "audio":
      return { url: "", mode: "player", altText: "Audio" };
    case "pdf":
      return { url: "", altText: "Documento PDF" };
    case "model3d":
      return { url: "", format: "glb", altText: "Modelo 3D" };
    case "web":
      return { url: "https://", altText: "Contenido web" };
    case "form":
      return {
        fields: [{ id: "nombre", type: "text", label: "Nombre", required: true }],
        destination: { api: true },
        altText: "Formulario",
      };
    case "compare":
      return { mode: "images", before: {}, after: {}, altText: "Comparador" };
    case "quiz":
      return {
        question: "Pregunta...",
        kind: "single",
        options: [
          { id: "a", text: "Opción A", correct: true },
          { id: "b", text: "Opción B" },
        ],
        points: 1,
        altText: "Pregunta",
      };
    case "tooltip":
      return { text: "Etiqueta", permanent: true };
    case "link":
      return { url: "https://", altText: "Enlace" };
    case "state":
      return { actions: [{ var: "visitado", op: "set", value: true }], altText: "Acción" };
    default:
      return {};
  }
}
