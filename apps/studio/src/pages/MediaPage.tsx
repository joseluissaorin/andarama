import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, FileAudio, FileBox, FileImage, FileText, FileVideo, FolderKanban, FolderOpen, Image as ImageIcon, Map, Trash2, UploadCloud } from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Field, Input, Select, Spinner, useToast } from "@andarama/ui";
import { api, ApiRequestError } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { PlanetThumb, Pano360Dialog, isPano, previewEquirect } from "../media/PanoPreview";
import { prefetchLittlePlanets } from "../media/littlePlanet";
import { MEDIA_DRAG_TYPE, mediaDragPayload } from "../media/drag";
import { retileMedia, uploadMedia, type MediaKind, type UploadProgress } from "../upload";
import { deviceConcurrency, pooled } from "../pool";
import { ImportWizard } from "./ImportWizard";

export interface MediaItem {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  folder: string | null;
  projectId: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  status: string;
  createdAt: number;
  exif: { gps?: { lat: number; lng: number } } | null;
  derivatives: { kind: string; manifest: Record<string, unknown> }[];
}

const KIND_ICONS: Record<string, React.ReactNode> = {
  panorama: <ImageIcon className="h-5 w-5" />,
  image: <FileImage className="h-5 w-5" />,
  video: <FileVideo className="h-5 w-5" />,
  audio: <FileAudio className="h-5 w-5" />,
  pdf: <FileText className="h-5 w-5" />,
  model: <FileBox className="h-5 w-5" />,
  floorplan: <Map className="h-5 w-5" />,
};

export function MediaPage(): React.ReactNode {
  const t = useT();
  const orgId = useAuth((s) => s.currentOrgId);
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-xl font-bold">{t("media_library")}</h1>
      {orgId != null && <MediaLibrary orgId={orgId} onSelect={null} />}
    </div>
  );
}

