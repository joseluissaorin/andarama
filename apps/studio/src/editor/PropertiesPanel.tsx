import { useState } from "react";
import { ChevronRight, Crosshair, Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Switch, Textarea } from "@ull360/ui";
import { useEditor, type HotspotRow, type SceneRow } from "../stores";
import { useT } from "../i18n";
import { clientId, readJson } from "./editorApi";
import { getCurrentEditorView, setPlacementMode } from "./ScenesView";
import { MediaPicker } from "./MediaPicker";
import type { ProjectInfo } from "./EditorPage";
import type { MediaItem } from "../pages/MediaPage";

const HOTSPOT_TYPES = [
  "navigation", "text", "image", "gallery", "videoFile", "embedVideo", "audio", "pdf",
  "model3d", "web", "form", "compare", "quiz", "polygon", "tooltip", "link", "state",
] as const;

export function PropertiesPanel({ project, scene, canEdit }: {
  project: ProjectInfo;
  scene: SceneRow;
  canEdit: boolean;
}): React.ReactNode {
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const hotspots = snapshot.hotspots.filter((h) => h.sceneId === scene.id);
  const selectedHotspot = hotspots.find((h) => h.id === editor.selectedHotspotId) ?? null;

  if (selectedHotspot != null) {
    return <HotspotProperties project={project} scene={scene} hotspot={selectedHotspot} canEdit={canEdit} />;
  }
  return <SceneProperties project={project} scene={scene} hotspots={hotspots} canEdit={canEdit} />;
}

// ---------------------------------------------------------------------------
// Propiedades de escena
// ---------------------------------------------------------------------------

