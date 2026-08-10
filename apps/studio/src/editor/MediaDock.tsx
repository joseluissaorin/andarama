import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronDown, FolderOpen, Images, Search, UploadCloud } from "lucide-react";
import { Button, Input, Select, Spinner, useToast } from "@ull360/ui";
import { api } from "../api";
import { useT } from "../i18n";
import { uploadMedia, type UploadProgress } from "../upload";
import { PlanetThumb, Pano360Dialog, isPano, previewEquirect } from "../media/PanoPreview";
import { prefetchLittlePlanets } from "../media/littlePlanet";
import { MEDIA_DRAG_TYPE, mediaDragPayload } from "../media/drag";
import { ImportWizard } from "../pages/ImportWizard";
import { deviceConcurrency, pooled } from "../pool";
import type { MediaItem } from "../pages/MediaPage";

/**
 * Biblioteca dentro del editor.
 *
 * Traer un panorama al tour exigía salir a la biblioteca, buscarlo entre todos
 * los medios de la organización, volver y repetir. Este panel vive junto al
 * lienzo, **arranca mostrando solo lo de este tour**, deja comprobarlo en 360
 * antes de usarlo y se arrastra directamente al grafo o a la lista de escenas.
 * Lo que se sube desde aquí queda asignado al tour, así que sigue apareciendo.
 */