/** Biblioteca reutilizable: pagina completa y selector desde el editor. */
export function MediaLibrary({ orgId, onSelect, kindFilter }: {
  orgId: string;
  onSelect: ((item: MediaItem) => void) | null;
  kindFilter?: string;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(kindFilter ?? "");
  const [search, setSearch] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [project, setProject] = useState("");
  const [order, setOrder] = useState("recent");
  const [uploads, setUploads] = useState<Record<string, UploadProgress & { name: string }>>({});
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [folder, setFolder] = useState("");
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [renaming, setRenaming] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const fullPage = onSelect == null;

  // Búsqueda con debounce: una petición por pausa, no por tecla
  useEffect(() => {
    const timer = setTimeout(() => setSearchQ(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const projects = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api<{ id: string; title: string }[]>(`/projects?org=${orgId}`),
    enabled: fullPage,
  });

  const list = useQuery({
    queryKey: ["media", orgId, kind, searchQ, project, order, folder],
    queryFn: () =>
      api<MediaItem[]>(
        `/media?org=${orgId}${kind !== "" ? `&kind=${kind}` : ""}${searchQ !== "" ? `&q=${encodeURIComponent(searchQ)}` : ""}${project !== "" ? `&project=${project}` : ""}${folder !== "" ? `&folder=${encodeURIComponent(folder === "root" ? "" : folder)}` : ""}&order=${order}`,
      ),
  });

  const folders = useQuery({
    queryKey: ["media-folders", orgId],
    queryFn: () => api<{ folder: string; total: number; panoramas: number }[]>(`/media/folders?org=${orgId}`),
  });

  // Al subir desde la biblioteca con un tour seleccionado, lo subido entra en
  // ese tour: si no, hay que ir a asignarlo a mano cada vez.
  const assignAfterUpload = fullPage && project !== "" && project !== "none" ? project : null;

  // Los planetas del hover se calculan en tiempo ocioso: al pasar el ratón ya
  // están hechos y aparecen en el mismo fotograma.
  useEffect(() => {
    const items = (list.data ?? [])
      .filter((m) => isPano(m))
      .map((m) => ({ id: m.id, equirectUrl: previewEquirect(m) }));
    if (items.length > 0) prefetchLittlePlanets(items);
  }, [list.data]);

  const removeMedia = async (ids: string[]): Promise<void> => {
    if (!confirm(t("confirm_delete_media", { count: String(ids.length) }))) return;
    for (const id of ids) {
      try {
        await api(`/media/${id}`, { method: "DELETE" });
      } catch (err) {
        toast.push(err instanceof ApiRequestError ? (err.detail ?? err.title) : String(err), "error");
      }
    }
    setSelected(new Set());
    setDetail(null);
    void queryClient.invalidateQueries({ queryKey: ["media"] });
  };

  const assignProject = async (ids: string[], projectId: string | null): Promise<void> => {
    for (const id of ids) {
      await api(`/media/${id}`, { method: "PATCH", body: { projectId } });
    }
    setSelected(new Set());
    void queryClient.invalidateQueries({ queryKey: ["media"] });
    toast.push(t("saved"), "ok");
  };

  /** Regenera las teselas de los panoramas seleccionados, uno a uno. */
  const retileSelected = async (): Promise<void> => {
    const panos = (list.data ?? []).filter((m) => selected.has(m.id) && isPano(m));
    for (const m of panos) {
      const key = `retile-${m.id}`;
      setUploads((u) => ({ ...u, [key]: { phase: "tiling", percent: 0, name: m.filename } }));
      try {
        await retileMedia(m.id, (p) => setUploads((u) => ({ ...u, [key]: { ...p, name: m.filename } })));
        setTimeout(() => setUploads((u) => Object.fromEntries(Object.entries(u).filter(([k]) => k !== key))), 1500);
      } catch (err) {
        setUploads((u) => ({ ...u, [key]: { phase: "error", percent: 0, name: m.filename, detail: String(err instanceof Error ? err.message : err) } }));
      }
    }
    setSelected(new Set());
    void queryClient.invalidateQueries({ queryKey: ["media"] });
    toast.push(t("retile_done", { n: String(panos.length) }), "ok");
  };

  const doUpload = useCallback(
    async (files: FileList | File[]): Promise<void> => {
      const list = Array.from(files);
      const kindGuess: MediaKind | null = kindFilter != null ? (kindFilter as MediaKind) : null;
      // Varias fotos a la vez: mientras una se trocea (que es cosa de la GPU),
      // la anterior está subiendo (que es cosa de la red). De una en una se
      // desperdiciaba la mitad del tiempo.
      await pooled(
        list.map((file, i) => async () => {
          const key = `${file.name}-${Date.now()}-${i}`;
          setUploads((u) => ({ ...u, [key]: { phase: "hashing", percent: 0, name: file.name } }));
          try {
            const result = await uploadMedia(orgId, file, kindGuess, (p) =>
              setUploads((u) => ({ ...u, [key]: { ...p, name: file.name } })),
            );
            if (result.deduplicated) toast.push(t("deduplicated"));
            if (assignAfterUpload != null) {
              await api(`/media/${result.id}`, { method: "PATCH", body: { projectId: assignAfterUpload } });
            }
            setTimeout(() => setUploads((u) => Object.fromEntries(Object.entries(u).filter(([k]) => k !== key))), 1500);
            void queryClient.invalidateQueries({ queryKey: ["media"] });
          } catch (err) {
            setUploads((u) => ({ ...u, [key]: { phase: "error", percent: 0, name: file.name, detail: String(err instanceof Error ? err.message : err) } }));
          }
        }),
        deviceConcurrency().files,
      );
    },
    [orgId, kindFilter, queryClient, toast, t, assignAfterUpload],
  );

  return (
    <div
      className={fullPage ? "flex gap-5" : undefined}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void doUpload(e.dataTransfer.files);
      }}
    >
      {/* Organizar, no solo filtrar: la biblioteca se recorre por tours y por
          carpetas, que es como está guardada la cabeza de quien la usa. */}
      {fullPage && (
        <nav className="w-52 shrink-0 space-y-4 text-[13px]">
          <div>
            <h2 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">{t("tours")}</h2>
            <ul className="space-y-0.5">
              {[
                { id: "", label: t("all_tours") },
                { id: "none", label: t("without_tour") },
                ...(projects.data ?? []).map((p) => ({ id: p.id, label: p.title })),
              ].map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setProject(item.id)}
                    className={`flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left ${
                      project === item.id ? "bg-[var(--anda-primary-soft)] font-medium text-[var(--anda-primary)]" : "hover:bg-[var(--anda-surface-2)]"
                    }`}
                  >
                    <FolderKanban className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {(folders.data ?? []).length > 0 && (
            <div>
              <h2 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">{t("folders")}</h2>
              <ul className="space-y-0.5">
                {[{ folder: "", total: 0, panoramas: 0 }, ...(folders.data ?? [])]
                  .filter((f, i) => i === 0 || f.folder !== "")
                  .map((f, i) => {
                    const value = i === 0 ? "" : f.folder === "" ? "root" : f.folder;
                    const label = i === 0 ? t("all_folders") : f.folder === "" ? t("folder_root") : f.folder;
                    return (
                      <li key={value || "todas"}>
                        <button
                          type="button"
                          onClick={() => setFolder(value)}
                          className={`flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left ${
                            folder === value ? "bg-[var(--anda-primary-soft)] font-medium text-[var(--anda-primary)]" : "hover:bg-[var(--anda-surface-2)]"
                          }`}
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{label}</span>
                          {i > 0 && <span className="ml-auto text-[11px] text-[var(--anda-text-dim)]">{f.total}</span>}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </nav>
      )}

      <div className={fullPage ? "min-w-0 flex-1" : undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-52" aria-label={t("search")} />
        {kindFilter == null && (
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="max-w-44" aria-label={t("type")}>
            <option value="">{t("all_kinds")}</option>
            {["panorama", "image", "video", "audio", "pdf", "model", "floorplan", "subtitle", "file"].map((k) => (
              <option key={k} value={k}>
                {t(`media_kind_${k}`)}
              </option>
            ))}
          </Select>
        )}
        {false && fullPage && (
          <Select value={project} onChange={(e) => setProject(e.target.value)} className="max-w-48" aria-label={t("filter_by_tour")}>
            <option value="">{t("all_tours")}</option>
            <option value="none">{t("without_tour")}</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        )}
        {!fullPage && (folders.data ?? []).length > 1 && (
          <Select value={folder} onChange={(e) => setFolder(e.target.value)} className="max-w-44" aria-label={t("folder")}>
            <option value="">{t("all_folders")}</option>
            {(folders.data ?? []).map((f) => (
              <option key={f.folder} value={f.folder === "" ? "root" : f.folder}>
                {(f.folder === "" ? t("folder_root") : f.folder) + ` (${f.total})`}
              </option>
            ))}
          </Select>
        )}
        <Select value={order} onChange={(e) => setOrder(e.target.value)} className="max-w-36" aria-label={t("sort_by")}>
          <option value="recent">{t("sort_recent")}</option>
          <option value="name">{t("sort_name")}</option>
        </Select>
        <div className="flex-1" />
        {fullPage && (
          <Button variant="outline" onClick={() => setWizardOpen(true)}>
            <Camera className="h-4 w-4" /> {t("import_wizard")}
          </Button>
        )}
        <Button onClick={() => fileInput.current?.click()}>
          <UploadCloud className="h-4 w-4" /> {t("upload")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files != null) void doUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {Object.entries(uploads).map(([key, u]) => (
        <div key={key} className="mb-2 rounded-lg border border-[var(--anda-border)] bg-[var(--anda-surface)] px-4 py-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{u.name}</span>
            <span className="text-xs text-[var(--anda-text-dim)]">
              {u.phase === "error" ? `${t("error")}: ${u.detail ?? ""}` : u.phase === "tiling" ? `${t("tiling")} ${u.detail ?? ""}` : t(u.phase === "done" ? "ready" : "uploading")}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--anda-surface-2)]">
            <div
              className={`h-full rounded-full transition-all ${u.phase === "error" ? "bg-[var(--anda-danger)]" : "bg-[var(--anda-primary)]"}`}
              style={{ width: `${u.percent}%` }}
            />
          </div>
        </div>
      ))}

      {(folder !== "" || selected.size > 1) && (list.data ?? []).some((m) => isPano(m)) && (
        <div
          draggable
          onDragStart={(e) => {
            const source = selected.size > 1 ? (list.data ?? []).filter((m) => selected.has(m.id)) : (list.data ?? []);
            e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(source.filter((m) => isPano(m)).map(mediaDragPayload)));
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="mb-3 inline-flex cursor-grab items-center gap-2 rounded-xl border border-dashed border-[var(--anda-primary)] bg-[var(--anda-surface)] px-3 py-2 text-[13px]"
        >
          <FolderOpen className="h-4 w-4 text-[var(--anda-primary)]" />
          {t("drag_group_hint", {
            count: String(
              (selected.size > 1 ? (list.data ?? []).filter((m) => selected.has(m.id)) : (list.data ?? [])).filter((m) => isPano(m)).length,
            ),
          })}
        </div>
      )}

      {list.isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : (list.data ?? []).length === 0 ? (
        <button type="button" className="w-full" onClick={() => fileInput.current?.click()}>
          <EmptyState icon={<UploadCloud className="h-10 w-10" />} title={t("no_media")} hint={t("drop_files")} />
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {(list.data ?? []).map((m) => (
            <div
              key={m.id}
              draggable
              onDragStart={(e) => {
                // Arrastrar un panorama al grafo o a la lista de escenas lo
                // convierte en escena; el tipo propio evita confundirlo con
                // una subida de ficheros.
                e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify([mediaDragPayload(m)]));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`group relative overflow-hidden rounded-xl border bg-[var(--anda-surface)] text-left shadow-sm transition-shadow hover:shadow-md ${
                selected.has(m.id) ? "border-[var(--anda-primary)] ring-1 ring-[var(--anda-primary)]" : "border-[var(--anda-border)]"
              }`}
            >
              <button
                type="button"
                className="w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--anda-primary)]"
                title={isPano(m) ? t("dblclick_to_preview") : undefined}
                onClick={() => {
                  if (onSelect != null) {
                    onSelect(m);
                    return;
                  }
                  // Un clic abre la ficha y dos abren el visor 360, así que la
                  // ficha espera a que se descarte el segundo clic.
                  if (!isPano(m)) {
                    setDetail(m);
                    setRenaming(m.filename);
                    return;
                  }
                  if (clickTimer.current != null) clearTimeout(clickTimer.current);
                  clickTimer.current = setTimeout(() => {
                    clickTimer.current = null;
                    setDetail(m);
                    setRenaming(m.filename);
                  }, 220);
                }}
                onDoubleClick={(e) => {
                  if (!isPano(m)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (clickTimer.current != null) {
                    clearTimeout(clickTimer.current);
                    clickTimer.current = null;
                  }
                  setDetail(null);
                  setPreview(m);
                }}
              >
                <div className="flex h-28 items-center justify-center overflow-hidden bg-[var(--anda-surface-2)]">
                  {isPano(m) ? (
                    <PlanetThumb media={m} onOpen360={() => { setDetail(null); setPreview(m); }} />
                  ) : m.derivatives.some((d) => d.kind === "thumb") ? (
                    <img src={`/api/v1/media/${m.id}/derived/thumb`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : m.kind === "image" || m.kind === "floorplan" ? (
                    <img src={`/api/v1/media/${m.id}/file`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-[var(--anda-text-dim)]">{KIND_ICONS[m.kind] ?? <FileText className="h-5 w-5" />}</span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-[13px] font-medium">{m.filename}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge>{t(`media_kind_${m.kind}`)}</Badge>
                    {fullPage && m.projectId != null && (
                      <Badge tone="ok">{projects.data?.find((p) => p.id === m.projectId)?.title ?? t("tour")}</Badge>
                    )}
                    {m.status === "processing" && <Badge tone="warn">{t("processing")}</Badge>}
                    {m.status === "error" && <Badge tone="danger">{t("error")}</Badge>}
                  </div>
                </div>
              </button>
              {fullPage && (
                <input
                  type="checkbox"
                  aria-label={t("select_item", { name: m.filename })}
                  checked={selected.has(m.id)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(m.id);
                      else next.delete(m.id);
                      return next;
                    });
                  }}
                  className={`absolute left-2 top-2 h-4 w-4 accent-[var(--anda-primary)] ${selected.size > 0 ? "" : "opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <Pano360Dialog media={preview} onClose={() => setPreview(null)} />

      {/* Barra de acciones por lotes */}
      {fullPage && selected.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center gap-3 rounded-2xl border border-[var(--anda-border)] bg-[var(--anda-surface)] px-4 py-2.5 shadow-[var(--anda-shadow-lg)]">
          <span className="text-sm font-medium">{t("n_selected", { count: String(selected.size) })}</span>
          <Select
            value=""
            aria-label={t("assign_to_tour")}
            className="max-w-52"
            onChange={(e) => {
              if (e.target.value === "") return;
              void assignProject([...selected], e.target.value === "none" ? null : e.target.value);
            }}
          >
            <option value="">{t("assign_to_tour")}</option>
            <option value="none">{t("without_tour")}</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
          {/* Reparar panoramas cuyas teselas salieron mal: se vuelven a
              generar del fichero original, sin volver a subir nada. */}
          {(list.data ?? []).some((m) => selected.has(m.id) && isPano(m)) && (
            <Button variant="outline" size="sm" onClick={() => void retileSelected()}>
              <RefreshCw className="h-4 w-4" /> {t("retile")}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="danger" size="sm" onClick={() => void removeMedia([...selected])}>
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t("cancel")}
          </Button>
        </div>
      )}

      {fullPage && <ImportWizard orgId={orgId} open={wizardOpen} onClose={() => setWizardOpen(false)} />}

      <Dialog
        open={detail != null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
        title={detail?.filename ?? ""}
        footer={
          detail != null ? (
            <Button variant="danger" onClick={() => void removeMedia([detail.id])}>
              <Trash2 className="h-4 w-4" /> {t("delete")}
            </Button>
          ) : undefined
        }
      >
        {detail != null && (
          <div className="space-y-2 text-sm">
            {detail.derivatives.some((d) => d.kind === "thumb") && (
              <img src={`/api/v1/media/${detail.id}/derived/thumb`} alt="" className="w-full rounded-lg" />
            )}
            <Field label={t("name")} htmlFor="md-name">
              <div className="flex gap-1.5">
                <Input id="md-name" value={renaming} onChange={(e) => setRenaming(e.target.value)} />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={renaming.trim() === "" || renaming === detail.filename}
                  onClick={() => {
                    void api(`/media/${detail.id}`, { method: "PATCH", body: { filename: renaming.trim() } }).then(() => {
                      setDetail({ ...detail, filename: renaming.trim() });
                      void queryClient.invalidateQueries({ queryKey: ["media"] });
                      toast.push(t("saved"), "ok");
                    });
                  }}
                >
                  {t("rename")}
                </Button>
              </div>
            </Field>
            <Field label={t("tour")} htmlFor="md-project">
              <Select
                id="md-project"
                value={detail.projectId ?? ""}
                onChange={(e) => {
                  const value = e.target.value === "" ? null : e.target.value;
                  void api(`/media/${detail.id}`, { method: "PATCH", body: { projectId: value } }).then(() => {
                    setDetail({ ...detail, projectId: value });
                    void queryClient.invalidateQueries({ queryKey: ["media"] });
                  });
                }}
              >
                <option value="">{t("without_tour")}</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <p>
              <span className="text-[var(--anda-text-dim)]">{t("type")}:</span> {t(`media_kind_${detail.kind}`)} ({detail.mime})
            </p>
            {detail.width != null && (
              <p>
                <span className="text-[var(--anda-text-dim)]">{t("dimensions")}:</span> {detail.width} x {detail.height}
              </p>
            )}
            <p>
              <span className="text-[var(--anda-text-dim)]">{t("size")}:</span> {(detail.bytes / (1024 * 1024)).toFixed(2)} MB
            </p>
            {detail.duration != null && (
              <p>
                <span className="text-[var(--anda-text-dim)]">{t("duration")}:</span> {Math.round(detail.duration)} s
              </p>
            )}
            {detail.exif?.gps != null && (
              <p>
                <span className="text-[var(--anda-text-dim)]">GPS:</span> {detail.exif.gps.lat.toFixed(5)}, {detail.exif.gps.lng.toFixed(5)}
              </p>
            )}
          </div>
        )}
      </Dialog>
      </div>
    </div>
  );
}