function SceneProperties({ project: _project, scene, hotspots, canEdit }: {
  project: ProjectInfo;
  scene: SceneRow;
  hotspots: HotspotRow[];
  canEdit: boolean;
}): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const [pickerFor, setPickerFor] = useState<"panorama" | "ambient" | "narration" | null>(null);
  const meta = readJson<Record<string, unknown>>(scene.metaJson, {});
  const audio = readJson<Record<string, any>>(scene.audioJson, {});
  const map = readJson<Record<string, any>>(scene.mapJson, {});
  const limits = readJson<Record<string, number>>(scene.limitsJson, {});
  const isVideo = scene.type === "video";

  const patchScene = (fn: (s: SceneRow) => void): void => {
    editor.apply((draft) => {
      const target = draft.scenes.find((s) => s.id === scene.id);
      if (target != null) fn(target);
    });
  };
  const patchMeta = (patch: Record<string, unknown>): void =>
    patchScene((s) => {
      s.metaJson = JSON.stringify({ ...readJson(s.metaJson, {}), ...patch });
    });

  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{scene.title}</h3>
        <div className="space-y-3">
          <Field label={t("scene_title")} htmlFor="sc-title">
            <Input id="sc-title" value={scene.title} disabled={!canEdit} onChange={(e) => patchScene((s) => { s.title = e.target.value; })} />
          </Field>
          <Field label={t("type")} htmlFor="sc-type">
            <Select id="sc-type" value={scene.type} disabled={!canEdit} onChange={(e) => patchScene((s) => { s.type = e.target.value as SceneRow["type"]; })}>
              <option value="image">{t("media_kind_panorama")}</option>
              <option value="video">{t("media_kind_video")} 360</option>
              <option value="flat">Gigapixel 2D</option>
            </Select>
          </Field>
          <Field label={t("select_panorama")}>
            <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setPickerFor("panorama")}>
              {scene.mediaId != null ? scene.mediaId.slice(0, 12) : t("select_media")}
            </Button>
          </Field>
          <Field label={t("alt_text")} htmlFor="sc-alt" hint={t("alt_required")}>
            <Textarea id="sc-alt" rows={2} value={String(meta.altText ?? "")} disabled={!canEdit} onChange={(e) => patchMeta({ altText: e.target.value })} />
            {scene.mediaId != null && canEdit && (
              <AiAltButton mediaId={scene.mediaId} onSuggestion={(text) => patchMeta({ altText: text })} />
            )}
          </Field>
          <Field label={t("description")} htmlFor="sc-desc">
            <Textarea id="sc-desc" rows={2} value={String(meta.description ?? "")} disabled={!canEdit} onChange={(e) => patchMeta({ description: e.target.value })} />
          </Field>
          <Field label={t("category")} htmlFor="sc-cat">
            <Input id="sc-cat" value={String(meta.category ?? "")} disabled={!canEdit} onChange={(e) => patchMeta({ category: e.target.value })} />
          </Field>
          <Switch id="sc-hidden" checked={meta.hidden === true} onCheckedChange={(v) => patchMeta({ hidden: v })} label={t("hidden_scene")} disabled={!canEdit} />
        </div>
      </div>

      <Section title={t("initial_view")}>
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit}
          onClick={() => patchScene((s) => { s.initialViewJson = JSON.stringify(getCurrentEditorView()); })}
        >
          <Crosshair className="h-4 w-4" /> {t("use_current_view")}
        </Button>
        {scene.initialViewJson != null && (
          <p className="mt-1 text-xs text-[var(--ull-text-dim)]">{scene.initialViewJson}</p>
        )}
      </Section>

      <Section title={t("view_limits")}>
        <div className="grid grid-cols-2 gap-2">
          {(["pitchMin", "pitchMax", "yawMin", "yawMax", "fovMin", "fovMax"] as const).map((key) => (
            <Field key={key} label={key} htmlFor={`lim-${key}`}>
              <Input
                id={`lim-${key}`}
                type="number"
                step="0.1"
                value={limits[key] != null ? String(limits[key]) : ""}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = { ...limits };
                  if (e.target.value === "") delete next[key];
                  else next[key] = parseFloat(e.target.value);
                  patchScene((s) => { s.limitsJson = Object.keys(next).length > 0 ? JSON.stringify(next) : null; });
                }}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title={t("scene_audio")}>
        <Field label={t("ambient")}>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setPickerFor("ambient")}>
              {audio.ambient?.url != null ? String(audio.ambient.url).slice(0, 18) : t("select_media")}
            </Button>
            {audio.ambient != null && (
              <Button size="sm" variant="ghost" aria-label={t("delete")} disabled={!canEdit} onClick={() => patchScene((s) => {
                const a = readJson<Record<string, unknown>>(s.audioJson, {});
                delete a.ambient;
                s.audioJson = Object.keys(a).length > 0 ? JSON.stringify(a) : null;
              })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Field>
        <Field label={t("narration")}>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setPickerFor("narration")}>
              {audio.narration?.url != null ? String(audio.narration.url).slice(0, 18) : t("select_media")}
            </Button>
          </div>
        </Field>
        {audio.narration != null && (
          <Switch
            id="sc-block-nav"
            checked={audio.narration.blockNavigation === true}
            disabled={!canEdit}
            onCheckedChange={(v) => patchScene((s) => {
              const a = readJson<Record<string, any>>(s.audioJson, {});
              a.narration = { ...a.narration, blockNavigation: v };
              s.audioJson = JSON.stringify(a);
            })}
            label={t("block_navigation")}
          />
        )}
      </Section>

      <Section title={t("gps_coords")}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("lat")} htmlFor="sc-lat">
            <Input id="sc-lat" type="number" step="0.00001" value={map.lat != null ? String(map.lat) : ""} disabled={!canEdit}
              onChange={(e) => patchScene((s) => {
                const m = readJson<Record<string, any>>(s.mapJson, {});
                if (e.target.value === "") delete m.lat; else m.lat = parseFloat(e.target.value);
                s.mapJson = Object.keys(m).length > 0 ? JSON.stringify(m) : null;
              })} />
          </Field>
          <Field label={t("lng")} htmlFor="sc-lng">
            <Input id="sc-lng" type="number" step="0.00001" value={map.lng != null ? String(map.lng) : ""} disabled={!canEdit}
              onChange={(e) => patchScene((s) => {
                const m = readJson<Record<string, any>>(s.mapJson, {});
                if (e.target.value === "") delete m.lng; else m.lng = parseFloat(e.target.value);
                s.mapJson = Object.keys(m).length > 0 ? JSON.stringify(m) : null;
              })} />
          </Field>
        </div>
      </Section>

      <Section title={`${t("add_hotspot")} (${hotspots.length})`}>
        {canEdit && (
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            {HOTSPOT_TYPES.map((type) => (
              <Button
                key={type}
                size="sm"
                variant="outline"
                className="justify-start text-xs"
                onClick={() => setPlacementMode(type === "polygon" ? { kind: "polygon", points: [] } : { kind: "hotspot", type })}
              >
                <Plus className="h-3 w-3" /> {t(`hotspot_${type}`)}
              </Button>
            ))}
          </div>
        )}
        <div className="space-y-1">
          {hotspots.map((h) => {
            const content = readJson<Record<string, unknown>>(h.contentJson, {});
            const label = String(content.label ?? content.altText ?? t(`hotspot_${h.type}`));
            return (
              <button
                key={h.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[var(--ull-surface-2)]"
                onClick={() => useEditor.getState().select(scene.id, h.id)}
              >
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ull-text-dim)]" />
                <span className="flex-1 truncate">{label}</span>
                <span className="text-[11px] text-[var(--ull-text-dim)]">{t(`hotspot_${h.type}`)}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {isVideo && <TimelinePanel scene={scene} hotspots={hotspots} canEdit={canEdit} />}

      <MediaPicker
        open={pickerFor != null}
        onClose={() => setPickerFor(null)}
        kind={pickerFor === "panorama" ? undefined : "audio"}
        onSelect={(item: MediaItem) => {
          if (pickerFor === "panorama") {
            patchScene((s) => {
              s.mediaId = item.id;
              if (item.kind === "video") s.type = "video";
              s.metaJson = JSON.stringify({ ...readJson(s.metaJson, {}), thumbnail: `thumb:${item.id}` });
            });
          } else if (pickerFor === "ambient" || pickerFor === "narration") {
            patchScene((s) => {
              const a = readJson<Record<string, any>>(s.audioJson, {});
              a[pickerFor] = { ...(a[pickerFor] ?? {}), url: `media:${item.id}` };
              s.audioJson = JSON.stringify(a);
            });
          }
        }}
      />
    </div>
  );
}

/** Timeline de hotspots para escenas de video (§3.4). */
function TimelinePanel({ scene: _scene, hotspots, canEdit }: { scene: SceneRow; hotspots: HotspotRow[]; canEdit: boolean }): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  return (
    <Section title={t("timeline")}>
      <p className="mb-2 text-xs text-[var(--ull-text-dim)]">{t("timeline_hint")}</p>
      {hotspots.map((h) => {
        const cond = readJson<Record<string, any>>(h.conditionsJson, {});
        const range = cond.videoTime ?? {};
        return (
          <div key={h.id} className="mb-2 flex items-center gap-2 text-xs">
            <span className="w-24 truncate">{t(`hotspot_${h.type}`)}</span>
            <Input
              type="number"
              className="max-w-20"
              placeholder={t("from_s")}
              value={range.from != null ? String(range.from) : ""}
              disabled={!canEdit}
              aria-label={t("from_s")}
              onChange={(e) => {
                editor.apply((draft) => {
                  const target = draft.hotspots.find((x) => x.id === h.id);
                  if (target == null) return;
                  const c = readJson<Record<string, any>>(target.conditionsJson, {});
                  if (e.target.value === "" && (c.videoTime?.to ?? null) == null) delete c.videoTime;
                  else c.videoTime = { from: parseFloat(e.target.value || "0"), to: c.videoTime?.to ?? 99999 };
                  target.conditionsJson = Object.keys(c).length > 0 ? JSON.stringify(c) : null;
                });
              }}
            />
            <Input
              type="number"
              className="max-w-20"
              placeholder={t("to_s")}
              value={range.to != null && range.to !== 99999 ? String(range.to) : ""}
              disabled={!canEdit}
              aria-label={t("to_s")}
              onChange={(e) => {
                editor.apply((draft) => {
                  const target = draft.hotspots.find((x) => x.id === h.id);
                  if (target == null) return;
                  const c = readJson<Record<string, any>>(target.conditionsJson, {});
                  c.videoTime = { from: c.videoTime?.from ?? 0, to: parseFloat(e.target.value || "99999") };
                  target.conditionsJson = JSON.stringify(c);
                });
              }}
            />
          </div>
        );
      })}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Propiedades de hotspot (17 tipos §2.8)
// ---------------------------------------------------------------------------

function HotspotProperties({ project: _project, scene, hotspot, canEdit }: {
  project: ProjectInfo;
  scene: SceneRow;
  hotspot: HotspotRow;
  canEdit: boolean;
}): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const content = readJson<Record<string, any>>(hotspot.contentJson, {});
  const style = readJson<Record<string, any>>(hotspot.styleJson, {});
  const conditions = readJson<Record<string, any>>(hotspot.conditionsJson, {});
  const [pickerField, setPickerField] = useState<string | null>(null);

  const patch = (fn: (h: HotspotRow) => void): void => {
    editor.apply((draft) => {
      const target = draft.hotspots.find((h) => h.id === hotspot.id);
      if (target != null) fn(target);
    });
  };
  const setContent = (patchObj: Record<string, unknown>): void =>
    patch((h) => {
      const c = readJson<Record<string, unknown>>(h.contentJson, {});
      for (const [k, v] of Object.entries(patchObj)) {
        if (v === undefined) delete c[k];
        else c[k] = v;
      }
      h.contentJson = JSON.stringify(c);
    });
  const setStyle = (patchObj: Record<string, unknown>): void =>
    patch((h) => {
      const s = { ...readJson<Record<string, unknown>>(h.styleJson, {}), ...patchObj };
      h.styleJson = JSON.stringify(s);
    });

  const text = (key: string, label: string, opts: { textarea?: boolean; hint?: string } = {}): React.ReactNode => (
    <Field label={label} htmlFor={`hs-${key}`} hint={opts.hint}>
      {opts.textarea === true ? (
        <Textarea id={`hs-${key}`} rows={4} value={String(content[key] ?? "")} disabled={!canEdit} onChange={(e) => setContent({ [key]: e.target.value })} />
      ) : (
        <Input id={`hs-${key}`} value={String(content[key] ?? "")} disabled={!canEdit} onChange={(e) => setContent({ [key]: e.target.value })} />
      )}
    </Field>
  );

  const mediaButton = (key: string, label: string, kind?: string): React.ReactNode => (
    <Field label={label}>
      <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setPickerField(`${key}:${kind ?? ""}`)}>
        {content[key] != null && content[key] !== "" ? String(content[key]).slice(0, 22) : t("select_media")}
      </Button>
    </Field>
  );

  const sceneOptions = snapshot.scenes.map((s) => (
    <option key={s.id} value={s.id}>
      {s.title}
    </option>
  ));

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center justify-between">
        <button type="button" className="text-[13px] text-[var(--ull-primary)] hover:underline" onClick={() => editor.select(scene.id, null)}>
          {"< "}{scene.title}
        </button>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("delete")}
            onClick={() => {
              editor.apply((draft) => {
                draft.hotspots = draft.hotspots.filter((h) => h.id !== hotspot.id);
              });
              editor.select(scene.id, null);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <h3 className="text-[15px] font-semibold">{t(`hotspot_${hotspot.type}`)}</h3>

      <Field label={t("label")} htmlFor="hs-label">
        <Input id="hs-label" value={String(content.label ?? "")} disabled={!canEdit} onChange={(e) => setContent({ label: e.target.value })} />
      </Field>
      <Field label={t("alt_text")} htmlFor="hs-alt">
        <Input id="hs-alt" value={String(content.altText ?? "")} disabled={!canEdit} onChange={(e) => setContent({ altText: e.target.value })} />
      </Field>

      {/* Contenido por tipo */}
      <Section title={t("content")}>
        {hotspot.type === "navigation" && (
          <>
            <Field label={t("target_scene")} htmlFor="hs-target">
              <Select id="hs-target" value={String(content.target ?? "")} disabled={!canEdit} onChange={(e) => setContent({ target: e.target.value })}>
                <option value="">-</option>
                {sceneOptions}
              </Select>
            </Field>
            <Field label={t("entry_mode")} htmlFor="hs-entry">
              <Select
                id="hs-entry"
                value={String(content.entry?.mode ?? "relative")}
                disabled={!canEdit}
                onChange={(e) => setContent({ entry: { ...(content.entry ?? {}), mode: e.target.value } })}
              >
                <option value="fixed">{t("entry_fixed")}</option>
                <option value="relative">{t("entry_relative")}</option>
                <option value="lookBack">{t("entry_lookback")}</option>
              </Select>
            </Field>
            {content.entry?.mode === "fixed" && (
              <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setContent({ entry: { mode: "fixed", ...getCurrentEditorView() } })}>
                <Crosshair className="h-4 w-4" /> {t("use_current_view")}
              </Button>
            )}
            <Switch
              id="hs-floorarrow"
              checked={content.variant === "floorArrow"}
              disabled={!canEdit}
              onCheckedChange={(v) => setContent({ variant: v ? "floorArrow" : undefined })}
              label={t("floor_arrow")}
            />
          </>
        )}
        {hotspot.type === "text" && text("body", t("body_text"), { textarea: true, hint: t("markdown_hint") })}
        {hotspot.type === "image" && (
          <>
            {mediaButton("url", t("hotspot_image"), "image")}
            {text("caption", "Pie de foto")}
            <Switch id="hs-dl" checked={content.download === true} disabled={!canEdit} onCheckedChange={(v) => setContent({ download: v })} label={t("export_downloads")} />
          </>
        )}
        {hotspot.type === "gallery" && (
          <GalleryEditor items={(content.items as any[]) ?? []} canEdit={canEdit} onChange={(items) => setContent({ items })} onPick={() => setPickerField("gallery-add:image")} />
        )}
        {hotspot.type === "videoFile" && (
          <>
            {mediaButton("url", t("hotspot_videoFile"), "video")}
            <Field label="Modo" htmlFor="hs-vmode">
              <Select id="hs-vmode" value={String(content.mode ?? "lightbox")} disabled={!canEdit} onChange={(e) => setContent({ mode: e.target.value })}>
                <option value="lightbox">Lightbox</option>
                <option value="projected">Pantalla proyectada</option>
              </Select>
            </Field>
          </>
        )}
        {hotspot.type === "embedVideo" && (
          <>
            <Field label="Proveedor" htmlFor="hs-provider">
              <Select id="hs-provider" value={String(content.provider ?? "youtube")} disabled={!canEdit} onChange={(e) => setContent({ provider: e.target.value })}>
                <option value="youtube">YouTube</option>
                <option value="vimeo">Vimeo</option>
                <option value="peertube">PeerTube</option>
              </Select>
            </Field>
            {text("videoId", "ID de video")}
            {content.provider === "peertube" && text("host", "Host de la instancia")}
            <Switch id="hs-nocookie" checked={content.nocookie !== false} disabled={!canEdit} onCheckedChange={(v) => setContent({ nocookie: v })} label="Sin cookies" />
          </>
        )}
        {hotspot.type === "audio" && (
          <>
            {mediaButton("url", t("hotspot_audio"), "audio")}
            <Field label="Modo" htmlFor="hs-amode">
              <Select id="hs-amode" value={String(content.mode ?? "player")} disabled={!canEdit} onChange={(e) => setContent({ mode: e.target.value })}>
                <option value="player">Reproductor</option>
                <option value="spatial">{t("spatial_audio")}</option>
              </Select>
            </Field>
            {text("transcript", "Transcripcion", { textarea: true })}
          </>
        )}
        {hotspot.type === "pdf" && (
          <>
            {mediaButton("url", "PDF", "pdf")}
            <Switch id="hs-pdfdl" checked={content.download === true} disabled={!canEdit} onCheckedChange={(v) => setContent({ download: v })} label={t("export_downloads")} />
          </>
        )}
        {hotspot.type === "model3d" && (
          <>
            {mediaButton("url", t("hotspot_model3d"), "model")}
            <Field label="Formato" htmlFor="hs-format">
              <Select id="hs-format" value={String(content.format ?? "glb")} disabled={!canEdit} onChange={(e) => setContent({ format: e.target.value })}>
                <option value="glb">glTF/GLB</option>
                <option value="obj">OBJ</option>
                <option value="stl">STL</option>
              </Select>
            </Field>
            <Switch id="hs-ar" checked={content.ar === true} disabled={!canEdit} onCheckedChange={(v) => setContent({ ar: v })} label="AR en moviles" />
          </>
        )}
        {hotspot.type === "web" && (
          <>
            {text("url", "URL")}
            <Field label="Alto (px)" htmlFor="hs-height">
              <Input id="hs-height" type="number" value={String(content.height ?? 480)} disabled={!canEdit} onChange={(e) => setContent({ height: parseInt(e.target.value, 10) })} />
            </Field>
          </>
        )}
        {hotspot.type === "form" && (
          <FormEditor fields={(content.fields as any[]) ?? []} destination={content.destination ?? { api: true }} turnstile={content.turnstile === true} canEdit={canEdit} onChange={setContent} />
        )}
        {hotspot.type === "compare" && (
          <>
            <Field label="Modo" htmlFor="hs-cmode">
              <Select id="hs-cmode" value={String(content.mode ?? "images")} disabled={!canEdit} onChange={(e) => setContent({ mode: e.target.value })}>
                <option value="images">Dos imagenes</option>
                <option value="panoramas">{t("compare_scenes")}</option>
              </Select>
            </Field>
            {content.mode === "panoramas" ? (
              <>
                <Field label={t("scene_before")} htmlFor="hs-cb">
                  <Select id="hs-cb" value={String(content.before?.sceneId ?? "")} disabled={!canEdit} onChange={(e) => setContent({ before: { ...content.before, sceneId: e.target.value } })}>
                    <option value="">-</option>
                    {sceneOptions}
                  </Select>
                </Field>
                <Field label={t("scene_after")} htmlFor="hs-ca">
                  <Select id="hs-ca" value={String(content.after?.sceneId ?? "")} disabled={!canEdit} onChange={(e) => setContent({ after: { ...content.after, sceneId: e.target.value } })}>
                    <option value="">-</option>
                    {sceneOptions}
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <Field label={t("before_image")}>
                  <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setPickerField("compare-before:image")}>
                    {content.before?.url != null ? String(content.before.url).slice(0, 20) : t("select_media")}
                  </Button>
                </Field>
                <Field label={t("after_image")}>
                  <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setPickerField("compare-after:image")}>
                    {content.after?.url != null ? String(content.after.url).slice(0, 20) : t("select_media")}
                  </Button>
                </Field>
              </>
            )}
          </>
        )}
        {hotspot.type === "quiz" && (
          <QuizEditor content={content} canEdit={canEdit} onChange={setContent} />
        )}
        {hotspot.type === "polygon" && (
          <>
            <Field label="Relleno" htmlFor="hs-fill">
              <Input id="hs-fill" type="color" value={String(content.fill ?? "#0ea5e9")} disabled={!canEdit} onChange={(e) => setContent({ fill: e.target.value })} />
            </Field>
            <Field label="Accion" htmlFor="hs-paction">
              <Select
                id="hs-paction"
                value={String(content.action?.kind ?? "none")}
                disabled={!canEdit}
                onChange={(e) => {
                  const kind = e.target.value;
                  setContent({ action: kind === "none" ? undefined : kind === "goto" ? { kind, target: snapshot.scenes[0]?.id ?? "" } : { kind, url: "https://" } });
                }}
              >
                <option value="none">-</option>
                <option value="goto">{t("hotspot_navigation")}</option>
                <option value="openUrl">{t("hotspot_link")}</option>
              </Select>
            </Field>
            {content.action?.kind === "goto" && (
              <Field label={t("target_scene")} htmlFor="hs-ptarget">
                <Select id="hs-ptarget" value={String(content.action.target ?? "")} disabled={!canEdit} onChange={(e) => setContent({ action: { kind: "goto", target: e.target.value } })}>
                  {sceneOptions}
                </Select>
              </Field>
            )}
            {content.action?.kind === "openUrl" && text("action", "URL")}
          </>
        )}
        {hotspot.type === "tooltip" && (
          <>
            {text("text", t("body_text"))}
            <Switch id="hs-perm" checked={content.permanent === true} disabled={!canEdit} onCheckedChange={(v) => setContent({ permanent: v })} label="Permanente" />
          </>
        )}
        {hotspot.type === "link" && (
          <>
            {text("url", "URL")}
            <Field label="Tipo" htmlFor="hs-scheme">
              <Select id="hs-scheme" value={String(content.scheme ?? "url")} disabled={!canEdit} onChange={(e) => setContent({ scheme: e.target.value })}>
                <option value="url">URL</option>
                <option value="tel">Telefono</option>
                <option value="mailto">Email</option>
              </Select>
            </Field>
          </>
        )}
        {hotspot.type === "state" && (
          <StateEditor content={content} scenes={snapshot.scenes} canEdit={canEdit} onChange={setContent} />
        )}
      </Section>

      {/* Estilo */}
      <Section title={t("style")}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("icon_size")} htmlFor="hs-size">
            <Input id="hs-size" type="number" value={String(style.icon?.size ?? 44)} disabled={!canEdit}
              onChange={(e) => setStyle({ icon: { ...(style.icon ?? {}), size: parseInt(e.target.value, 10) } })} />
          </Field>
          <Field label={t("icon_color")} htmlFor="hs-color">
            <Input id="hs-color" type="color" value={String(style.icon?.color ?? "#ffffff")} disabled={!canEdit}
              onChange={(e) => setStyle({ icon: { ...(style.icon ?? {}), color: e.target.value } })} />
          </Field>
        </div>
        <Switch id="hs-pulse" checked={style.pulse === true} disabled={!canEdit} onCheckedChange={(v) => setStyle({ pulse: v })} label={t("pulse")} />
        <Switch id="hs-dscale" checked={style.distanceScale !== false} disabled={!canEdit} onCheckedChange={(v) => setStyle({ distanceScale: v })} label={t("distance_scale")} />
      </Section>

      {/* Condiciones de visibilidad */}
      <Section title={t("conditions")}>
        <Field label={t("visibility_by_lang")} htmlFor="hs-langs" hint="es, en (vacio = todos)">
          <Input
            id="hs-langs"
            value={((conditions.langs as string[]) ?? []).join(", ")}
            disabled={!canEdit}
            onChange={(e) => {
              const langs = e.target.value.split(",").map((l) => l.trim()).filter((l) => l !== "");
              patch((h) => {
                const c = readJson<Record<string, unknown>>(h.conditionsJson, {});
                if (langs.length === 0) delete c.langs;
                else c.langs = langs;
                h.conditionsJson = Object.keys(c).length > 0 ? JSON.stringify(c) : null;
              });
            }}
          />
        </Field>
        <Field label={t("visibility_by_var")} htmlFor="hs-vars" hint='JSON: [{"var":"puerta","op":"truthy"}]'>
          <Textarea
            id="hs-vars"
            rows={2}
            defaultValue={conditions.vars != null ? JSON.stringify(conditions.vars) : ""}
            disabled={!canEdit}
            onBlur={(e) => {
              patch((h) => {
                const c = readJson<Record<string, unknown>>(h.conditionsJson, {});
                if (e.target.value.trim() === "") delete c.vars;
                else {
                  try {
                    c.vars = JSON.parse(e.target.value);
                  } catch {
                    return;
                  }
                }
                h.conditionsJson = Object.keys(c).length > 0 ? JSON.stringify(c) : null;
              });
            }}
          />
        </Field>
      </Section>

      <MediaPicker
        open={pickerField != null}
        onClose={() => setPickerField(null)}
        kind={pickerField?.split(":")[1] === "" ? undefined : pickerField?.split(":")[1]}
        onSelect={(item) => {
          const field = pickerField?.split(":")[0];
          if (field == null) return;
          if (field === "gallery-add") {
            const items = [...((content.items as any[]) ?? []), { url: `media:${item.id}`, title: item.filename }];
            setContent({ items });
          } else if (field === "compare-before") {
            setContent({ before: { ...content.before, url: `media:${item.id}` } });
          } else if (field === "compare-after") {
            setContent({ after: { ...content.after, url: `media:${item.id}` } });
          } else {
            setContent({ [field]: `media:${item.id}` });
          }
        }}
      />
    </div>
  );
}

