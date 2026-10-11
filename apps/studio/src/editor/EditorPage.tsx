import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  GitBranch,
  History,
  Pencil,
  Languages as LanguagesIcon,
  Map as MapIcon,
  MessageSquare,
  Package,
  PlayCircle,
  Radio,
  Redo2,
  Settings2,
  Share2,
  Undo2,
  UploadCloud,
  Users,
} from "lucide-react";
import { Badge, Button, Input, Spinner, Tooltip, useToast } from "@andarama/ui";
import { api } from "../api";
import { useAuth, useEditor, type EditorSnapshot } from "../stores";
import { useT } from "../i18n";
import { loadSnapshot, SaveConflictError, syncSnapshot } from "./editorApi";
import { createAutosaver } from "./autosave";
import type { VersionBook } from "./collab/merge";
import { createRemoteSync, type RemoteSync } from "./collab/sync";
import { useCollaboration } from "./collab/useCollaboration";
import { PresenceBar } from "./collab/PresenceBar";
import { useCollab } from "./collab/store";
import { ScenesView } from "./ScenesView";
import { GRAPH_MODES, GraphView, type GraphMode } from "./GraphView";
import { PreviewView } from "./PreviewView";
import { MediaDock } from "./MediaDock";
import { PickerTourContext } from "./MediaPicker";
import { TranslationsView } from "./TranslationsView";
import { TourSettingsView } from "./TourSettingsView";
import { AnalyticsView } from "./AnalyticsView";
import { CommentsView } from "./CommentsView";
import { VersionsView } from "./VersionsView";
import { ExportDialog, LiveDialog, PublishDialog, ShareDialog } from "./dialogs";
import type { GalleryInfo } from "./gallery";
import { CommandPalette } from "./CommandPalette";
import { PeopleDialog } from "./PeopleDialog";
import { CriaturaCameo } from "../components/Criatura";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { OnboardingChecklist, ONBOARDING_KEY } from "../components/Onboarding";

export interface ProjectInfo {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  permissions: { canEdit: boolean; canPublish: boolean; canManage: boolean; role: string };
  /** Prueba caducada o sin plan: el editor abre en solo lectura (exportar sigue libre). */
  planLocked?: boolean;
  /** Tour de ejemplo clonado al dar de alta. */
  isSample?: boolean;
  /** Último guardado del tour (cualquier cambio de contenido lo mueve). */
  updatedAt?: number;
  publication: { slug: string; visibility: string; hasPassword: boolean; kiosk?: boolean; publishedAt?: number; gallery?: GalleryInfo | null } | null;
}

type EditorTab = "scenes" | "graph" | "preview" | "translations" | "settings" | "analytics" | "comments" | "versions";

const TAB_IDS: EditorTab[] = ["scenes", "graph", "preview", "translations", "settings", "analytics", "comments", "versions"];

