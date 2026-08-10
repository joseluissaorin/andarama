import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, Check, GripVertical, MapPin, Trash2, UploadCloud, Wand2 } from "lucide-react";
import { Button, Dialog, Field, Input, Select, Spinner, Switch, useToast } from "@andarama/ui";
import { api } from "../api";
import { useT } from "../i18n";
import { uploadMedia } from "../upload";
import { deviceConcurrency, pooled } from "../pool";

/**
 * Importador de cámara 360 (§ingesta): sube un lote de fotos, permite
 * renombrarlas (inline o por patrón) y reordenarlas, colocarlas sobre el
 * plano del tour y crear las escenas de golpe, opcionalmente conectadas
 * en secuencia. Convierte el proceso más lento del flujo real (volcar la
 * cámara) en tres pasos guiados.
 */

interface WizardItem {
  key: string;
  file: File;
  name: string;
  previewUrl: string;
  status: "pending" | "uploading" | "done" | "error";
  percent: number;
  mediaId: string | null;
  error?: string;
  /** Posición sobre el plano (normalizada 0-1). */
  plan?: { x: number; y: number };
}

/** Área con plano: es lo que aquí se usa como planta donde colocar las fotos. */
interface Floorplan {
  id: string;
  title: string;
  url: string;
}

/**
 * Plantas del tour. Salen de las áreas con plano; los tours que todavía no se
 * han abierto en el editor nuevo conservan su lista de planos suelta.
 */
function floorplansOf(settings: { areas?: { id: string; title?: string; plan?: { url?: string } }[]; floorplans?: Floorplan[] } | undefined): Floorplan[] {
  const areas = settings?.areas ?? [];
  const fromAreas = areas
    .filter((a) => typeof a.plan?.url === "string" && a.plan.url !== "")
    .map((a) => ({ id: a.id, title: a.title ?? a.id, url: a.plan!.url! }));
  return fromAreas.length > 0 ? fromAreas : (settings?.floorplans ?? []);
}

