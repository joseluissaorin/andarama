import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  GitBranch,
  History,
  Languages as LanguagesIcon,
  Map as MapIcon,
  MessageSquare,
  Package,
  Radio,
  Redo2,
  Settings2,
  Share2,
  Undo2,
  UploadCloud,
} from "lucide-react";
import { Badge, Button, Spinner, Tooltip, useToast } from "@ull360/ui";
import { useAuth, useEditor, type EditorSnapshot } from "../stores";
import { useT } from "../i18n";
import { loadSnapshot, syncSnapshot } from "./editorApi";
import { ScenesView } from "./ScenesView";
import { GraphView } from "./GraphView";
import { FloorplanView } from "./FloorplanView";
import { TranslationsView } from "./TranslationsView";
import { TourSettingsView } from "./TourSettingsView";
import { AnalyticsView } from "./AnalyticsView";
import { CommentsView } from "./CommentsView";
import { VersionsView } from "./VersionsView";
import { ExportDialog, LiveDialog, PublishDialog, ShareDialog } from "./dialogs";
import { CommandPalette } from "./CommandPalette";

export interface ProjectInfo {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  permissions: { canEdit: boolean; canPublish: boolean; canManage: boolean; role: string };
  publication: { slug: string; visibility: string; hasPassword: boolean } | null;
}

type EditorTab = "scenes" | "graph" | "floorplan" | "translations" | "settings" | "analytics" | "comments" | "versions";