export function EditorPage(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { projectId } = useParams({ from: "/p/$projectId" });
  const editor = useEditor();
  const { me, refresh } = useAuth();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  // La URL se lee **al montar**, antes de que el efecto que la mantiene al día
  // la reescriba. Leyéndola después de cargar el tour ya no quedaba nada: el
  // enlace a una pestaña concreta siempre acababa en Escenas.
  const entryParams = useRef(new URLSearchParams(location.search));
  const [tab, setTab] = useState<EditorTab>(() => {
    const raw = entryParams.current.get("tab");
    if (raw === "floorplan") return "graph";
    return raw != null && TAB_IDS.includes(raw as EditorTab) ? (raw as EditorTab) : "scenes";
  });
  const [graphMode, setGraphMode] = useState<GraphMode>(() => {
    // El plano dejó de ser una pestaña: ahora es un modo del grafo, y los
    // enlaces antiguos tienen que seguir llevando a donde llevaban.
    if (entryParams.current.get("tab") === "floorplan") return "plan";
    const raw = entryParams.current.get("mode");
    return raw != null && GRAPH_MODES.includes(raw as GraphMode) ? (raw as GraphMode) : "scenes";
  });
  const [dialog, setDialog] = useState<"publish" | "export" | "share" | "live" | "people" | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Título en edición (null = no se está renombrando). */
  const [renaming, setRenaming] = useState<string | null>(null);
  const lastSyncError = useRef<string | null>(null);
  const syncedRef = useRef<EditorSnapshot | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Versión conocida de cada escena, punto y de los ajustes (edición en grupo). */
  const versionsRef = useRef<VersionBook>(new Map());
  /** Cambios de otras personas: avisos de la sala y resincronización. */
  const remoteRef = useRef<RemoteSync | null>(null);
  /** Hay cambios guardados que el recorrido publicado todavía no tiene. */
  const [unpublished, setUnpublished] = useState(false);
  /** Se ha guardado algo en esta visita (la pista solo sale tras editar). */
  const savedSinceLoad = useRef(false);
  const queryClient = useQueryClient();

  // Añadir un punto o una escena cuenta en los primeros pasos: se vuelve a
  // preguntar al guardar (la consulta se cachea, no se pide en cada tecla)
  useEffect(() => {
    if (editor.saving === "saved") void queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY });
  }, [editor.saving, queryClient]);

  // Carga inicial (restaurando pestaña y escena desde la URL)
  useEffect(() => {
    void refresh();
    void loadSnapshot(projectId)
      .then(({ snapshot, project: p, versions }) => {
        syncedRef.current = structuredClone(snapshot);
        versionsRef.current.clear();
        for (const [k, v] of versions) versionsRef.current.set(k, v);
        editor.load(projectId, snapshot);
        const info = p as unknown as ProjectInfo;
        setProject(info);
        // Publicar también mueve updatedAt un instante después: se deja margen
        const publishedAt = info.publication?.publishedAt;
        setUnpublished(publishedAt != null && info.updatedAt != null && info.updatedAt > publishedAt + 2000);
        // La escena sí necesita el tour cargado para saber si existe
        const urlScene = entryParams.current.get("scene");
        if (urlScene != null && snapshot.scenes.some((s) => s.id === urlScene)) {
          useEditor.getState().select(urlScene);
        }
      })
      .catch((err) => {
        toast.push(String(err instanceof Error ? err.message : err), "error");
        void navigate({ to: "/" });
      });
  }, [projectId]);

  // Pestaña y escena activas en la URL (recargar o compartir no pierde el sitio)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (tab === "scenes") params.delete("tab");
    else params.set("tab", tab);
    if (tab !== "graph" || graphMode === "scenes") params.delete("mode");
    else params.set("mode", graphMode);
    if (editor.selectedSceneId == null) params.delete("scene");
    else params.set("scene", editor.selectedSceneId);
    const qs = params.toString();
    history.replaceState(null, "", `${location.pathname}${qs === "" ? "" : `?${qs}`}`);
  }, [tab, graphMode, editor.selectedSceneId]);

  // Autosave con indicador (§3.5). Un solo guardado a la vez, y solo se da
  // por guardado si nadie editó mientras volaba la petición (autosave.ts).
  const autosaver = useMemo(
    () =>
      createAutosaver<EditorSnapshot>({
        store: {
          current: () => {
            const s = useEditor.getState();
            return { snapshot: s.snapshot, dirty: s.dirty };
          },
          markSaved: (saved) => useEditor.getState().markSaved(saved),
          setSaving: (status) => useEditor.getState().setSaving(status),
        },
        base: () => syncedRef.current,
        setBase: (saved) => {
          syncedRef.current = saved;
        },
        save: (base, target) =>
          syncSnapshot(projectId, base, target, {
            versions: versionsRef.current,
            connectionId: () => useCollab.getState().connectionId,
          }),
        clone: (s) => structuredClone(s),
        // Otra persona guardó lo mismo antes: se trae, se fusiona sin perder lo
        // que se está escribiendo y se vuelve a guardar
        isConflict: (err) => err instanceof SaveConflictError,
        resolveConflict: async () => {
          await remoteRef.current?.resync(true);
        },
        resync: async () => {
          await remoteRef.current?.resync(true);
        },
        onSaved: () => {
          lastSyncError.current = null;
          // Los demás se enteran por la API, que avisa a la sala tras guardar
          savedSinceLoad.current = true;
          setUnpublished(true);
        },
        onError: (err) => {
          console.error(err);
          // Un guardado que falla en silencio es lo peor que puede pasar: se
          // sigue editando sobre nada y al publicar faltan cosas. Se avisa una
          // vez por error distinto para no llenar la pantalla en cada reintento.
          const message = String(err instanceof Error ? err.message : err);
          if (lastSyncError.current !== message) {
            lastSyncError.current = message;
            toast.push(t("save_failed", { error: message }), "error");
          }
        },
      }),
    [projectId],
  );
  const remote = useMemo(
    () =>
      createRemoteSync({
        projectId,
        autosaver: () => autosaver,
        base: syncedRef,
        versions: versionsRef.current,
        onProject: (p) => applyProjectInfo(p),
      }),
    [projectId, autosaver],
  );
  remoteRef.current = remote;

  /** Datos del proyecto leídos de nuevo (otra persona publicó, renombró...). */
  const applyProjectInfo = (p: Record<string, unknown>): void => {
    const info = p as unknown as ProjectInfo;
    setProject((prev) => (prev != null ? { ...prev, title: info.title, publication: info.publication, permissions: info.permissions ?? prev.permissions } : prev));
    const publishedAt = info.publication?.publishedAt;
    setUnpublished(publishedAt != null && info.updatedAt != null && info.updatedAt > publishedAt + 2000);
  };

  // Edición en grupo (§3.5): presencia, bloqueos blandos y cambios en directo
  useCollaboration({
    projectId,
    enabled: me?.user != null && project?.permissions.canEdit === true,
    myUserId: me?.user?.id ?? null,
    tab,
    remote,
    onProject: (patch) => {
      if (patch.title != null) setProject((prev) => (prev != null ? { ...prev, title: patch.title! } : prev));
      if (patch.reload === true) void api<Record<string, unknown>>(`/projects/${projectId}`).then(applyProjectInfo).catch(() => {});
    },
    onLostSelection: (by) => toast.push(t("collab_deleted_by", { name: by ?? t("collab_someone") }), "info"),
  });

  const doSync = useCallback(async (): Promise<void> => {
    if (syncTimer.current != null) clearTimeout(syncTimer.current);
    await autosaver.sync();
  }, [autosaver]);

  /** Publicar compila desde la base de datos: antes hay que guardar todo lo pendiente. */
  const flushSync = useCallback(async (): Promise<void> => {
    if (syncTimer.current != null) clearTimeout(syncTimer.current);
    try {
      await autosaver.flush();
    } catch {
      throw new Error(t("save_failed_short"));
    }
  }, [autosaver]);

  useEffect(() => {
    if (!editor.dirty) return;
    if (syncTimer.current != null) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void doSync(), 900);
    return () => {
      if (syncTimer.current != null) clearTimeout(syncTimer.current);
    };
  }, [editor.dirty, editor.snapshot, doSync]);

  // Al ocultar la pestaña, cerrarla o salir del editor se guarda en el acto:
  // en el móvil la página puede morir sin volver a ver la luz, y esperar al
  // temporizador perdía el último cambio.
  useEffect(() => {
    const flushNow = (): void => {
      if (useEditor.getState().dirty) void doSync();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") flushNow();
    };
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", onVisibility);
      // Desmontar (volver a la lista, cambiar de tour) también guarda
      flushNow();
    };
  }, [doSync]);

  // Cambios guardados que aún no están en el recorrido publicado: una pista
  // discreta una sola vez por sesión y tour, y una marca fija junto a Publicar.
  useEffect(() => {
    if (!unpublished || !savedSinceLoad.current || project?.publication == null) return;
    const key = `andarama:republish-hint:${projectId}`;
    try {
      if (sessionStorage.getItem(key) != null) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Sin sessionStorage (modo privado estricto): se avisa igual una vez
    }
    toast.push(t("republish_hint"), "info");
  }, [unpublished, project?.publication, projectId]);

  // Atajos de teclado (§3.5)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing) return;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
      } else if (meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        editor.redo();
      } else if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSync();
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        // Alt+flechas: escena anterior/siguiente sin tocar el ratón
        e.preventDefault();
        const state = useEditor.getState();
        const list = state.snapshot?.scenes ?? [];
        if (list.length === 0) return;
        const idx = list.findIndex((s) => s.id === state.selectedSceneId);
        const next = list[(idx + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length];
        if (next != null) state.select(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSync]);

  if (editor.snapshot == null || project == null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const canEdit = project.permissions.canEdit;

  /** Renombrar el tour desde su propia cabecera: era imposible desde el editor. */
  const commitRename = async (): Promise<void> => {
    const title = renaming?.trim() ?? "";
    setRenaming(null);
    if (title === "" || title === project.title) return;
    try {
      await api(`/projects/${project.id}`, { method: "PATCH", body: { title } });
      setProject({ ...project, title });
      toast.push(t("renamed"), "ok");
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };

  const TABS: { id: EditorTab; icon: React.ReactNode; label: string }[] = [
    { id: "scenes", icon: <MapIcon className="h-4 w-4" />, label: t("scenes") },
    { id: "graph", icon: <GitBranch className="h-4 w-4" />, label: t("graph") },
    { id: "preview", icon: <PlayCircle className="h-4 w-4" />, label: t("preview") },
    { id: "translations", icon: <LanguagesIcon className="h-4 w-4" />, label: t("translations") },
    { id: "settings", icon: <Settings2 className="h-4 w-4" />, label: t("settings") },
    { id: "analytics", icon: <BarChart3 className="h-4 w-4" />, label: t("analytics") },
    { id: "comments", icon: <MessageSquare className="h-4 w-4" />, label: t("comments") },
    { id: "versions", icon: <History className="h-4 w-4" />, label: t("versions") },
  ];

  return (
    <PickerTourContext.Provider value={project.id}>
    <div className="flex h-full flex-col bg-[var(--anda-bg)]">
      <header className="anda-barra flex items-center gap-2 px-3 py-2">
        <Tooltip content={t("projects")}>
          <Button variant="ghost" size="icon" aria-label={t("projects")} onClick={() => void navigate({ to: "/" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Tooltip>
        {renaming != null ? (
          <Input
            autoFocus
            aria-label={t("rename_tour")}
            className="h-8 w-64 text-[15px] font-semibold"
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              else if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <button
            type="button"
            className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 text-left hover:bg-[var(--anda-surface-2)] disabled:hover:bg-transparent"
            title={canEdit ? t("rename_tour") : undefined}
            aria-label={canEdit ? `${t("rename_tour")}: ${project.title}` : project.title}
            disabled={!canEdit}
            onClick={() => setRenaming(project.title)}
          >
            <h1 className="max-w-64 truncate text-[15px] font-semibold">{project.title}</h1>
            {canEdit && <Pencil className="h-3.5 w-3.5 shrink-0 text-[var(--anda-text-dim)] opacity-0 transition-opacity group-hover:opacity-100" />}
          </button>
        )}
        <span
          className={`text-xs ${editor.saving === "error" ? "font-semibold text-[var(--anda-danger)]" : "text-[var(--anda-text-dim)]"}`}
          title={editor.saving === "error" ? t("save_failed_short") : undefined}
        >
          {editor.saving === "saving" ? t("saving") : editor.saving === "error" ? t("save_failed_short") : editor.dirty ? "..." : t("saved")}
        </span>
        <PresenceBar
          onGoTo={(u) => {
            // Ir a donde está: su escena, o su pestaña si no está en Escenas
            if (u.tab != null && u.tab !== "scenes" && TAB_IDS.includes(u.tab as EditorTab)) setTab(u.tab as EditorTab);
            else if (u.sceneId != null) {
              setTab("scenes");
              editor.select(u.sceneId);
            }
          }}
        />
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <Tooltip content={`${t("undo")} (Ctrl+Z)`}>
            <Button variant="ghost" size="icon" aria-label={t("undo")} disabled={editor.undoStack.length === 0} onClick={editor.undo}>
              <Undo2 className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content={`${t("redo")} (Ctrl+Shift+Z)`}>
            <Button variant="ghost" size="icon" aria-label={t("redo")} disabled={editor.redoStack.length === 0} onClick={editor.redo}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
        {project.publication != null && (
          <a href={`/t/${project.publication.slug}`} target="_blank" rel="noopener noreferrer">
            <Badge tone="ok">{t("published")}</Badge>
          </a>
        )}
        {project.publication != null && unpublished && (
          <Tooltip content={t("republish_hint")}>
            <span tabIndex={0} aria-label={`${t("unpublished_changes")}. ${t("republish_hint")}`}>
              <Badge tone="warn">{t("unpublished_changes")}</Badge>
            </span>
          </Tooltip>
        )}
        <Tooltip content={t("people_title")}>
          <Button variant="ghost" size="icon" aria-label={t("people")} onClick={() => setDialog("people")}>
            <Users className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content={t("live_tour")}>
          <Button variant="ghost" size="icon" aria-label={t("live_tour")} onClick={() => setDialog("live")}>
            <Radio className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content={t("share")}>
          <Button variant="ghost" size="icon" aria-label={t("share")} onClick={() => setDialog("share")} disabled={project.publication == null}>
            <Share2 className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={() => setDialog("export")}>
          <Package className="h-4 w-4" /> {t("export")}
        </Button>
        {project.permissions.canPublish && (
          <Button size="sm" onClick={() => setDialog("publish")}>
            <UploadCloud className="h-4 w-4" /> {project.publication != null ? t("republish") : t("publish")}
          </Button>
        )}
      </header>

      {project.planLocked === true && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--anda-primary)] bg-[var(--anda-primary-soft)] px-4 py-2 text-[13px] font-medium">
          <Lock className="h-4 w-4 shrink-0 text-[var(--anda-primary-ink)]" aria-hidden="true" />
          <span className="flex-1">{t("editor_plan_locked")}</span>
          <Link to="/plan" className="font-semibold text-[var(--anda-primary-ink)] hover:underline">
            {t("plan_trial_cta")}
          </Link>
        </div>
      )}
      {project.planLocked !== true && <OnboardingChecklist compact />}

      <nav className="anda-barra flex px-3 py-2" aria-label={t("a11y_editor_views")}>
        {/* El raíl hundido y la pestaña elegida como tecla ámbar: el mismo
            relieve del botón principal, aquí en pequeño. */}
        <div className="anda-pestanas overflow-x-auto">
          {TABS.map(({ id, icon, label }) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
              {icon}
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main id="contenido" className="flex min-h-0 flex-1 flex-col">
        {/* Escenas y grafo comparten el panel de biblioteca: es donde se
            arrastran los panoramas para convertirlos en escenas. */}
        <div className="min-h-0 flex-1">
        {tab === "scenes" && (
          <ScenesView
            project={project}
            canEdit={canEdit}
            onOpenFloorplan={() => {
              setGraphMode("plan");
              setTab("graph");
            }}
          />
        )}
        {tab === "graph" && (
          <GraphView
            canEdit={canEdit}
            mode={graphMode}
            onModeChange={setGraphMode}
            onOpenScene={(sceneId, hotspotId) => {
              setTab("scenes");
              editor.select(sceneId, hotspotId ?? null);
            }}
          />
        )}
        {tab === "preview" && <PreviewView project={project} canEdit={canEdit} />}
        {tab === "translations" && <TranslationsView project={project} canEdit={canEdit} />}
        {tab === "settings" && <TourSettingsView project={project} canEdit={canEdit} />}
        {tab === "analytics" && <AnalyticsView project={project} />}
        {tab === "comments" && <CommentsView project={project} />}
        {tab === "versions" && <VersionsView project={project} />}
        </div>
        {(tab === "scenes" || tab === "graph") && (
          <MediaDock orgId={project.orgId} projectId={project.id} projectTitle={project.title} canEdit={canEdit} />
        )}
      </main>

      <PublishDialog
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
        project={project}
        beforePublish={flushSync}
        onPublished={(pub) => {
          setUnpublished(false);
          setProject((p) => (p != null ? { ...p, publication: pub } : p));
        }}
      />
      <ExportDialog open={dialog === "export"} onClose={() => setDialog(null)} project={project} />
      <ShareDialog open={dialog === "share"} onClose={() => setDialog(null)} project={project} />
      <PeopleDialog open={dialog === "people"} onClose={() => setDialog(null)} project={project} />
      <LiveDialog open={dialog === "live"} onClose={() => setDialog(null)} project={project} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAction={(action) => {
          setPaletteOpen(false);
          if (action.kind === "tab") {
            setTab(action.tab as EditorTab);
            if (action.mode != null && GRAPH_MODES.includes(action.mode as GraphMode)) setGraphMode(action.mode as GraphMode);
          }
          else if (action.kind === "scene") {
            setTab("scenes");
            editor.select(action.sceneId!);
          } else if (action.kind === "dialog") setDialog(action.dialog as never);
          else if (action.kind === "undo") editor.undo();
          else if (action.kind === "redo") editor.redo();
        }}
      />
      {/* De vez en cuando la criatura cruza el editor y se va. No hace nada:
          está de paso. */}
      <CriaturaCameo />
    </div>
    </PickerTourContext.Provider>
  );
}