export function ImportWizard({ orgId, open, onClose, project }: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  /**
   * Tour de destino cuando se abre desde el editor: ya se sabe a dónde van las
   * fotos, así que no se pregunta.
   */
  project?: { id: string; title: string };
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [items, setItems] = useState<WizardItem[]>([]);
  const [projectId, setProjectId] = useState(project?.id ?? "");
  const [pattern, setPattern] = useState("");
  const [connectSequence, setConnectSequence] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const projects = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api<{ id: string; title: string }[]>(`/projects?org=${orgId}`),
    enabled: open && project == null,
  });

  const projectDetail = useQuery({
    queryKey: ["project-detail", projectId],
    queryFn: () =>
      api<{ settings?: { areas?: { id: string; title?: string; plan?: { url?: string } }[]; floorplans?: Floorplan[] } }>(`/projects/${projectId}`),
    enabled: open && projectId !== "",
  });
  const floorplans = floorplansOf(projectDetail.data?.settings);
  const [floorplanId, setFloorplanId] = useState<string | null>(null);
  const floorplan = floorplans.find((f) => f.id === floorplanId) ?? floorplans[0] ?? null;

  const addFiles = (files: FileList | File[]): void => {
    const next: WizardItem[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))
      .map((f) => ({
        key: `${f.name}-${f.size}-${f.lastModified}`,
        file: f,
        name: f.name.replace(/\.[^.]+$/, ""),
        previewUrl: URL.createObjectURL(f),
        status: "pending" as const,
        percent: 0,
        mediaId: null,
      }));
    setItems((prev) => {
      const merged = [...prev];
      for (const item of next) if (!merged.some((m) => m.key === item.key)) merged.push(item);
      // Orden por fecha de captura (aproximada por mtime del fichero)
      merged.sort((a, b) => a.file.lastModified - b.file.lastModified);
      return merged;
    });
  };

  const applyPattern = (): void => {
    if (pattern.trim() === "") return;
    setItems((prev) => prev.map((item, i) => ({ ...item, name: pattern.replaceAll("{n}", String(i + 1)) })));
  };

  const uploadAll = async (): Promise<void> => {
    const queue = items.filter((i) => i.status === "pending" || i.status === "error");
    // Un volcado de cámara son decenas de fotos: se solapan unas cuantas para
    // que la red no espere a la GPU ni al revés.
    await pooled(
      queue.map((item) => async () => {
        setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, status: "uploading", percent: 0 } : x)));
        try {
          const result = await uploadMedia(orgId, item.file, null, (p) => {
            setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, percent: p.percent } : x)));
          });
          const mediaId = result.id;
          const ext = item.file.name.split(".").pop() ?? "";
          await api(`/media/${mediaId}`, {
            method: "PATCH",
            body: { filename: `${item.name}.${ext}`, projectId: projectId || null },
          });
          setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, status: "done", percent: 100, mediaId } : x)));
        } catch (err) {
          setItems((prev) =>
            prev.map((x) => (x.key === item.key ? { ...x, status: "error", error: String(err instanceof Error ? err.message : err) } : x)),
          );
        }
      }),
      deviceConcurrency().files,
    );
    void queryClient.invalidateQueries({ queryKey: ["media"] });
  };

  const allUploaded = items.length > 0 && items.every((i) => i.status === "done");
  const nextUnplaced = items.find((i) => i.plan == null);

  const createScenes = async (): Promise<void> => {
    if (projectId === "") return;
    setCreating(true);
    try {
      const sceneIds: string[] = [];
      for (const item of items) {
        const res = await api<{ id: string }>(`/projects/${projectId}/scenes`, {
          method: "POST",
          body: { title: item.name, type: item.file.type.startsWith("video/") ? "video" : "image", mediaId: item.mediaId },
        });
        sceneIds.push(res.id);
        const map = item.plan != null && floorplan != null ? { floorplan: floorplan.id, x: item.plan.x, y: item.plan.y } : undefined;
        await api(`/projects/${projectId}/scenes/${res.id}`, {
          method: "PATCH",
          body: { map, meta: { thumbnail: `thumb:${item.mediaId}` } },
        });
      }
      if (connectSequence) {
        // Encadenar el recorrido crea hotspots de navegación de verdad: en el
        // panorama se ven y se pueden pulsar, y en el grafo son las aristas.
        const titles = new Map(items.map((it, i) => [sceneIds[i], it.name]));
        const step = async (from: string, to: string, mode: string, yaw: number): Promise<void> => {
          await api(`/projects/${projectId}/scenes/${from}/hotspots`, {
            method: "POST",
            body: {
              type: "navigation",
              position: { yaw, pitch: -0.17 },
              content: { target: to, label: titles.get(to) ?? "", entry: { mode }, unplaced: true },
            },
          });
        };
        for (let i = 0; i < sceneIds.length - 1; i++) {
          await step(sceneIds[i]!, sceneIds[i + 1]!, "relative", 0);
          await step(sceneIds[i + 1]!, sceneIds[i]!, "lookBack", Math.PI);
        }
      }
      setCreatedCount(sceneIds.length);
      toast.push(t("scenes_created", { count: String(sceneIds.length) }), "ok");
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setCreating(false);
    }
  };

  const reset = (): void => {
    for (const item of items) URL.revokeObjectURL(item.previewUrl);
    setItems([]);
    setStep(0);
    setCreatedCount(null);
    setPattern("");
    setProjectId(project?.id ?? "");
  };

  const steps = [t("import_step_files"), t("import_step_plan"), t("import_step_scenes")];

  const orderedForPlan = useMemo(() => items, [items]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      title={t("import_wizard")}
      wide
      footer={
        <div className="flex w-full items-center gap-2">
          <div className="flex items-center gap-1">
            {steps.map((label, i) => (
              <span
                key={label}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  step === i ? "bg-[var(--anda-primary)] text-white" : "bg-[var(--anda-surface-2)] text-[var(--anda-text-dim)]"
                }`}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
          <div className="flex-1" />
          {step > 0 && createdCount == null && (
            <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as 0 | 1)}>
              {t("back")}
            </Button>
          )}
          {step === 0 && (
            <Button disabled={!allUploaded || projectId === ""} onClick={() => setStep(floorplans.length > 0 ? 1 : 2)}>
              {t("continue")} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)}>
              {t("continue")} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 2 && createdCount == null && (
            <Button loading={creating} disabled={items.length === 0} onClick={() => void createScenes()}>
              <Check className="h-4 w-4" /> {t("create_n_scenes", { count: String(items.length) })}
            </Button>
          )}
          {createdCount != null && (
            <a href={`/studio/p/${projectId}`}>
              <Button>{t("open_in_editor")}</Button>
            </a>
          )}
        </div>
      }
    >
      {step === 0 && (
        <div
          className="space-y-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("target_project")} htmlFor="iw-project">
              {project != null ? (
                <p id="iw-project" className="min-w-56 rounded-lg bg-[var(--anda-surface-2)] px-3 py-2 text-sm font-medium">
                  {project.title}
                </p>
              ) : (
                <Select id="iw-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="min-w-56">
                  <option value="">—</option>
                  {(projects.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex-1" />
            <Field label={t("rename_pattern")} htmlFor="iw-pattern" hint={t("rename_pattern_hint")}>
              <div className="flex gap-1.5">
                <Input id="iw-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Planta 1 ({n})" className="w-48" />
                <Button variant="outline" size="sm" onClick={applyPattern} aria-label={t("apply")}>
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </Field>
          </div>

          {items.length === 0 ? (
            <button
              type="button"
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--anda-border)] p-12 text-[var(--anda-text-dim)] hover:border-[var(--anda-primary)] hover:text-[var(--anda-primary)]"
              onClick={() => fileInput.current?.click()}
            >
              <UploadCloud className="h-8 w-8" />
              <span className="text-sm font-medium">{t("import_drop_hint")}</span>
            </button>
          ) : (
            <>
              <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {items.map((item, i) => (
                  <div
                    key={item.key}
                    draggable
                    onDragStart={() => setDragKey(item.key)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragKey == null || dragKey === item.key) return;
                      setItems((prev) => {
                        const from = prev.findIndex((x) => x.key === dragKey);
                        const to = prev.findIndex((x) => x.key === item.key);
                        if (from < 0 || to < 0) return prev;
                        const next = [...prev];
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved!);
                        return next;
                      });
                    }}
                    onDragEnd={() => setDragKey(null)}
                    className="flex items-center gap-2.5 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-2"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[var(--anda-text-dim)]" />
                    <span className="w-6 text-right text-xs tabular-nums text-[var(--anda-text-dim)]">{i + 1}</span>
                    <img src={item.previewUrl} alt="" className="h-11 w-[4.5rem] shrink-0 rounded-lg object-cover" />
                    <Input
                      value={item.name}
                      aria-label={t("name")}
                      className="flex-1"
                      onChange={(e) => setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, name: e.target.value } : x)))}
                    />
                    <span className="w-24 text-right text-xs text-[var(--anda-text-dim)]">
                      {item.status === "done" ? (
                        <Check className="ml-auto h-4 w-4 text-emerald-500" />
                      ) : item.status === "uploading" ? (
                        `${item.percent.toFixed(2)} %`
                      ) : item.status === "error" ? (
                        <span className="text-[var(--anda-danger)]">{t("error")}</span>
                      ) : (
                        `${(item.file.size / 1024 / 1024).toFixed(1)} MB`
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t("delete")}
                      disabled={item.status === "uploading"}
                      onClick={() => setItems((prev) => prev.filter((x) => x.key !== item.key))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => fileInput.current?.click()}>
                  <UploadCloud className="h-4 w-4" /> {t("add_more")}
                </Button>
                <div className="flex-1" />
                {!allUploaded && (
                  <Button onClick={() => void uploadAll()} disabled={items.some((i) => i.status === "uploading")}>
                    {t("upload_all", { count: String(items.filter((i) => i.status !== "done").length) })}
                  </Button>
                )}
              </div>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files != null) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {floorplans.length > 1 && (
            <Select value={floorplan?.id ?? ""} onChange={(e) => setFloorplanId(e.target.value)} aria-label={t("floorplan")} className="max-w-64">
              {floorplans.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </Select>
          )}
          <p className="text-sm text-[var(--anda-text-dim)]">
            {nextUnplaced != null ? t("plan_place_next", { name: nextUnplaced.name }) : t("plan_all_placed")}
          </p>
          {floorplan != null ? (
            <div className="relative overflow-hidden rounded-xl border border-[var(--anda-border)]">
              <img
                src={floorplan.url.startsWith("media:") ? `/api/v1/media/${floorplan.url.slice(6)}/file` : floorplan.url}
                alt={floorplan.title}
                className="max-h-[52vh] w-full cursor-crosshair object-contain"
                onClick={(e) => {
                  if (nextUnplaced == null) return;
                  const rect = (e.target as HTMLImageElement).getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width;
                  const y = (e.clientY - rect.top) / rect.height;
                  setItems((prev) => prev.map((it) => (it.key === nextUnplaced.key ? { ...it, plan: { x, y } } : it)));
                }}
              />
              {orderedForPlan.map(
                (item, i) =>
                  item.plan != null && (
                    <button
                      key={item.key}
                      type="button"
                      title={`${item.name} (${t("click_to_clear")})`}
                      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--anda-primary)] text-[11px] font-bold text-white shadow-md hover:scale-110"
                      style={{ left: `${item.plan.x * 100}%`, top: `${item.plan.y * 100}%` }}
                      onClick={() => setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, plan: undefined } : x)))}
                    >
                      {i + 1}
                    </button>
                  ),
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--anda-text-dim)]">{t("no_floorplan_hint")}</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {createdCount != null ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Check className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold">{t("scenes_created", { count: String(createdCount) })}</p>
            </div>
          ) : creating ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <>
              <p className="text-sm">
                {t("import_summary", {
                  count: String(items.length),
                  project: project?.title ?? projects.data?.find((p) => p.id === projectId)?.title ?? "",
                })}
              </p>
              <ol className="max-h-56 list-decimal space-y-0.5 overflow-y-auto pl-6 text-sm">
                {items.map((item) => (
                  <li key={item.key}>
                    {item.name}
                    {item.plan != null && <MapPin className="ml-1 inline h-3.5 w-3.5 text-[var(--anda-primary)]" aria-label={t("placed_on_plan")} />}
                  </li>
                ))}
              </ol>
              <Switch id="iw-connect" checked={connectSequence} onCheckedChange={setConnectSequence} label={t("connect_sequence")} />
              <p className="text-xs text-[var(--anda-text-dim)]">{t("connect_sequence_hint")}</p>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
