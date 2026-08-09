import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Crosshair, Image as ImageIcon, Lock, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Select, Tooltip, useToast } from "@ull360/ui";
import type { Tour } from "@ull360/schema";
import { mountViewer, type MountedSkin } from "@ull360/viewer-ui";
import { api } from "../api";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { clientId, readJson, sceneMeta } from "./editorApi";
import { MediaPicker } from "./MediaPicker";
import { PropertiesPanel } from "./PropertiesPanel";
import type { ProjectInfo } from "./EditorPage";
import type { MediaItem } from "../pages/MediaPage";

/** Vista principal: lista de escenas + previsualizacion WYSIWYG + propiedades. */
export function ScenesView({ project, canEdit, locks, myConnId }: {
  project: ProjectInfo;
  canEdit: boolean;
  locks: Record<string, { connectionId: string; name: string }>;
  myConnId: string | null;
}): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const [addOpen, setAddOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMedia, setNewMedia] = useState<MediaItem | null>(null);

  const snapshot = editor.snapshot!;
  const scenes = snapshot.scenes;
  const selected = scenes.find((s) => s.id === editor.selectedSceneId) ?? scenes[0] ?? null;

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

  const move = (sceneId: string, dir: -1 | 1): void => {
    editor.apply((draft) => {
      const idx = draft.scenes.findIndex((s) => s.id === sceneId);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= draft.scenes.length) return;
      const [item] = draft.scenes.splice(idx, 1);
      draft.scenes.splice(swap, 0, item!);
      draft.scenes.forEach((s, i) => {
        s.sort = i;
      });
    });
  };

  const remove = (sceneId: string): void => {
    if (!confirm(t("confirm_delete_scene"))) return;
    editor.apply((draft) => {
      draft.scenes = draft.scenes.filter((s) => s.id !== sceneId);
      draft.hotspots = draft.hotspots.filter((h) => h.sceneId !== sceneId);
      draft.connections = draft.connections.filter((c) => c.fromScene !== sceneId && c.toScene !== sceneId);
      if (draft.settings.startScene === sceneId) draft.settings.startScene = draft.scenes[0]?.id;
    });
    if (editor.selectedSceneId === sceneId) editor.select(scenes[0]?.id ?? null);
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col border-r border-[var(--ull-border)] bg-[var(--ull-surface)]">
        <div className="flex items-center justify-between px-3 py-2.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("scenes")}</h2>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)} aria-label={t("add_scene")}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {scenes.map((scene, i) => {
            const lock = locks[scene.id];
            const lockedByOther = lock != null && lock.connectionId !== myConnId;
            const isStart = snapshot.settings.startScene === scene.id;
            return (
              <div
                key={scene.id}
                className={`group mb-1 rounded-lg border p-2 ${
                  selected?.id === scene.id
                    ? "border-[var(--ull-primary)] bg-[var(--ull-surface-2)]"
                    : "border-transparent hover:bg-[var(--ull-surface-2)]"
                }`}
              >
                <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => editor.select(scene.id)}>
                  {scene.mediaId != null ? (
                    <img src={`/api/v1/media/${scene.mediaId}/derived/thumb`} alt="" className="h-9 w-14 rounded object-cover" loading="lazy"
                      onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                  ) : (
                    <span className="flex h-9 w-14 items-center justify-center rounded bg-[var(--ull-surface-2)] text-[var(--ull-text-dim)]">
                      <ImageIcon className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{scene.title}</span>
                    <span className="flex items-center gap-1 text-[11px] text-[var(--ull-text-dim)]">
                      {isStart && <Badge tone="ok">Inicio</Badge>}
                      {scene.type !== "image" && <Badge>{scene.type}</Badge>}
                      {lockedByOther && (
                        <Tooltip content={t("scene_locked", { name: lock.name })}>
                          <Lock className="h-3 w-3 text-[var(--ull-accent)]" />
                        </Tooltip>
                      )}
                    </span>
                  </span>
                </button>
                {canEdit && (
                  <div className="mt-1 hidden justify-end gap-0.5 group-hover:flex">
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Subir" disabled={i === 0} onClick={() => move(scene.id, -1)}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Bajar" disabled={i === scenes.length - 1} onClick={() => move(scene.id, 1)}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t("delete")} onClick={() => remove(scene.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {scenes.length === 0 && <p className="p-3 text-[13px] text-[var(--ull-text-dim)]">{t("add_scene")}</p>}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {selected != null ? (
          <ViewerPane key={selected.id} project={project} sceneId={selected.id} canEdit={canEdit} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--ull-text-dim)]">{t("no_projects")}</div>
        )}
      </div>

      {selected != null && (
        <aside className="w-80 overflow-y-auto border-l border-[var(--ull-border)] bg-[var(--ull-surface)]">
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

// ---------------------------------------------------------------------------
// Previsualizacion WYSIWYG (el propio Viewer en modo edicion §3.4)
// ---------------------------------------------------------------------------

export type PlacementMode =
  | { kind: "none" }
  | { kind: "hotspot"; type: string }
  | { kind: "polygon"; points: { yaw: number; pitch: number }[] };

let placementListeners: ((mode: PlacementMode) => void)[] = [];
let currentPlacement: PlacementMode = { kind: "none" };

export function setPlacementMode(mode: PlacementMode): void {
  currentPlacement = mode;
  for (const l of placementListeners) l(mode);
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
      if (tour.scenes.length === 0) return;
      if (!tour.scenes.some((s) => s.id === sceneId)) {
        // Escena sin medios aun: nada que previsualizar
        return;
      }
      tour.start = { scene: sceneId, intro: "none" };
      const mounted = mountViewer({
        container: containerRef.current,
        tour,
        baseUrl: `/api/v1/projects/${project.id}/preview`,
        editMode: true,
        deepLinks: false,
        analyticsEndpoint: null,
      });
      skinRef.current = mounted;
      mounted.viewer.on("viewChange", (v) => {
        lastView = v;
      });
      // Colocacion de hotspots haciendo clic (§3.4)
      const stage = containerRef.current.querySelector<HTMLElement>("div");
      containerRef.current.addEventListener("click", (e) => {
        const mode = placementRef.current;
        if (mode.kind === "none") return;
        const view = mounted.viewer.marzipanoViewer().view();
        const rect = containerRef.current!.getBoundingClientRect();
        const coords = view?.screenToCoordinates?.({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        if (coords == null) return;
        e.stopPropagation();
        if (mode.kind === "hotspot") {
          const id = clientId();
          editor.apply((draft) => {
            draft.hotspots.push({
              id,
              sceneId,
              type: mode.type,
              positionJson: JSON.stringify({ yaw: coords.yaw, pitch: coords.pitch }),
              styleJson: null,
              contentJson: JSON.stringify(defaultContent(mode.type, draft.scenes.filter((s) => s.id !== sceneId)[0]?.id)),
              conditionsJson: null,
              sort: draft.hotspots.filter((h) => h.sceneId === sceneId).length,
            });
          });
          editor.select(sceneId, id);
          setPlacementMode({ kind: "none" });
        } else if (mode.kind === "polygon") {
          setPlacementMode({ kind: "polygon", points: [...mode.points, { yaw: coords.yaw, pitch: coords.pitch }] });
        }
      });
      containerRef.current.addEventListener("dblclick", () => {
        const mode = placementRef.current;
        if (mode.kind === "polygon" && mode.points.length >= 3) {
          const id = clientId();
          editor.apply((draft) => {
            draft.hotspots.push({
              id,
              sceneId,
              type: "polygon",
              positionJson: JSON.stringify({
                yaw: mode.points[0]!.yaw,
                pitch: mode.points[0]!.pitch,
                points: mode.points,
              }),
              styleJson: null,
              contentJson: JSON.stringify({ altText: "Poligono" }),
              conditionsJson: null,
              sort: 0,
            });
          });
          editor.select(sceneId, id);
          setPlacementMode({ kind: "none" });
        }
      });
      // Seleccion de hotspot al hacer clic sobre el marcador en modo edicion
      mounted.viewer.on("hotspotActivate", (e) => {
        mounted.panelHost.close();
        editor.select(sceneId, e.hotspot.id);
      });
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setCompiling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, sceneId]);

  // Remontar al cambiar de escena o tras guardado
  const saving = useEditor((s) => s.saving);
  const dirty = useEditor((s) => s.dirty);
  useEffect(() => {
    void remount();
    return () => {
      skinRef.current?.destroy();
      skinRef.current = null;
    };
  }, [remount]);
  useEffect(() => {
    if (saving === "saved" && !dirty) void remount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, dirty]);

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="absolute inset-0 bg-[#0b1020]" />
      {placement.kind !== "none" && (
        <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-[var(--ull-primary)] px-4 py-1.5 text-[13px] text-white shadow-lg">
          {placement.kind === "polygon" ? t("polygon_hint") : t("hotspot_place_hint")}
          <button type="button" className="ml-3 underline" onClick={() => setPlacementMode({ kind: "none" })}>
            {t("cancel")}
          </button>
        </div>
      )}
      {compiling && (
        <div className="absolute right-3 top-3 z-40 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{t("loading")}</div>
      )}
      {issues.length > 0 && (
        <details className="absolute bottom-3 left-3 z-40 max-w-md rounded-lg bg-black/70 p-2 text-xs text-white">
          <summary className="cursor-pointer">
            {t("issues")} ({issues.length})
          </summary>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {issues.map((issue, i) => (
              <li key={i} className={issue.severity === "error" ? "text-red-300" : "text-amber-200"}>
                {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {canEdit && (
        <div className="absolute bottom-3 right-3 z-40">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const v = getCurrentEditorView();
              editor.apply((draft) => {
                const scene = draft.scenes.find((s) => s.id === sceneId);
                if (scene != null) scene.initialViewJson = JSON.stringify(v);
              });
            }}
          >
            <Crosshair className="h-4 w-4" /> {t("use_current_view")}
          </Button>
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
      return { body: "Texto...", altText: "Informacion" };
    case "image":
      return { url: "", altText: "Imagen" };
    case "gallery":
      return { items: [], altText: "Galeria" };
    case "videoFile":
      return { url: "", mode: "lightbox", altText: "Video" };
    case "embedVideo":
      return { provider: "youtube", videoId: "", nocookie: true, altText: "Video" };
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
          { id: "a", text: "Opcion A", correct: true },
          { id: "b", text: "Opcion B" },
        ],
        points: 1,
        altText: "Pregunta",
      };
    case "tooltip":
      return { text: "Etiqueta", permanent: true };
    case "link":
      return { url: "https://", altText: "Enlace" };
    case "state":
      return { actions: [{ var: "visitado", op: "set", value: true }], altText: "Accion" };
    default:
      return {};
  }
}