export function EditorPage(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { projectId } = useParams({ from: "/p/$projectId" });
  const editor = useEditor();
  const { me, refresh } = useAuth();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [tab, setTab] = useState<EditorTab>("scenes");
  const [dialog, setDialog] = useState<"publish" | "export" | "share" | "live" | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [presence, setPresence] = useState<{ users: { connectionId: string; name: string; sceneId: string | null }[]; locks: Record<string, { connectionId: string; name: string }> }>({ users: [], locks: {} });
  const syncedRef = useRef<EditorSnapshot | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connIdRef = useRef<string | null>(null);

  // Carga inicial (restaurando pestaña y escena desde la URL)
  useEffect(() => {
    void refresh();
    void loadSnapshot(projectId)
      .then(({ snapshot, project: p }) => {
        syncedRef.current = structuredClone(snapshot);
        editor.load(projectId, snapshot);
        setProject(p as unknown as ProjectInfo);
        const params = new URLSearchParams(location.search);
        const urlTab = params.get("tab") as EditorTab | null;
        if (urlTab != null && ["scenes", "graph", "floorplan", "translations", "settings", "analytics", "comments", "versions"].includes(urlTab)) {
          setTab(urlTab);
        }
        const urlScene = params.get("scene");
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
    if (editor.selectedSceneId == null) params.delete("scene");
    else params.set("scene", editor.selectedSceneId);
    const qs = params.toString();
    history.replaceState(null, "", `${location.pathname}${qs === "" ? "" : `?${qs}`}`);
  }, [tab, editor.selectedSceneId]);

  // Autosave con indicador (§3.5)
  const doSync = useCallback(async (): Promise<void> => {
    const state = useEditor.getState();
    if (!state.dirty || state.snapshot == null || syncedRef.current == null) return;
    state.setSaving("saving");
    const target = structuredClone(state.snapshot);
    try {
      await syncSnapshot(projectId, syncedRef.current, target);
      syncedRef.current = target;
      state.setSaving("saved");
      state.markClean();
      wsRef.current?.send(JSON.stringify({ type: "changed" }));
    } catch (err) {
      state.setSaving("error");
      console.error(err);
    }
  }, [projectId]);

  useEffect(() => {
    if (!editor.dirty) return;
    if (syncTimer.current != null) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void doSync(), 900);
    return () => {
      if (syncTimer.current != null) clearTimeout(syncTimer.current);
    };
  }, [editor.dirty, editor.snapshot, doSync]);

  // Presencia y bloqueo blando (§3.5)
  useEffect(() => {
    if (me?.user == null) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/rt/project/${projectId}`);
    wsRef.current = ws;
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "hello", userId: me.user!.id, name: me.user!.name }));
    });
    ws.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(String(e.data)) as { type: string; [k: string]: unknown };
        if (msg.type === "presence") {
          const users = msg.users as { connectionId: string; userId: string; name: string; sceneId: string | null }[];
          const mine = users.find((u) => u.userId === me.user!.id && connIdRef.current == null);
          if (mine != null) connIdRef.current = mine.connectionId;
          setPresence({ users, locks: msg.locks as Record<string, { connectionId: string; name: string }> });
        }
      } catch {
        // mensaje invalido
      }
    });
    return () => ws.close();
  }, [projectId, me?.user?.id]);

  // Notificar escena seleccionada a la sala de presencia
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "scene", sceneId: editor.selectedSceneId }));
    }
  }, [editor.selectedSceneId]);

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

  const others = presence.users.filter((u) => u.connectionId !== connIdRef.current);
  const canEdit = project.permissions.canEdit;

  const TABS: { id: EditorTab; icon: React.ReactNode; label: string }[] = [
    { id: "scenes", icon: <MapIcon className="h-4 w-4" />, label: t("scenes") },
    { id: "graph", icon: <GitBranch className="h-4 w-4" />, label: t("graph") },
    { id: "floorplan", icon: <MapIcon className="h-4 w-4" />, label: t("floorplan") },
    { id: "translations", icon: <LanguagesIcon className="h-4 w-4" />, label: t("translations") },
    { id: "settings", icon: <Settings2 className="h-4 w-4" />, label: t("settings") },
    { id: "analytics", icon: <BarChart3 className="h-4 w-4" />, label: t("analytics") },
    { id: "comments", icon: <MessageSquare className="h-4 w-4" />, label: t("comments") },
    { id: "versions", icon: <History className="h-4 w-4" />, label: t("versions") },
  ];

  return (
    <div className="flex h-full flex-col bg-[var(--ull-bg)]">
      <header className="flex items-center gap-2 border-b border-[var(--ull-border)] bg-[var(--ull-surface)] px-3 py-2">
        <Tooltip content={t("projects")}>
          <Button variant="ghost" size="icon" aria-label={t("projects")} onClick={() => void navigate({ to: "/" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Tooltip>
        <h1 className="max-w-64 truncate text-[15px] font-semibold">{project.title}</h1>
        <span className="text-xs text-[var(--ull-text-dim)]">
          {editor.saving === "saving" ? t("saving") : editor.saving === "error" ? t("error") : editor.dirty ? "..." : t("saved")}
        </span>
        {others.length > 0 && (
          <div className="flex items-center gap-1" aria-label="Personas editando">
            {others.map((u) => (
              <Tooltip key={u.connectionId} content={`${u.name} (${t("presence_editing")})`}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ull-accent)] text-[11px] font-bold text-white">
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
              </Tooltip>
            ))}
          </div>
        )}
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

      <nav className="flex gap-1 border-b border-[var(--ull-border)] bg-[var(--ull-surface)] px-3 py-1.5" aria-label="Vistas del editor">
        {TABS.map(({ id, icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
              tab === id
                ? "bg-[var(--ull-primary-soft)] font-semibold text-[var(--ull-primary)]"
                : "text-[var(--ull-text-dim)] hover:bg-[var(--ull-surface-2)] hover:text-[var(--ull-text)]"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1">
        {tab === "scenes" && <ScenesView project={project} canEdit={canEdit} locks={presence.locks} myConnId={connIdRef.current} />}
        {tab === "graph" && (
          <GraphView
            canEdit={canEdit}
            onOpenScene={(sceneId, hotspotId) => {
              setTab("scenes");
              editor.select(sceneId, hotspotId ?? null);
            }}
          />
        )}
        {tab === "floorplan" && <FloorplanView project={project} canEdit={canEdit} />}
        {tab === "translations" && <TranslationsView project={project} canEdit={canEdit} />}
        {tab === "settings" && <TourSettingsView project={project} canEdit={canEdit} />}
        {tab === "analytics" && <AnalyticsView project={project} />}
        {tab === "comments" && <CommentsView project={project} />}
        {tab === "versions" && <VersionsView project={project} />}
      </div>

      <PublishDialog open={dialog === "publish"} onClose={() => setDialog(null)} project={project} onPublished={(pub) => setProject({ ...project, publication: pub })} />
      <ExportDialog open={dialog === "export"} onClose={() => setDialog(null)} project={project} />
      <ShareDialog open={dialog === "share"} onClose={() => setDialog(null)} project={project} />
      <LiveDialog open={dialog === "live"} onClose={() => setDialog(null)} project={project} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAction={(action) => {
          setPaletteOpen(false);
          if (action.kind === "tab") setTab(action.tab as EditorTab);
          else if (action.kind === "scene") {
            setTab("scenes");
            editor.select(action.sceneId!);
          } else if (action.kind === "dialog") setDialog(action.dialog as never);
          else if (action.kind === "undo") editor.undo();
          else if (action.kind === "redo") editor.redo();
        }}
      />
    </div>
  );
}