/**
 * Sugerencia de alt-text con Workers AI (§2.11): siempre revisable; el
 * boton solo aparece si la instancia tiene el binding de IA (404 lo oculta).
 */
function AiAltButton({ mediaId, onSuggestion }: { mediaId: string; onSuggestion: (text: string) => void }): React.ReactNode {
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(true);
  if (!available) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      className="mt-1"
      onClick={() => {
        setBusy(true);
        void import("../api")
          .then(({ api }) => api<{ suggestion: string }>("/ai/alt-text", { method: "POST", body: { imageUrl: `/api/v1/media/${mediaId}/derived/thumb` } }))
          .then((r) => {
            if (r.suggestion !== "") onSuggestion(r.suggestion);
          })
          .catch((err: { status?: number }) => {
            if (err.status === 404) setAvailable(false);
          })
          .finally(() => setBusy(false));
      }}
    >
      Sugerir con IA
    </Button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactNode {
  return (
    <details open className="group rounded-xl border border-[var(--ull-border)] bg-[var(--ull-bg)] shadow-sm">
      <summary className="flex cursor-pointer select-none items-center justify-between rounded-xl px-3.5 py-2.5 text-[12.5px] font-bold uppercase tracking-wide text-[var(--ull-text-dim)] transition-colors hover:text-[var(--ull-text)]">
        {title}
        <span className="text-[10px] transition-transform group-open:rotate-180" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </summary>
      <div className="space-y-3 px-3.5 pb-4 pt-1">{children}</div>
    </details>
  );
}

function GalleryEditor({ items, canEdit, onChange, onPick }: {
  items: { url: string; title?: string; description?: string }[];
  canEdit: boolean;
  onChange: (items: unknown[]) => void;
  onPick: () => void;
}): React.ReactNode {
  const t = useT();
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-[var(--ull-border)] p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="truncate font-mono">{item.url.slice(0, 24)}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t("delete")} disabled={!canEdit}
              onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Input className="mt-1" placeholder={t("title")} value={item.title ?? ""} disabled={!canEdit}
            onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, title: e.target.value } : it)))} />
        </div>
      ))}
      <Button size="sm" variant="outline" disabled={!canEdit} onClick={onPick}>
        <Plus className="h-4 w-4" /> {t("add_option")}
      </Button>
    </div>
  );
}

