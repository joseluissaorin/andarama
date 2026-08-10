import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileAudio, FileBox, FileImage, FileText, FileVideo, FolderOpen, Image as ImageIcon, Map, Trash2, UploadCloud } from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Field, Input, Select, Spinner, useToast } from "@ull360/ui";
import { api, ApiRequestError } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { PlanetThumb, Pano360Dialog, isPano, previewEquirect } from "../media/PanoPreview";
import { prefetchLittlePlanets } from "../media/littlePlanet";
import { MEDIA_DRAG_TYPE, mediaDragPayload } from "../media/drag";
import { uploadMedia, type MediaKind, type UploadProgress } from "../upload";
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

  const doUpload = useCallback(
    async (files: FileList | File[]): Promise<void> => {
      for (const file of Array.from(files)) {
        const key = `${file.name}-${Date.now()}`;
        const kindGuess: MediaKind | null = kindFilter != null ? (kindFilter as MediaKind) : null;
        setUploads((u) => ({ ...u, [key]: { phase: "hashing", percent: 0, name: file.name } }));
        try {
          const result = await uploadMedia(orgId, file, kindGuess, (p) =>
            setUploads((u) => ({ ...u, [key]: { ...p, name: file.name } })),
          );
          if (result.deduplicated) toast.push(t("deduplicated"));
          setTimeout(() => setUploads((u) => Object.fromEntries(Object.entries(u).filter(([k]) => k !== key))), 1500);
          void queryClient.invalidateQueries({ queryKey: ["media"] });
        } catch (err) {
          setUploads((u) => ({ ...u, [key]: { phase: "error", percent: 0, name: file.name, detail: String(err instanceof Error ? err.message : err) } }));
        }
      }
    },
    [orgId, kindFilter, queryClient, toast, t],
  );

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void doUpload(e.dataTransfer.files);
      }}
    >
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
        {fullPage && (
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
        {(folders.data ?? []).length > 1 && (
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
        <div key={key} className="mb-2 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{u.name}</span>
            <span className="text-xs text-[var(--ull-text-dim)]">
              {u.phase === "error" ? `${t("error")}: ${u.detail ?? ""}` : u.phase === "tiling" ? `${t("tiling")} ${u.detail ?? ""}` : t(u.phase === "done" ? "ready" : "uploading")}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--ull-surface-2)]">
            <div
              className={`h-full rounded-full transition-all ${u.phase === "error" ? "bg-[var(--ull-danger)]" : "bg-[var(--ull-primary)]"}`}
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
          className="mb-3 inline-flex cursor-grab items-center gap-2 rounded-xl border border-dashed border-[var(--ull-primary)] bg-[var(--ull-surface)] px-3 py-2 text-[13px]"
        >
          <FolderOpen className="h-4 w-4 text-[var(--ull-primary)]" />
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
              className={`group relative overflow-hidden rounded-xl border bg-[var(--ull-surface)] text-left shadow-sm transition-shadow hover:shadow-md ${
                selected.has(m.id) ? "border-[var(--ull-primary)] ring-1 ring-[var(--ull-primary)]" : "border-[var(--ull-border)]"
              }`}
            >
              <button
                type="button"
                className="w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ull-primary)]"
                title={isPano(m) ? t("dblclick_to_preview") : undefined}
                onClick={() => {
                  if (onSelect != null) onSelect(m);
                  else {
                    setDetail(m);
                    setRenaming(m.filename);
                  }
                }}
                onDoubleClick={(e) => {
                  if (!isPano(m)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDetail(null);
                  setPreview(m);
                }}
              >
                <div className="flex h-28 items-center justify-center overflow-hidden bg-[var(--ull-surface-2)]">
                  {isPano(m) ? (
                    <PlanetThumb media={m} />
                  ) : m.derivatives.some((d) => d.kind === "thumb") ? (
                    <img src={`/api/v1/media/${m.id}/derived/thumb`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : m.kind === "image" || m.kind === "floorplan" ? (
                    <img src={`/api/v1/media/${m.id}/file`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-[var(--ull-text-dim)]">{KIND_ICONS[m.kind] ?? <FileText className="h-5 w-5" />}</span>
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
                  className={`absolute left-2 top-2 h-4 w-4 accent-[var(--ull-primary)] ${selected.size > 0 ? "" : "opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <Pano360Dialog media={preview} onClose={() => setPreview(null)} />

      {/* Barra de acciones por lotes */}
      {fullPage && selected.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center gap-3 rounded-2xl border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5 shadow-[var(--ull-shadow-lg)]">
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
              <span className="text-[var(--ull-text-dim)]">{t("type")}:</span> {t(`media_kind_${detail.kind}`)} ({detail.mime})
            </p>
            {detail.width != null && (
              <p>
                <span className="text-[var(--ull-text-dim)]">{t("dimensions")}:</span> {detail.width} x {detail.height}
              </p>
            )}
            <p>
              <span className="text-[var(--ull-text-dim)]">{t("size")}:</span> {(detail.bytes / (1024 * 1024)).toFixed(2)} MB
            </p>
            {detail.duration != null && (
              <p>
                <span className="text-[var(--ull-text-dim)]">{t("duration")}:</span> {Math.round(detail.duration)} s
              </p>
            )}
            {detail.exif?.gps != null && (
              <p>
                <span className="text-[var(--ull-text-dim)]">GPS:</span> {detail.exif.gps.lat.toFixed(5)}, {detail.exif.gps.lng.toFixed(5)}
              </p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
