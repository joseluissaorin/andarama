import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { FileAudio, FileBox, FileImage, FileText, FileVideo, Image as ImageIcon, Map, Trash2, UploadCloud } from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Input, Select, Spinner, useToast } from "@ull360/ui";
import { api } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { detectKind, uploadMedia, type MediaKind, type UploadProgress } from "../upload";

export interface MediaItem {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  folder: string | null;
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
  const [uploads, setUploads] = useState<Record<string, UploadProgress & { name: string }>>({});
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const list = useQuery({
    queryKey: ["media", orgId, kind, search],
    queryFn: () => api<MediaItem[]>(`/media?org=${orgId}${kind !== "" ? `&kind=${kind}` : ""}${search !== "" ? `&q=${encodeURIComponent(search)}` : ""}`),
  });

  const doUpload = useCallback(
    async (files: FileList | File[]): Promise<void> => {
      for (const file of Array.from(files)) {
        const key = `${file.name}-${Date.now()}`;
        const kindGuess: MediaKind | null = kindFilter != null ? (kindFilter as MediaKind) : null;
        setUploads((u) => ({ ...u, [key]: { phase: "hashing", percent: 0, name: file.name } }));
        try {
          const result = await uploadMedia(orgId, file, kindGuess ?? (detectKind(file) as MediaKind), (p) =>
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
            <option value="">*</option>
            {["panorama", "image", "video", "audio", "pdf", "model", "floorplan", "subtitle", "file"].map((k) => (
              <option key={k} value={k}>
                {t(`media_kind_${k}`)}
              </option>
            ))}
          </Select>
        )}
        <div className="flex-1" />
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
            <button
              key={m.id}
              type="button"
              className="group overflow-hidden rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ull-primary)]"
              onClick={() => (onSelect != null ? onSelect(m) : setDetail(m))}
            >
              <div className="flex h-28 items-center justify-center bg-[var(--ull-surface-2)]">
                {m.derivatives.some((d) => d.kind === "thumb") ? (
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
                  {m.status === "processing" && <Badge tone="warn">{t("processing")}</Badge>}
                  {m.status === "error" && <Badge tone="danger">{t("error")}</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={detail != null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
        title={detail?.filename ?? ""}
        footer={
          detail != null ? (
            <Button
              variant="danger"
              onClick={() => {
                void api(`/media/${detail.id}`, { method: "DELETE" }).then(() => {
                  setDetail(null);
                  void queryClient.invalidateQueries({ queryKey: ["media"] });
                });
              }}
            >
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
                <span className="text-[var(--ull-text-dim)]">Duracion:</span> {Math.round(detail.duration)} s
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