function FormEditor({ fields, destination, turnstile, canEdit, onChange }: {
  fields: { id: string; type: string; label: string; required?: boolean; options?: { value: string; label: string }[] }[];
  destination: { api?: boolean; webhook?: string; email?: string };
  turnstile: boolean;
  canEdit: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}): React.ReactNode {
  const t = useT();
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="rounded-lg border border-[var(--ull-border)] p-2">
          <div className="flex gap-1.5">
            <Input value={f.label} placeholder={t("label")} disabled={!canEdit} aria-label={t("label")}
              onChange={(e) => onChange({ fields: fields.map((x, j) => (j === i ? { ...x, label: e.target.value, id: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_") || x.id } : x)) })} />
            <Select value={f.type} disabled={!canEdit} aria-label={t("type")} className="max-w-28"
              onChange={(e) => onChange({ fields: fields.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>
              {["text", "email", "tel", "select", "checkbox", "textarea"].map((ft) => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </Select>
            <Button variant="ghost" size="icon" aria-label={t("delete")} disabled={!canEdit}
              onClick={() => onChange({ fields: fields.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={f.required === true} disabled={!canEdit}
                onChange={(e) => onChange({ fields: fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} />
              {t("required")}
            </label>
            {f.type === "select" && (
              <Input className="flex-1 text-xs" placeholder="op1, op2, op3" disabled={!canEdit} aria-label={t("options")}
                value={(f.options ?? []).map((o) => o.label).join(", ")}
                onChange={(e) => onChange({ fields: fields.map((x, j) => (j === i ? { ...x, options: e.target.value.split(",").map((v) => ({ value: v.trim(), label: v.trim() })) } : x)) })} />
            )}
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" disabled={!canEdit}
        onClick={() => onChange({ fields: [...fields, { id: `campo_${fields.length + 1}`, type: "text", label: `Campo ${fields.length + 1}` }] })}>
        <Plus className="h-4 w-4" /> {t("add_field")}
      </Button>
      <Field label={t("webhook_url")} htmlFor="form-wh">
        <Input id="form-wh" value={destination.webhook ?? ""} disabled={!canEdit}
          onChange={(e) => onChange({ destination: { ...destination, webhook: e.target.value || undefined } })} />
      </Field>
      <Switch id="form-ts" checked={turnstile} disabled={!canEdit} onCheckedChange={(v) => onChange({ turnstile: v })} label="Turnstile anti-spam" />
    </div>
  );
}

function QuizEditor({ content, canEdit, onChange }: {
  content: Record<string, any>;
  canEdit: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}): React.ReactNode {
  const t = useT();
  const options = (content.options as { id: string; text: string; correct?: boolean }[]) ?? [];
  return (
    <div className="space-y-3">
      <Field label={t("question")} htmlFor="qz-q">
        <Textarea id="qz-q" rows={2} value={String(content.question ?? "")} disabled={!canEdit} onChange={(e) => onChange({ question: e.target.value })} />
      </Field>
      <Field label={t("type")} htmlFor="qz-kind">
        <Select id="qz-kind" value={String(content.kind ?? "single")} disabled={!canEdit} onChange={(e) => onChange({ kind: e.target.value })}>
          <option value="single">Opcion unica</option>
          <option value="multiple">Opcion multiple</option>
          <option value="boolean">Verdadero/Falso</option>
        </Select>
      </Field>
      <Field label={t("options")}>
        <div className="space-y-1.5">
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={o.correct === true} disabled={!canEdit} aria-label={t("correct")}
                onChange={(e) => onChange({ options: options.map((x, j) => (j === i ? { ...x, correct: e.target.checked } : content.kind === "single" && e.target.checked ? { ...x, correct: false } : x)) })} />
              <Input value={o.text} disabled={!canEdit} aria-label={`Opcion ${i + 1}`}
                onChange={(e) => onChange({ options: options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("delete")} disabled={!canEdit}
                onClick={() => onChange({ options: options.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" disabled={!canEdit}
            onClick={() => onChange({ options: [...options, { id: clientId().slice(0, 8), text: "" }] })}>
            <Plus className="h-4 w-4" /> {t("add_option")}
          </Button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("points")} htmlFor="qz-pts">
          <Input id="qz-pts" type="number" value={String(content.points ?? 1)} disabled={!canEdit} onChange={(e) => onChange({ points: parseInt(e.target.value, 10) })} />
        </Field>
        <Field label={t("attempts")} htmlFor="qz-att">
          <Input id="qz-att" type="number" value={String(content.attempts ?? 0)} disabled={!canEdit} onChange={(e) => onChange({ attempts: parseInt(e.target.value, 10) })} />
        </Field>
      </div>
      <Field label="Feedback correcto" htmlFor="qz-fc">
        <Input id="qz-fc" value={String(content.feedbackCorrect ?? "")} disabled={!canEdit} onChange={(e) => onChange({ feedbackCorrect: e.target.value })} />
      </Field>
      <Field label="Feedback incorrecto" htmlFor="qz-fw">
        <Input id="qz-fw" value={String(content.feedbackWrong ?? "")} disabled={!canEdit} onChange={(e) => onChange({ feedbackWrong: e.target.value })} />
      </Field>
      <Switch id="qz-gate" checked={content.gate === true} disabled={!canEdit} onCheckedChange={(v) => onChange({ gate: v })} label={t("gate")} />
    </div>
  );
}

function StateEditor({ content, scenes, canEdit, onChange }: {
  content: Record<string, any>;
  scenes: SceneRow[];
  canEdit: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}): React.ReactNode {
  const t = useT();
  const actions = (content.actions as { var: string; op: string; value?: unknown }[]) ?? [];
  return (
    <div className="space-y-2">
      {actions.map((a, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input value={a.var} placeholder="variable" disabled={!canEdit} aria-label="Variable"
            onChange={(e) => onChange({ actions: actions.map((x, j) => (j === i ? { ...x, var: e.target.value } : x)) })} />
          <Select value={a.op} disabled={!canEdit} aria-label="Operacion" className="max-w-24"
            onChange={(e) => onChange({ actions: actions.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })}>
            {["set", "inc", "dec", "toggle"].map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </Select>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("delete")} disabled={!canEdit}
            onClick={() => onChange({ actions: actions.filter((_, j) => j !== i) })}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" disabled={!canEdit}
        onClick={() => onChange({ actions: [...actions, { var: "", op: "toggle" }] })}>
        <Plus className="h-4 w-4" /> {t("add_option")}
      </Button>
      <Field label={t("target_scene")} htmlFor="st-goto" hint="Cambiar de escena tras aplicar (opcional)">
        <Select id="st-goto" value={String(content.thenGoto ?? "")} disabled={!canEdit} onChange={(e) => onChange({ thenGoto: e.target.value || undefined })}>
          <option value="">-</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
