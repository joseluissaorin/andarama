import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy } from "lucide-react";
import { Button, Dialog, Field, Input, Select, Switch, Textarea, useToast } from "@andarama/ui";
import type { Tour } from "@andarama/schema";
import { runExport, ZipWriter, type AssetProvider, type ScormVersion } from "@andarama/exporter";
import { api } from "../api";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { captureShareImage } from "./shareCapture";
import type { ProjectInfo } from "./EditorPage";

// ---------------------------------------------------------------------------
// Publicar (§3.6, §2.13)
// ---------------------------------------------------------------------------

export function PublishDialog({ open, onClose, project, onPublished }: {
  open: boolean;
  onClose: () => void;
  project: ProjectInfo;
  onPublished: (pub: { slug: string; visibility: string; hasPassword: boolean; kiosk: boolean }) => void;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const [slug, setSlug] = useState(project.publication?.slug ?? project.slug);
  const [visibility, setVisibility] = useState(project.publication?.visibility ?? "public");
  const [password, setPassword] = useState("");
  const [domains, setDomains] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [expireAt, setExpireAt] = useState("");
  const [note, setNote] = useState("");
  const [kiosk, setKiosk] = useState(project.publication?.kiosk === true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; kioskUrl: string; tourUrl: string; kiosk: boolean; warnings: { message: string }[] } | null>(null);

  const publish = async (): Promise<void> => {
    setBusy(true);
    try {
      // La portada para compartir: la escena inicial con la proyección real
      // del visor. Si la captura falla, se publica igual y el servidor usa la
      // previsualización equirectangular.
      const shareImage = (await captureShareImage(project.id)) ?? undefined;
      const res = await api<{ slug: string; url: string; kioskUrl: string; tourUrl: string; kiosk: boolean; warnings: { message: string }[] }>(`/projects/${project.id}/publish`, {
        method: "POST",
        body: {
          slug,
          shareImage,
          visibility,
          password: password !== "" ? password : undefined,
          domains: visibility === "domains" ? domains.split("\n").map((d) => d.trim()).filter((d) => d !== "") : undefined,
          customDomain: customDomain.trim() !== "" ? customDomain.trim().toLowerCase() : undefined,
          publishAt: publishAt !== "" ? new Date(publishAt).getTime() : undefined,
          expireAt: expireAt !== "" ? new Date(expireAt).getTime() : undefined,
          kiosk,
          note: note !== "" ? note : undefined,
        },
      });
      setResult({ url: res.url, kioskUrl: res.kioskUrl, tourUrl: res.tourUrl, kiosk: res.kiosk, warnings: res.warnings });
      onPublished({ slug: res.slug, visibility, hasPassword: password !== "", kiosk: res.kiosk });
      toast.push(t("publish_ok"), "ok");
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("publish_title")}
      footer={
        result == null ? (
          <>
            {project.publication != null && (
              <Button
                variant="danger"
                onClick={() => {
                  void api(`/projects/${project.id}/unpublish`, { method: "POST", body: {} }).then(() => {
                    onClose();
                    location.reload();
                  });
                }}
              >
                {t("unpublish")}
              </Button>
            )}
            <Button onClick={() => void publish()} loading={busy}>
              {t("publish")}
            </Button>
          </>
        ) : undefined
      }
    >
      {result == null ? (
        <div className="space-y-4">
          <Field label={t("publish_slug")} htmlFor="pb-slug">
            <Input id="pb-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
          </Field>
          <Field label={t("visibility")} htmlFor="pb-vis">
            <Select id="pb-vis" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="public">{t("vis_public")}</option>
              <option value="unlisted">{t("vis_unlisted")}</option>
              <option value="password">{t("vis_password")}</option>
              <option value="org">{t("vis_org")}</option>
              <option value="domains">{t("vis_domains")}</option>
            </Select>
          </Field>
          {/* Cómo se abre el enlace. El quiosco no es otro tour: es el mismo
              recorrido puesto en bucle para una pantalla sin nadie delante. */}
          <Field label={t("open_mode")} htmlFor="pb-modo" hint={kiosk ? t("open_mode_kiosk_hint") : t("open_mode_tour_hint")}>
            <Select id="pb-modo" value={kiosk ? "kiosk" : "tour"} onChange={(e) => setKiosk(e.target.value === "kiosk")}>
              <option value="tour">{t("open_mode_tour")}</option>
              <option value="kiosk">{t("open_mode_kiosk")}</option>
            </Select>
          </Field>
          {visibility === "password" && (
            <Field label={t("password")} htmlFor="pb-pass">
              <Input id="pb-pass" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={project.publication?.hasPassword ? "(mantener la actual)" : ""} />
            </Field>
          )}
          {visibility === "domains" && (
            <Field label={t("domains_hint")} htmlFor="pb-domains">
              <Textarea id="pb-domains" rows={3} value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="tours.museodelaciudad.es" />
            </Field>
          )}
          <Field label={t("custom_domain")} htmlFor="pb-cdom" hint={t("custom_domain_hint")}>
            <Input id="pb-cdom" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="tour.midominio.es" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("publish_at")} htmlFor="pb-at">
              <Input id="pb-at" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            </Field>
            <Field label={t("expire_at")} htmlFor="pb-exp">
              <Input id="pb-exp" type="datetime-local" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} />
            </Field>
          </div>
          <Field label={t("version_note")} htmlFor="pb-note">
            <Input id="pb-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">{result.kiosk ? t("open_mode_kiosk") : t("publish_url")}:</p>
          {/* El enlace recién publicado se va a pegar en algún sitio: el botón
              de copiar tiene que estar aquí, no en otro diálogo. */}
          <div className="flex items-center gap-2">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="anda-hueco min-w-0 flex-1 break-all p-3 text-sm text-[var(--anda-primary)]"
            >
              {result.url}
            </a>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(result.url).then(() => toast.push(t("copied"), "ok"));
              }}
            >
              <Copy className="h-4 w-4" /> {t("copy")}
            </Button>
          </div>
          {/* El otro enlace siempre está: el mismo tour, la otra manera de
              abrirlo. Nadie debería tener que republicar para conseguirlo. */}
          <div className="flex items-center gap-2">
            <a
              href={result.kiosk ? result.tourUrl : result.kioskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="anda-hueco min-w-0 flex-1 break-all p-2.5 text-[13px] text-[var(--anda-text-dim)]"
            >
              <span className="mr-1.5 font-semibold text-[var(--anda-text)]">
                {result.kiosk ? t("open_mode_tour") : t("open_mode_kiosk")}:
              </span>
              {result.kiosk ? result.tourUrl : result.kioskUrl}
            </a>
            <Button
              variant="ghost"
              onClick={() => {
                void navigator.clipboard
                  .writeText(result.kiosk ? result.tourUrl : result.kioskUrl)
                  .then(() => toast.push(t("copied"), "ok"));
              }}
            >
              <Copy className="h-4 w-4" /> {t("copy")}
            </Button>
          </div>
          {result.warnings.length > 0 && (
            <details className="text-xs text-amber-600">
              <summary>
                {t("issues")} ({result.warnings.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Compartir: enlace + embed + QR (§2.12)
// ---------------------------------------------------------------------------

export function ShareDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project: ProjectInfo }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const url = project.publication != null ? `${location.origin}/t/${project.publication.slug}` : "";
  // El quiosco es una manera de abrir el mismo tour, no otra publicación: el
  // enlace de arriba es el publicado y este fuerza el modo contrario.
  const enQuiosco = project.publication?.kiosk === true;
  const otroUrl = url !== "" ? `${url}?kiosk=${enQuiosco ? "0" : "1"}` : "";
  const embed = `<iframe src="${url}" style="width:100%;aspect-ratio:16/9;border:0;" allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking" allowfullscreen title="${project.title}"></iframe>`;
  const webComponent =
    project.publication != null
      ? `<script src="${location.origin}/embed.js"></script>\n<anda-tour slug="${project.publication.slug}" title="${project.title}"></anda-tour>`
      : "";

  useEffect(() => {
    if (open && url !== "") {
      void QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQr);
    }
  }, [open, url]);

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(() => toast.push(t("copied"), "ok"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t("share")}>
      <div className="space-y-4">
        <Field label={t("publish_url")}>
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label={t("publish_url")} />
            <Button variant="secondary" className="shrink-0" onClick={() => copy(url)}>
              {t("copy")}
            </Button>
          </div>
        </Field>
        <Field
          label={enQuiosco ? t("open_mode_tour") : t("open_mode_kiosk")}
          hint={enQuiosco ? t("open_mode_tour_hint") : t("open_mode_kiosk_hint")}
        >
          <div className="flex gap-2">
            <Input readOnly value={otroUrl} aria-label={enQuiosco ? t("open_mode_tour") : t("open_mode_kiosk")} />
            <Button variant="secondary" className="shrink-0" onClick={() => copy(otroUrl)}>
              {t("copy")}
            </Button>
          </div>
        </Field>
        <Field label={t("embed_code")}>
          <div className="flex gap-2">
            <Textarea readOnly value={embed} rows={3} className="font-mono text-xs" aria-label={t("embed_code")} />
            <Button variant="secondary" className="shrink-0" onClick={() => copy(embed)}>
              {t("copy")}
            </Button>
          </div>
        </Field>
        <Field label={t("web_component")} hint={t("web_component_hint")}>
          <div className="flex gap-2">
            <Textarea readOnly value={webComponent} rows={3} className="font-mono text-xs" aria-label={t("web_component")} />
            <Button variant="secondary" className="shrink-0" onClick={() => copy(webComponent)}>
              {t("copy")}
            </Button>
          </div>
        </Field>
        {qr != null && (
          <Field label={t("qr_code")}>
            <div className="flex items-center gap-4">
              <img src={qr} alt={`${t("qr_code")}: ${url}`} className="rounded-lg border border-[var(--anda-border)]" />
              <a href={qr} download={`${project.slug}-qr.png`}>
                <Button variant="outline">{t("export")}</Button>
              </a>
            </div>
          </Field>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Exportar paquete estatico en el navegador (§3.6)
// ---------------------------------------------------------------------------

export function ExportDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project: ProjectInfo }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const editor = useEditor();
  const allLangs = (editor.snapshot?.settings.langs as string[]) ?? ["es"];
  const [langs, setLangs] = useState<string[]>(allLangs);
  const [maxLevels, setMaxLevels] = useState<string>("");
  const [downloads, setDownloads] = useState(true);
  const [analyticsEndpoint, setAnalyticsEndpoint] = useState("");
  const [sw, setSw] = useState(false);
  const [single, setSingle] = useState(false);
  // El HTML único inline los medios como data URIs, y los tiles multirresolución
  // no se pueden mapear (sus URL las calcula el visor nivel a nivel). Con tours
  // teselados el paquete saldría sin panoramas, así que la opción se cierra.
  const hasMultires = (editor.snapshot?.scenes ?? []).some((sc) => {
    try {
      return (JSON.parse(sc.sourceJson ?? "{}") as { kind?: string }).kind === "multires";
    } catch {
      return false;
    }
  });
  const [scorm, setScorm] = useState<"" | ScormVersion>("");
  const [kiosk, setKiosk] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async (): Promise<void> => {
    setBusy(true);
    setProgress(t("export_progress"));
    try {
      const { tour, assets } = await api<{ tour: Tour; assets: { rel: string; key: string }[] }>(
        `/projects/${project.id}/export`,
        { method: "POST", body: {} },
      );
      // Ficheros del visor
      const viewerList = await fetch("/viewer/files.json").then((r) => (r.ok ? (r.json() as Promise<string[]>) : []));
      const viewerFiles = await Promise.all(
        // Los sourcemaps no se publican: ahorran ~1,5 MB en cada paquete
        viewerList
          .filter((path) => !path.endsWith(".map"))
          .map(async (path) => ({
            path,
            data: new Uint8Array(await (await fetch(`/viewer/${path}`)).arrayBuffer()),
          })),
      );
      const assetProvider: AssetProvider = {
        list: async () => assets.map((a) => a.rel),
        read: async (rel) => {
          const res = await fetch(`/api/v1/projects/${project.id}/preview/${rel}`, { credentials: "same-origin" });
          if (!res.ok) throw new Error(`No se pudo leer ${rel}`);
          return new Uint8Array(await res.arrayBuffer());
        },
      };
      const chunks: Uint8Array[] = [];
      const writer = new ZipWriter((c) => {
        chunks.push(c);
      });
      const result = await runExport(
        tour,
        viewerFiles,
        assetProvider,
        {
          langs,
          maxLevels: maxLevels !== "" ? parseInt(maxLevels, 10) : null,
          includeDownloads: downloads,
          analyticsEndpoint: analyticsEndpoint !== "" ? analyticsEndpoint : null,
          serviceWorker: sw,
          singleFile: single,
          scorm: scorm !== "" ? scorm : null,
          kiosk,
        },
        writer,
        (p) => setProgress(`${t("export_progress")}: ${p.phase} ${p.done}/${p.total}`),
      );
      const blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.slug}${scorm !== "" ? "-scorm" : ""}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setProgress(`${t("export_done")}: ${result.files} ficheros, ${(result.bytes / 1024 / 1024).toFixed(1)} MB`);
      toast.push(t("export_done"), "ok");
    } catch (err) {
      setProgress(null);
      toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("export_title")}
      footer={
        <Button onClick={() => void doExport()} loading={busy}>
          {t("export_start")}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label={t("export_langs")}>
          <div className="flex flex-wrap gap-3">
            {allLangs.map((lang) => (
              <label key={lang} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={langs.includes(lang)}
                  onChange={(e) => setLangs((prev) => (e.target.checked ? [...prev, lang] : prev.filter((l) => l !== lang)))}
                />
                {lang}
              </label>
            ))}
          </div>
        </Field>
        <Field label={t("export_max_res")} htmlFor="ex-res">
          <Select id="ex-res" value={maxLevels} onChange={(e) => setMaxLevels(e.target.value)}>
            <option value="">{t("export_full_res")}</option>
            <option value="3">~2K</option>
            <option value="4">~4K</option>
            <option value="5">~8K</option>
          </Select>
        </Field>
        <Switch id="ex-dl" checked={downloads} onCheckedChange={setDownloads} label={t("export_downloads")} />
        <Field label={t("export_analytics")} htmlFor="ex-analytics">
          <Input id="ex-analytics" value={analyticsEndpoint} onChange={(e) => setAnalyticsEndpoint(e.target.value)} placeholder="https://mi-instancia/ingest/e" />
        </Field>
        <Switch id="ex-sw" checked={sw} onCheckedChange={setSw} label={t("export_sw")} />
        <Switch
          id="ex-single"
          checked={single && !hasMultires}
          disabled={hasMultires}
          onCheckedChange={setSingle}
          label={t("export_single")}
        />
        {hasMultires && <p className="-mt-2 pl-1 text-xs text-[var(--anda-text-dim)]">{t("export_single_multires")}</p>}
        <Field label={t("export_scorm")} htmlFor="ex-scorm">
          <Select id="ex-scorm" value={scorm} onChange={(e) => setScorm(e.target.value as "" | ScormVersion)}>
            <option value="">-</option>
            <option value="1.2">SCORM 1.2</option>
            <option value="2004">SCORM 2004 (3rd Ed.)</option>
          </Select>
        </Field>
        <Switch id="ex-kiosk" checked={kiosk} onCheckedChange={setKiosk} label={t("export_kiosk")} />
        <p className="rounded-lg bg-[var(--anda-surface-2)] p-3 text-xs text-[var(--anda-text-dim)]">{t("export_vr_note")}</p>
        {progress != null && <p className="text-sm text-[var(--anda-text-dim)]">{progress}</p>}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Visita guiada en vivo (§2.15)
// ---------------------------------------------------------------------------

export function LiveDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project: ProjectInfo }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const [room, setRoom] = useState<{ code: string; guideKey: string } | null>(null);
  const base = project.publication != null ? `${location.origin}/t/${project.publication.slug}` : null;

  const create = async (): Promise<void> => {
    const res = await api<{ code: string; guideKey: string }>("/live/rooms", { method: "POST", body: {} });
    setRoom(res);
  };

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(() => toast.push(t("copied"), "ok"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t("live_tour")}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--anda-text-dim)]">{t("live_note")}</p>
        {base == null ? (
          <p className="text-sm text-[var(--anda-danger)]">{t("publish")} primero.</p>
        ) : room == null ? (
          <Button onClick={() => void create()}>{t("live_create")}</Button>
        ) : (
          <>
            <Field label={t("live_guide_link")}>
              <div className="flex gap-2">
                <Input readOnly value={`${base}?live=${room.code}&guide=${room.guideKey}`} aria-label={t("live_guide_link")} />
                <Button variant="secondary" className="shrink-0" onClick={() => copy(`${base}?live=${room.code}&guide=${room.guideKey}`)}>
                  {t("copy")}
                </Button>
              </div>
            </Field>
            <Field label={t("live_attendee_link")}>
              <div className="flex gap-2">
                <Input readOnly value={`${base}?live=${room.code}`} aria-label={t("live_attendee_link")} />
                <Button variant="secondary" className="shrink-0" onClick={() => copy(`${base}?live=${room.code}`)}>
                  {t("copy")}
                </Button>
              </div>
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}
