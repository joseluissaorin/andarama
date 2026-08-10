import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Crosshair, DoorOpen, RotateCcw } from "lucide-react";
import { Button, Spinner, Tooltip, useToast } from "@ull360/ui";
import { mountViewer, type MountedSkin } from "@ull360/viewer-ui";
import type { Tour } from "@ull360/schema";
import { api } from "../api";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { arrivalsOf, setArrivalView, type Arrival } from "./arrivals";
import type { ProjectInfo } from "./EditorPage";

/**
 * Recorrer el tour antes de publicarlo.
 *
 * Es el borrador entero navegable —los mismos hotspots, el mismo minimapa, el
 * mismo modo VR—, servido desde la previsualización del proyecto, sin publicar
 * nada.
 *
 * Y es, además, el sitio donde de verdad se ajustan las llegadas: cuando entras
 * en una sala mirando a una pared, el momento de arreglarlo es ese. Como aquí
 * se sabe de dónde vienes, basta girar hasta lo que quieres que se vea y
 * guardar esa llegada.
 */
export function PreviewView({ project, canEdit }: { project: ProjectInfo; canEdit: boolean }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const editor = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const skinRef = useRef<MountedSkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<{ severity: string; message: string }[]>([]);
  /** Escena en la que estamos y de cuál venimos, que es lo que define la llegada. */
  const [aqui, setAqui] = useState<{ sceneId: string; fromId: string | null }>({ sceneId: "", fromId: null });
  const anterior = useRef<string | null>(null);

  const montar = useCallback(async (): Promise<void> => {
    if (containerRef.current == null) return;
    setLoading(true);
    try {
      const { tour, issues: compileIssues } = await api<{ tour: Tour; issues: { severity: string; message: string }[] }>(
        `/projects/${project.id}/compile`,
        { method: "POST", body: {} },
      );
      setIssues(compileIssues);
      skinRef.current?.destroy();
      skinRef.current = null;
      if (tour.scenes.length === 0) return;
      anterior.current = null;
      const mounted = mountViewer({
        container: containerRef.current,
        tour,
        baseUrl: `/api/v1/projects/${project.id}/preview`,
        // Sin editMode: aquí se navega y se pulsa como lo hará el visitante
        deepLinks: false,
        analyticsEndpoint: null,
      });
      skinRef.current = mounted;
      setAqui({ sceneId: tour.start.scene, fromId: null });
      // El propio evento dice de dónde se viene, que es lo que define la
      // llegada: la misma sala tiene una entrada distinta por cada camino.
      mounted.viewer.on("sceneChange", (e) => {
        anterior.current = e.scene.id;
        setAqui({ sceneId: e.scene.id, fromId: e.previous?.id ?? null });
      });
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setLoading(false);
    }
  }, [project.id, toast]);

  useEffect(() => {
    void montar();
    return () => {
      skinRef.current?.destroy();
      skinRef.current = null;
    };
  }, [project.id]);

  const snapshot = editor.snapshot!;
  const llegada: Arrival | null = (() => {
    if (aqui.sceneId === "") return null;
    const lista = arrivalsOf(snapshot, aqui.sceneId);
    if (aqui.fromId == null) return lista.find((a) => a.kind === "start") ?? null;
    return lista.find((a) => a.fromSceneId === aqui.fromId) ?? null;
  })();
  const tituloEscena = snapshot.scenes.find((s) => s.id === aqui.sceneId)?.title ?? "";
  const errores = issues.filter((i) => i.severity === "error");

  const guardarLlegada = (): void => {
    const viewer = skinRef.current?.viewer;
    if (viewer == null || llegada == null) return;
    const v = viewer.view();
    editor.apply((draft) => setArrivalView(draft, aqui.sceneId, llegada, { yaw: v.yaw, pitch: v.pitch, fov: v.fov }));
    toast.push(
      llegada.kind === "start" ? t("arrival_saved_start") : t("arrival_saved_from", { name: llegada.fromTitle }),
      "ok",
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ull-border)] bg-[var(--ull-surface)] px-3 py-1.5">
        <span className="text-[13px] font-semibold">{t("preview")}</span>
        <span className="text-[13px] text-[var(--ull-text-dim)]">{t("preview_hint")}</span>
        <div className="flex-1" />
        {errores.length > 0 && (
          <Tooltip content={errores.map((i) => i.message).join(" · ")}>
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("preview_blockers", { n: String(errores.length) })}
            </span>
          </Tooltip>
        )}
        <Tooltip content={t("preview_restart")}>
          <Button size="sm" variant="ghost" aria-label={t("preview_restart")} onClick={() => void montar()}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--ull-bg)]/70">
            <Spinner />
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* La barra de llegada: se corrige lo que se acaba de ver mal */}
      {canEdit && llegada != null && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ull-border)] bg-[var(--ull-surface)] px-3 py-2">
          <DoorOpen className="h-4 w-4 shrink-0 text-[var(--ull-text-dim)]" />
          <span className="text-[13px]">
            {llegada.kind === "start"
              ? t("preview_here_start", { scene: tituloEscena })
              : t("preview_here_from", { scene: tituloEscena, from: llegada.fromTitle })}
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={guardarLlegada}>
            <Crosshair className="h-4 w-4" />
            {llegada.kind === "start" ? t("preview_save_start") : t("preview_save_from", { name: llegada.fromTitle })}
          </Button>
        </div>
      )}
    </div>
  );
}