export function MediaDock({ orgId, projectId, projectTitle, canEdit }: {
  orgId: string;
  projectId: string;
  projectTitle: string;
  canEdit: boolean;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  // Abierto de serie: el panel existe justamente para no tener que buscarlo.
  const [open, setOpen] = useState(() => localStorage.getItem("ull360.mediaDock") !== "off");
  const [scope, setScope] = useState<"tour" | "all">("tour");
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [uploads, setUploads] = useState<Record<string, UploadProgress & { name: string }>>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const list = useQuery({
    queryKey: ["media", orgId, scope, projectId, folder],
    queryFn: () =>
      api<MediaItem[]>(
        `/media?org=${orgId}${scope === "tour" ? `&project=${projectId}` : ""}${folder !== "" ? `&folder=${encodeURIComponent(folder === "root" ? "" : folder)}` : ""}&order=recent`,
      ),
    enabled: open,
  });

  const folders = useQuery({
    queryKey: ["media-folders", orgId],
    queryFn: () => api<{ folder: string; total: number }[]>(`/media/folders?org=${orgId}`),
    enabled: open && scope === "all",
  });

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = list.data ?? [];
    return q === "" ? all : all.filter((m) => m.filename.toLowerCase().includes(q));
  }, [list.data, search]);

  useEffect(() => {
    const panos = items.filter(isPano).map((m) => ({ id: m.id, equirectUrl: previewEquirect(m) }));
    if (panos.length > 0) prefetchLittlePlanets(panos, 180);
  }, [items]);

  useEffect(() => {
    localStorage.setItem("ull360.mediaDock", open ? "on" : "off");
  }, [open]);

  /** Lo subido desde el editor pertenece a este tour: no hay que ir a buscarlo. */
  const doUpload = async (files: FileList | File[]): Promise<void> => {
    await pooled(
      Array.from(files).map((file, i) => async () => {
        const key = `${file.name}-${Date.now()}-${i}`;
        setUploads((u) => ({ ...u, [key]: { phase: "hashing", percent: 0, name: file.name } }));
        try {
          const result = await uploadMedia(orgId, file, null, (p) => setUploads((u) => ({ ...u, [key]: { ...p, name: file.name } })));
          await api(`/media/${result.id}`, { method: "PATCH", body: { projectId, folder: projectTitle } });
          setTimeout(() => setUploads((u) => Object.fromEntries(Object.entries(u).filter(([k]) => k !== key))), 1200);
          void queryClient.invalidateQueries({ queryKey: ["media"] });
        } catch (err) {
          setUploads((u) => ({ ...u, [key]: { phase: "error", percent: 0, name: file.name, detail: String(err instanceof Error ? err.message : err) } }));
          toast.push(String(err instanceof Error ? err.message : err), "error");
        }
      }),
      deviceConcurrency().files,
    );
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border-t border-[var(--ull-border)] bg-[var(--ull-surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--ull-text-dim)] hover:text-[var(--ull-text)]"
      >
        <Images className="h-4 w-4" />
        {t("media_dock")}
      </button>
    );
  }

  return (
    <section className="flex h-56 flex-col border-t border-[var(--ull-border)] bg-[var(--ull-surface)]">
      <header className="flex items-center gap-2 px-3 py-1.5">
        <Images className="h-4 w-4 text-[var(--ull-primary)]" />
        <h2 className="text-[13px] font-semibold">{t("media_dock")}</h2>

        {/* Por defecto, solo lo de este tour */}
        <div className="ml-2 flex rounded-lg bg-[var(--ull-surface-2)] p-0.5">
          {(["tour", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setScope(s);
                setFolder("");
              }}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                scope === s ? "bg-[var(--ull-surface)] shadow-sm" : "text-[var(--ull-text-dim)]"
              }`}
            >
              {s === "tour" ? t("dock_this_tour") : t("dock_all_media")}
            </button>
          ))}
        </div>

        {scope === "all" && (folders.data ?? []).length > 1 && (
          <Select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label={t("folder")} className="max-w-40">
            <option value="">{t("all_folders")}</option>
            {(folders.data ?? []).map((f) => (
              <option key={f.folder} value={f.folder === "" ? "root" : f.folder}>
                {(f.folder === "" ? t("folder_root") : f.folder) + ` (${f.total})`}
              </option>
            ))}
          </Select>
        )}

        <div className="relative max-w-44 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ull-text-dim)]" />
          <Input
            className="h-8 pl-7 text-[13px]"
            placeholder={t("search")}
            aria-label={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1" />
        {canEdit && (
          <>
            {/* Volcar la tarjeta de la cámara sin salir del editor: es el paso
                que más veces se repite y estaba solo en la biblioteca. */}
            <Button size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
              <Camera className="h-4 w-4" /> {t("import_wizard")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
              <UploadCloud className="h-4 w-4" /> {t("upload")}
            </Button>
          </>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("close")} onClick={() => setOpen(false)}>
          <ChevronDown className="h-4 w-4" />
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
      </header>

      {Object.entries(uploads).length > 0 && (
        <div className="px-3 pb-1">
          {Object.entries(uploads).map(([key, u]) => (
            <div key={key} className="mb-1 flex items-center gap-2 text-xs">
              <span className="max-w-40 truncate">{u.name}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--ull-surface-2)]">
                <div
                  className={`h-full rounded-full ${u.phase === "error" ? "bg-[var(--ull-danger)]" : "bg-[var(--ull-primary)]"}`}
                  style={{ width: `${u.percent}%` }}
                />
              </div>
              <span className="text-[var(--ull-text-dim)]">{u.phase === "error" ? t("error") : t(u.phase === "done" ? "ready" : "uploading")}</span>
            </div>
          ))}
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 pb-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.files.length > 0 && canEdit) {
            e.preventDefault();
            void doUpload(e.dataTransfer.files);
          }
        }}
      >
        {list.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[13px] text-[var(--ull-text-dim)]">
            <FolderOpen className="h-5 w-5" />
            {scope === "tour" ? t("dock_empty_tour") : t("no_media")}
          </div>
        ) : (
          <ul className="flex h-full gap-2">
            {items.map((m) => (
              <li
                key={m.id}
                draggable={canEdit}
                onDragStart={(e) => {
                  e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify([mediaDragPayload(m)]));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDoubleClick={() => {
                  if (isPano(m)) setPreview(m);
                }}
                title={m.filename}
                className="group relative flex w-36 shrink-0 cursor-grab flex-col overflow-hidden rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface-2)]"
              >
                <div className="relative h-20 overflow-hidden">
                  {isPano(m) ? (
                    <PlanetThumb media={m} onOpen360={() => setPreview(m)} />
                  ) : (
                    <img src={`/api/v1/media/${m.id}/derived/thumb`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <span className="truncate px-2 py-1 text-[11px]">{m.filename}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="px-3 pb-2 text-[11px] text-[var(--ull-text-dim)]">{t("dock_hint")}</p>

      <Pano360Dialog media={preview} onClose={() => setPreview(null)} />
      <ImportWizard
        orgId={orgId}
        open={wizardOpen}
        project={{ id: projectId, title: projectTitle }}
        onClose={() => {
          setWizardOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["media"] });
        }}
      />
    </section>
  );
}

