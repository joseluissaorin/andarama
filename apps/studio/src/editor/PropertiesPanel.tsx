import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Heading2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  Maximize2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Dialog, Field, Input, Select, Switch, Textarea } from "@andarama/ui";
import { parseVideoRef, renderMarkdown } from "@andarama/viewer-ui";
import { useEditor, type HotspotRow, type SceneRow } from "../stores";
import { useT } from "../i18n";
import { clientId, readJson } from "./editorApi";
import { areaOfScene, areasOf, assignScene, createArea } from "./areas";
import { getCurrentEditorView, highlightHotspot, setEditorView, setPlacementMode } from "./ScenesView";
import { ArrivalsPanel } from "./ArrivalsPanel";
import { HotspotPalette } from "./HotspotPalette";
import { MediaPicker } from "./MediaPicker";
import { ICON_CATALOG } from "./hotspotIcons";
import type { ProjectInfo } from "./EditorPage";
import type { MediaItem } from "../pages/MediaPage";

/** Iconos elegibles (registrados también en el visor). */

/** Una referencia media:<id> del borrador, convertida en URL servible. */
function mediaRefUrl(ref: string): string {
  const m = /^media:([A-Za-z0-9_-]+)$/.exec(ref);
  return m != null ? `/api/v1/media/${m[1]}/file` : ref;
}

/** parseInt con guarda: un campo vacío no debe escribir NaN/null en el JSON. */
function num(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const RAD = Math.PI / 180;
const toDeg = (rad: number): string => (rad / RAD).toFixed(1);

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  // Áreas del tour: la misma cosa que agrupa el grafo, da la categoría del
  // menú de escenas y, si tiene plano, es la planta del minimapa.
  const areas = areasOf(editor.snapshot!);
  const currentArea = areaOfScene(scene);
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
    // El aside es una columna con altura fija: sin este contenedor propio, el
    // formulario de escena se salía por debajo del viewport en vez de rodar.
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      {/* Lo primero, porque es lo que se ajusta mirando el panorama. La vista
          inicial es una llegada más: la de empezar aquí. */}
      <Section title={t("arrivals")} hint={t("arrivals_hint")}>
        <div id="panel-llegadas" />
        <ArrivalsPanel sceneId={scene.id} canEdit={canEdit} onPreview={setEditorView} getCurrentView={getCurrentEditorView} />
      </Section>

      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">{scene.title}</h3>
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
          {/* El panorama se reconoce por la foto, no por su identificador:
              antes aquí salía un «3visq8IE3oDZ» que no le dice nada a nadie. */}
          <Field label={t("select_panorama")}>
            <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setPickerFor("panorama")}>
              {scene.mediaId != null && (
                <img
                  src={`/api/v1/media/${scene.mediaId}/derived/thumb`}
                  alt=""
                  className="-ml-1 h-6 w-10 rounded object-cover"
                  loading="lazy"
                />
              )}
              {scene.mediaId != null ? t("change") : t("select_media")}
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
          {/* El área es la categoría: escribirla a mano acababa en
              «Interiores», «interiores» e «Interior» como tres grupos
              distintos, y además no se veía en el grafo. Se elige de las que
              ya existen en el tour. */}
          <Field label={t("area")} htmlFor="sc-area" hint={t("area_hint")}>
            <div className="flex items-center gap-2">
              <Select
                id="sc-area"
                className="flex-1"
                value={currentArea ?? ""}
                disabled={!canEdit}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setNewCategory("");
                    return;
                  }
                  editor.apply((draft) => assignScene(draft, scene.id, e.target.value === "" ? null : e.target.value));
                }}
              >
                <option value="">{t("area_none")}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                    {a.plan != null ? ` · ${t("floorplan")}` : ""}
                  </option>
                ))}
                <option value="__new__">{t("new_area")}…</option>
              </Select>
            </div>
            {newCategory != null && (
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  autoFocus
                  aria-label={t("new_area")}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCategory.trim() !== "") {
                      editor.apply((draft) => assignScene(draft, scene.id, createArea(draft, newCategory.trim())));
                      setNewCategory(null);
                    } else if (e.key === "Escape") setNewCategory(null);
                  }}
                />
                <Button
                  size="sm"
                  disabled={newCategory.trim() === ""}
                  onClick={() => {
                    editor.apply((draft) => assignScene(draft, scene.id, createArea(draft, newCategory.trim())));
                    setNewCategory(null);
                  }}
                >
                  {t("create")}
                </Button>
              </div>
            )}
          </Field>
          <Switch id="sc-hidden" checked={meta.hidden === true} onCheckedChange={(v) => patchMeta({ hidden: v })} label={t("hidden_scene")} disabled={!canEdit} />
        </div>
      </div>


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

      <Section title={`${t("hotspots")} (${hotspots.length})`}>
        {canEdit && (
          <Button size="sm" variant="outline" className="mb-2 w-full" onClick={() => setPaletteOpen(true)}>
            <Plus className="h-4 w-4" /> {t("add_hotspot_button")}
          </Button>
        )}
        <div className="space-y-0.5">
          {hotspots.map((h) => {
            const content = readJson<Record<string, unknown>>(h.contentJson, {});
            const label = String(content.label ?? content.altText ?? "") || t(`hotspot_${h.type}`);
            return (
              <button
                key={h.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[var(--anda-surface-2)]"
                onClick={() => useEditor.getState().select(scene.id, h.id)}
                onMouseEnter={() => highlightHotspot(h.id)}
                onMouseLeave={() => highlightHotspot(null)}
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--anda-text-dim)]" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {content.unplaced === true && (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                    {t("unplaced_badge")}
                  </span>
                )}
                <span className="shrink-0 text-[11px] text-[var(--anda-text-dim)]">{t(`hotspot_${h.type}`)}</span>
              </button>
            );
          })}
          {hotspots.length === 0 && <p className="px-2 py-1.5 text-[13px] text-[var(--anda-text-dim)]">{t("no_hotspots_yet")}</p>}
        </div>
      </Section>

      <HotspotPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPick={(type) => setPlacementMode(type === "polygon" ? { kind: "polygon", points: [] } : { kind: "hotspot", type })}
      />

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
      <p className="mb-2 text-xs text-[var(--anda-text-dim)]">{t("timeline_hint")}</p>
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
  const [expand, setExpand] = useState<{ key: string; label: string } | null>(null);
  const [activeTab, setTab] = useState<"content" | "style" | "conditions">("content");
  const [iconSearch, setIconSearch] = useState("");
  // Búsqueda sobre nombre y palabras clave, sin tildes para que «baño» case con "bano"
  const sinTildes = (v: string): string => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const iconosFiltrados =
    iconSearch.trim() === ""
      ? ICON_CATALOG
      : ICON_CATALOG.filter((o) => {
          const q = sinTildes(iconSearch.trim());
          return o.name.includes(q) || o.keywords.some((k) => sinTildes(k).includes(q));
        });
  const tourHotspotSize = Number((snapshot.settings.ui as { hotspotSize?: number } | undefined)?.hotspotSize ?? 44);
  const hotspotSize = Number(style.icon?.size ?? tourHotspotSize);
  const hotspotRotation = Number(style.icon?.rotation ?? 0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Al cambiar de marcador se vuelve arriba y a la primera pestaña. Sin esto,
  // el panel conservaba el desplazamiento del formulario anterior —mucho más
  // alto— y se abría por el final, en «Aspecto».
  useEffect(() => {
    setTab("content");
    bodyRef.current?.scrollTo({ top: 0 });
  }, [hotspot.id]);

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

  const text = (key: string, label: string, opts: { textarea?: boolean; hint?: string; placeholder?: string } = {}): React.ReactNode => (
    <Field label={label} htmlFor={`hs-${key}`} hint={opts.hint}>
      {opts.textarea === true ? (
        <MarkdownField
          id={`hs-${key}`}
          rows={4}
          value={String(content[key] ?? "")}
          disabled={!canEdit}
          placeholder={opts.placeholder}
          onChange={(v) => setContent({ [key]: v })}
          onExpand={() => setExpand({ key, label })}
        />
      ) : (
        <Input id={`hs-${key}`} value={String(content[key] ?? "")} placeholder={opts.placeholder} disabled={!canEdit} onChange={(e) => setContent({ [key]: e.target.value })} />
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
    <div className="flex h-full flex-col">
      {/* Cabecera fija: de dónde vengo, qué estoy tocando y cómo borrarlo */}
      <div className="sticky top-0 z-10 border-b border-[var(--anda-border)] bg-[var(--anda-surface)] px-4 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 text-[13px] text-[var(--anda-primary)] hover:underline"
            onClick={() => editor.select(scene.id, null)}
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{scene.title}</span>
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
        <h3 className="mt-1 truncate text-[15px] font-semibold">{t(`hotspot_${hotspot.type}`)}</h3>
        {content.unplaced === true && (
          <p className="mt-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-600">{t("unplaced_hint")}</p>
        )}
        {/* Tres pestañas: lo que se viene a tocar está siempre en la primera */}
        <div className="anda-pestanas mt-2">
          {(["content", "style", "conditions"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={activeTab === tab}
              onClick={() => setTab(tab)}
              className="flex-1 justify-center !px-2 !text-xs"
            >
              {t(tab === "content" ? "content" : tab === "style" ? "style" : "conditions")}
            </button>
          ))}
        </div>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      {activeTab === "content" && (
        <>
      <Field label={t("label")} htmlFor="hs-label">
        <Input id="hs-label" value={String(content.label ?? "")} disabled={!canEdit} onChange={(e) => setContent({ label: e.target.value })} />
      </Field>
      <Field label={t("label_visibility")} htmlFor="hs-labelvis">
        <Select id="hs-labelvis" value={String(content.labelVisibility ?? "hover")} disabled={!canEdit} onChange={(e) => setContent({ labelVisibility: e.target.value === "hover" ? undefined : e.target.value })}>
          <option value="hover">{t("label_vis_hover")}</option>
          <option value="always">{t("label_vis_always")}</option>
          <option value="never">{t("label_vis_never")}</option>
        </Select>
      </Field>
      <Field label={t("alt_text")} htmlFor="hs-alt">
        <Input id="hs-alt" value={String(content.altText ?? "")} disabled={!canEdit} onChange={(e) => setContent({ altText: e.target.value })} />
      </Field>

      {/* Posición: arrastrable en la vista previa y editable en grados */}
      <Section title={t("position")}>
        <p className="mb-1 text-xs text-[var(--anda-text-dim)]">{t("position_drag_hint")}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`${t("yaw")} (°)`} htmlFor="hs-yaw">
            <Input
              id="hs-yaw"
              type="number"
              step="0.5"
              value={toDeg(Number(readJson<Record<string, number>>(hotspot.positionJson, {}).yaw ?? 0))}
              disabled={!canEdit}
              onChange={(e) => {
                const deg = parseFloat(e.target.value);
                if (!Number.isFinite(deg)) return;
                patch((h) => {
                  const p = readJson<Record<string, unknown>>(h.positionJson, {});
                  h.positionJson = JSON.stringify({ ...p, yaw: deg * RAD });
                });
              }}
            />
          </Field>
          <Field label={`${t("pitch")} (°)`} htmlFor="hs-pitch">
            <Input
              id="hs-pitch"
              type="number"
              step="0.5"
              value={toDeg(Number(readJson<Record<string, number>>(hotspot.positionJson, {}).pitch ?? 0))}
              disabled={!canEdit}
              onChange={(e) => {
                const deg = parseFloat(e.target.value);
                if (!Number.isFinite(deg)) return;
                patch((h) => {
                  const p = readJson<Record<string, unknown>>(h.positionJson, {});
                  h.positionJson = JSON.stringify({ ...p, pitch: deg * RAD });
                });
              }}
            />
          </Field>
        </div>
      </Section>

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
            {/* La orientación de llegada se decide **en el destino**: aquí no
                se puede ver el panorama al que se llega, que era justo lo que
                hacía inservible el botón de «usar la vista actual». */}
            {typeof content.target === "string" && content.target !== "" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  editor.select(content.target as string);
                  requestAnimationFrame(() => document.getElementById("panel-llegadas")?.scrollIntoView({ block: "center" }));
                }}
              >
                <ArrowUpRight className="h-4 w-4" /> {t("edit_arrival_there")}
              </Button>
            )}
            <Field label={t("transition")} htmlFor="hs-trans">
              <Select
                id="hs-trans"
                value={String(content.transition?.kind ?? "")}
                disabled={!canEdit}
                onChange={(e) => setContent({ transition: e.target.value === "" ? undefined : { kind: e.target.value } })}
              >
                <option value="">{t("transition_default")}</option>
                <option value="fade">{t("transition_fade")}</option>
                <option value="cut">{t("transition_cut")}</option>
                <option value="crossRotate">{t("transition_crossrotate")}</option>
                <option value="zoom">{t("transition_zoom")}</option>
              </Select>
            </Field>
            <Switch
              id="hs-floorarrow"
              checked={content.variant === "floorArrow"}
              disabled={!canEdit}
              onCheckedChange={(v) => setContent({ variant: v ? "floorArrow" : undefined })}
              label={t("floor_arrow")}
            />
          </>
        )}
        {hotspot.type === "text" && (
          <>
            {text("body", t("body_text"), { textarea: true, hint: t("markdown_hint") })}
            {text("title", t("text_title"), { hint: t("text_title_hint") })}
            <Field label={t("font_size")} htmlFor="hs-fontsize">
              <Select id="hs-fontsize" value={String(content.fontSize ?? "normal")} disabled={!canEdit} onChange={(e) => setContent({ fontSize: e.target.value === "normal" ? undefined : e.target.value })}>
                <option value="small">{t("font_size_small")}</option>
                <option value="normal">{t("font_size_normal")}</option>
                <option value="large">{t("font_size_large")}</option>
                <option value="xlarge">{t("font_size_xlarge")}</option>
              </Select>
            </Field>
          </>
        )}
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
            <Field label={t("mode")} htmlFor="hs-vmode">
              <Select id="hs-vmode" value={String(content.mode ?? "lightbox")} disabled={!canEdit} onChange={(e) => setContent({ mode: e.target.value })}>
                <option value="lightbox">Lightbox</option>
                <option value="projected">{t("projected_screen")}</option>
              </Select>
            </Field>
            {content.mode === "projected" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canEdit}
                  onClick={() => setPlacementMode({ kind: "corners", hotspotId: hotspot.id, points: [] })}
                >
                  <Crosshair className="h-4 w-4" /> {t("define_corners")}
                </Button>
                <p className="text-xs text-[var(--anda-text-dim)]">
                  {Array.isArray(content.corners) && content.corners.length === 4 ? t("corners_defined") : t("corners_hint")}
                </p>
              </>
            )}
            <Switch id="hs-vauto" checked={content.autoplay !== false} disabled={!canEdit} onCheckedChange={(v) => setContent({ autoplay: v })} label={t("autoplay")} />
            <Switch id="hs-vloop" checked={content.loop !== false} disabled={!canEdit} onCheckedChange={(v) => setContent({ loop: v })} label={t("loop")} />
            <Switch id="hs-vmuted" checked={content.muted !== false} disabled={!canEdit} onCheckedChange={(v) => setContent({ muted: v })} label={t("muted")} />
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
            {content.provider === "peertube" ? (
              text("videoId", t("video_id"))
            ) : (
              <Field
                label={t("video_ref")}
                htmlFor="hs-videoId"
                hint={
                  String(content.videoId ?? "") !== "" && parseVideoRef(content.provider ?? "youtube", String(content.videoId)) == null
                    ? t("video_ref_invalid", { provider: content.provider === "vimeo" ? "Vimeo" : "YouTube" })
                    : t("video_ref_hint")
                }
              >
                <Input
                  id="hs-videoId"
                  value={String(content.videoId ?? "")}
                  placeholder="https://youtu.be/…"
                  disabled={!canEdit}
                  onChange={(e) => {
                    // Se acepta la dirección tal cual; si de ella sale el ID
                    // (y un segundo de inicio), se guarda ya convertido
                    const raw = e.target.value;
                    const ref = parseVideoRef(content.provider ?? "youtube", raw);
                    if (ref != null && ref.id !== raw.trim()) {
                      setContent({ videoId: ref.id, ...(ref.start != null && content.start == null ? { start: ref.start } : {}) });
                    } else {
                      setContent({ videoId: raw });
                    }
                  }}
                />
              </Field>
            )}
            {content.provider === "peertube" && text("host", t("instance_host"))}
            <Field label={t("start_at_s")} htmlFor="hs-start">
              <Input id="hs-start" type="number" min="0" value={String(content.start ?? 0)} disabled={!canEdit}
                onChange={(e) => setContent({ start: num(e.target.value, 0) || undefined })} />
            </Field>
            <Switch id="hs-eauto" checked={content.autoplay === true} disabled={!canEdit} onCheckedChange={(v) => setContent({ autoplay: v || undefined })} label={t("autoplay")} />
            <Switch id="hs-nocookie" checked={content.nocookie !== false} disabled={!canEdit} onCheckedChange={(v) => setContent({ nocookie: v })} label={t("no_cookies")} />
          </>
        )}
        {hotspot.type === "audio" && (
          <>
            {mediaButton("url", t("hotspot_audio"), "audio")}
            <Field label={t("mode")} htmlFor="hs-amode">
              <Select id="hs-amode" value={String(content.mode ?? "player")} disabled={!canEdit} onChange={(e) => setContent({ mode: e.target.value })}>
                <option value="player">{t("audio_player")}</option>
                <option value="spatial">{t("spatial_audio")}</option>
              </Select>
            </Field>
            <Field label={`${t("volume")} (%)`} htmlFor="hs-vol">
              <Input id="hs-vol" type="number" min="0" max="100" value={String(Math.round((Number(content.volume ?? 1)) * 100))} disabled={!canEdit}
                onChange={(e) => setContent({ volume: Math.min(100, Math.max(0, num(e.target.value, 100))) / 100 })} />
            </Field>
            {content.mode === "spatial" && (
              <Field label={`${t("audio_radius")} (°)`} htmlFor="hs-radius" hint={t("audio_radius_hint")}>
                <Input id="hs-radius" type="number" min="10" max="180" value={String(Math.round(((Number(content.radius ?? Math.PI / 2)) * 180) / Math.PI))} disabled={!canEdit}
                  onChange={(e) => setContent({ radius: (Math.min(180, Math.max(10, num(e.target.value, 90))) * Math.PI) / 180 })} />
              </Field>
            )}
            <Switch id="hs-aloop" checked={content.loop === true} disabled={!canEdit} onCheckedChange={(v) => setContent({ loop: v || undefined })} label={t("loop")} />
            {text("transcript", t("transcript"), { textarea: true })}
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
            <Field label={t("format")} htmlFor="hs-format">
              <Select id="hs-format" value={String(content.format ?? "glb")} disabled={!canEdit} onChange={(e) => setContent({ format: e.target.value })}>
                <option value="glb">GLB</option>
                <option value="gltf">glTF</option>
                <option value="obj">OBJ</option>
                <option value="stl">STL</option>
              </Select>
            </Field>
            {mediaButton("usdz", "USDZ (AR iOS)", "model")}
            {mediaButton("poster", t("poster_image"), "image")}
            <Switch id="hs-ar" checked={content.ar === true} disabled={!canEdit} onCheckedChange={(v) => setContent({ ar: v })} label={t("ar_mobile")} />
          </>
        )}
        {hotspot.type === "web" && (
          <>
            <Field label={t("web_mode")} htmlFor="hs-wmode">
              <Select
                id="hs-wmode"
                value={typeof content.html === "string" && content.html !== "" ? "html" : String(content.webMode ?? "url")}
                disabled={!canEdit}
                onChange={(e) => setContent({ webMode: e.target.value, ...(e.target.value === "url" ? { html: undefined } : {}) })}
              >
                <option value="url">{t("web_mode_url")}</option>
                <option value="html">{t("web_mode_html")}</option>
              </Select>
            </Field>
            {(typeof content.html === "string" && content.html !== "") || content.webMode === "html" ? (
              <Field label={t("web_html")} htmlFor="hs-html" hint={t("web_html_hint")}>
                <Textarea
                  id="hs-html"
                  rows={5}
                  className="font-mono text-xs"
                  placeholder={'<iframe src="https://sketchfab.com/models/…/embed" …></iframe>'}
                  value={String(content.html ?? "")}
                  disabled={!canEdit}
                  onChange={(e) => setContent({ html: e.target.value })}
                />
              </Field>
            ) : (
              text("url", "URL", { hint: t("web_url_hint"), placeholder: "https://" })
            )}
            <Field label={t("height_px")} htmlFor="hs-height">
              <Input id="hs-height" type="number" value={String(content.height ?? 480)} disabled={!canEdit} onChange={(e) => setContent({ height: num(e.target.value, 480) })} />
            </Field>
            <Switch
              id="hs-wsandbox"
              checked={content.sandbox !== "permissive"}
              disabled={!canEdit}
              onCheckedChange={(v) => setContent({ sandbox: v ? undefined : "permissive" })}
              label={t("strict_sandbox")}
            />
            <p className="text-xs text-[var(--anda-text-dim)]">{t("strict_sandbox_hint")}</p>
          </>
        )}
        {hotspot.type === "form" && (
          <>
            <p className="rounded-lg bg-[var(--anda-surface-2)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--anda-text-dim)]">{t("form_purpose")}</p>
            {text("title", t("title"))}
            {text("successMessage", t("success_message"))}
            {text("submitLabel", t("submit_label"))}
            <FormEditor fields={(content.fields as any[]) ?? []} destination={content.destination ?? { api: true }} turnstile={content.turnstile === true} canEdit={canEdit} onChange={setContent} />
          </>
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
                <p className="rounded-lg bg-[var(--anda-surface-2)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--anda-text-dim)]">{t("compare_scenes_hint")}</p>
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
            <div className="grid grid-cols-2 gap-2">
              <Field label={`${t("label")} (${t("before")})`} htmlFor="hs-cbl">
                <Input id="hs-cbl" value={String(content.before?.label ?? "")} disabled={!canEdit}
                  onChange={(e) => setContent({ before: { ...content.before, label: e.target.value || undefined } })} />
              </Field>
              <Field label={`${t("label")} (${t("after")})`} htmlFor="hs-cal">
                <Input id="hs-cal" value={String(content.after?.label ?? "")} disabled={!canEdit}
                  onChange={(e) => setContent({ after: { ...content.after, label: e.target.value || undefined } })} />
              </Field>
            </div>
          </>
        )}
        {hotspot.type === "quiz" && (
          <>
            <p className="rounded-lg bg-[var(--anda-surface-2)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--anda-text-dim)]">{t("quiz_one_per_hotspot")}</p>
            <QuizEditor content={content} canEdit={canEdit} onChange={setContent} />
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit}
              onClick={() => {
                // Otra pregunta = otro marcador, al lado de este y con la misma
                // compuerta; se selecciona para rellenarla de seguido
                const id = clientId();
                const pos = readJson<{ yaw?: number; pitch?: number }>(hotspot.positionJson, {});
                editor.apply((draft) => {
                  draft.hotspots.push({
                    id,
                    sceneId: scene.id,
                    type: "quiz",
                    positionJson: JSON.stringify({ yaw: (pos.yaw ?? 0) + 0.18, pitch: pos.pitch ?? 0 }),
                    styleJson: null,
                    contentJson: JSON.stringify({
                      question: "",
                      kind: "single",
                      options: [
                        { id: "a", text: "", correct: true },
                        { id: "b", text: "" },
                      ],
                      points: content.points ?? 1,
                      altText: "Pregunta",
                      ...(content.gate === true ? { gate: true } : {}),
                    }),
                    conditionsJson: null,
                    sort: draft.hotspots.filter((h) => h.sceneId === scene.id).length,
                  });
                });
                editor.select(scene.id, id);
              }}
            >
              <Plus className="h-4 w-4" /> {t("quiz_add_question")}
            </Button>
          </>
        )}
        {hotspot.type === "polygon" && (
          <>
            <p className="rounded-lg bg-[var(--anda-surface-2)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--anda-text-dim)]">{t("polygon_purpose")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("fill")} htmlFor="hs-fill">
                <Input id="hs-fill" type="color" value={String(content.fill ?? "#0ea5e9")} disabled={!canEdit} onChange={(e) => setContent({ fill: e.target.value })} />
              </Field>
              <Field label={t("stroke")} htmlFor="hs-stroke">
                <Input id="hs-stroke" type="color" value={String(content.stroke ?? "#0ea5e9")} disabled={!canEdit} onChange={(e) => setContent({ stroke: e.target.value })} />
              </Field>
              <Field label={t("fill_opacity")} htmlFor="hs-fillop">
                <Input id="hs-fillop" type="number" min="0" max="100" value={String(Math.round(Number(content.fillOpacity ?? 0.25) * 100))} disabled={!canEdit}
                  onChange={(e) => setContent({ fillOpacity: Math.min(100, Math.max(0, num(e.target.value, 25))) / 100 })} />
              </Field>
              <Field label={t("hover_fill")} htmlFor="hs-hoverfill">
                <Input id="hs-hoverfill" type="color" value={String(content.hoverFill ?? content.fill ?? "#0ea5e9")} disabled={!canEdit} onChange={(e) => setContent({ hoverFill: e.target.value })} />
              </Field>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit}
              onClick={() => setPlacementMode({ kind: "polygon", points: [], replaceId: hotspot.id })}
            >
              <Crosshair className="h-4 w-4" /> {t("redraw_polygon")}
            </Button>
            <Field label={t("action")} htmlFor="hs-paction">
              <Select
                id="hs-paction"
                value={String(content.action?.kind ?? "none")}
                disabled={!canEdit}
                onChange={(e) => {
                  const kind = e.target.value;
                  setContent({
                    action:
                      kind === "none"
                        ? undefined
                        : kind === "goto"
                          ? { kind, target: snapshot.scenes[0]?.id ?? "" }
                          : kind === "openHotspot"
                            ? { kind, hotspotId: snapshot.hotspots.find((h) => h.sceneId === scene.id && h.id !== hotspot.id && h.type !== "polygon")?.id ?? "" }
                            : { kind, url: "https://" },
                  });
                }}
              >
                <option value="none">-</option>
                <option value="goto">{t("hotspot_navigation")}</option>
                <option value="openUrl">{t("hotspot_link")}</option>
                <option value="openHotspot">{t("polygon_action_open_hotspot")}</option>
              </Select>
            </Field>
            {content.action?.kind === "openHotspot" && (
              <Field label={t("polygon_target_hotspot")} htmlFor="hs-phs">
                <Select id="hs-phs" value={String(content.action.hotspotId ?? "")} disabled={!canEdit} onChange={(e) => setContent({ action: { kind: "openHotspot", hotspotId: e.target.value } })}>
                  <option value="">-</option>
                  {snapshot.hotspots
                    .filter((h) => h.sceneId === scene.id && h.id !== hotspot.id && h.type !== "polygon")
                    .map((h) => {
                      const c = readJson<Record<string, unknown>>(h.contentJson, {});
                      return (
                        <option key={h.id} value={h.id}>
                          {String(c.label ?? c.altText ?? "") || t(`hotspot_${h.type}`)} · {t(`hotspot_${h.type}`)}
                        </option>
                      );
                    })}
                </Select>
              </Field>
            )}
            {content.action?.kind === "goto" && (
              <Field label={t("target_scene")} htmlFor="hs-ptarget">
                <Select id="hs-ptarget" value={String(content.action.target ?? "")} disabled={!canEdit} onChange={(e) => setContent({ action: { kind: "goto", target: e.target.value } })}>
                  {sceneOptions}
                </Select>
              </Field>
            )}
            {content.action?.kind === "openUrl" && (
              <Field label="URL" htmlFor="hs-purl">
                <Input
                  id="hs-purl"
                  value={String(content.action?.url ?? "")}
                  disabled={!canEdit}
                  onChange={(e) => setContent({ action: { kind: "openUrl", url: e.target.value } })}
                />
              </Field>
            )}
          </>
        )}
        {hotspot.type === "tooltip" && (
          <>
            {text("text", t("tooltip_text"), { hint: t("tooltip_text_hint") })}
            <Switch id="hs-perm" checked={content.permanent === true} disabled={!canEdit} onCheckedChange={(v) => setContent({ permanent: v })} label={t("permanent")} />
          </>
        )}
        {hotspot.type === "link" && (
          <>
            {text("url", "URL")}
            <Field label={t("type")} htmlFor="hs-scheme">
              <Select id="hs-scheme" value={String(content.scheme ?? "url")} disabled={!canEdit} onChange={(e) => setContent({ scheme: e.target.value })}>
                <option value="url">URL</option>
                <option value="tel">{t("phone")}</option>
                <option value="mailto">Email</option>
              </Select>
            </Field>
            <Switch id="hs-newtab" checked={content.newTab !== false} disabled={!canEdit} onCheckedChange={(v) => setContent({ newTab: v })} label={t("open_new_tab")} />
          </>
        )}
        {hotspot.type === "state" && (
          <StateEditor content={content} scenes={snapshot.scenes} canEdit={canEdit} onChange={setContent} />
        )}
        {hotspot.type === "treasure" && (
          <>
            {/* Colocar este marcador ya pone en marcha la búsqueda: no hay
                nada que activar en otra pantalla. */}
            <p className="rounded-lg bg-[var(--anda-primary-soft)] px-3 py-2 text-[12.5px] text-[var(--anda-text)]">
              {t("treasure_count_hint", { n: String(snapshot.hotspots.filter((h) => h.type === "treasure").length) })}
            </p>
            <Field label={t("treasure_reward")} htmlFor="hs-reward" hint={t("treasure_reward_hint")}>
              <MarkdownField id="hs-reward" rows={3} value={String(content.reward ?? "")} disabled={!canEdit}
                onChange={(v) => setContent({ reward: v || undefined })} />
            </Field>
            <Field label={t("treasure_hint_label")} htmlFor="hs-thint" hint={t("treasure_hint_hint")}>
              <Input id="hs-thint" value={String(content.hint ?? "")} disabled={!canEdit}
                onChange={(e) => setContent({ hint: e.target.value || undefined })} />
            </Field>
            <p className="text-xs leading-relaxed text-[var(--anda-text-dim)]">{t("treasure_marker_hint")}</p>
          </>
        )}
      </Section>
        </>
      )}

      {activeTab === "style" && (
      <Section title={t("style")}>
        <Field label={t("icon")}>
          {/* El icono propio manda: si hay imagen elegida se enseña con su
              miniatura; quitarla devuelve el catálogo */}
          {style.icon?.url != null ? (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface-2)] p-2">
              <img
                src={mediaRefUrl(String(style.icon.url))}
                alt=""
                className="h-10 w-10 rounded-lg border border-[var(--anda-border)] bg-white object-contain"
              />
              <span className="flex-1 text-[12.5px] text-[var(--anda-text-dim)]">{t("icon_custom_active")}</span>
              <Button size="sm" variant="ghost" disabled={!canEdit}
                onClick={() => setStyle({ icon: { ...(style.icon ?? {}), url: undefined } })}>
                {t("delete")}
              </Button>
            </div>
          ) : (
            <>
              <Input
                aria-label={t("icon_search")}
                placeholder={t("icon_search")}
                className="mb-2"
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
              />
              <div className="grid max-h-56 grid-cols-7 gap-1 overflow-y-auto pr-1">
                <button
                  type="button"
                  title={t("icon_default")}
                  aria-label={t("icon_default")}
                  disabled={!canEdit}
                  onClick={() => setStyle({ icon: { ...(style.icon ?? {}), name: undefined } })}
                  className={`flex h-8 items-center justify-center rounded-lg border text-[10px] font-semibold ${
                    style.icon?.name == null
                      ? "border-[var(--anda-primary)] bg-[var(--anda-primary-soft)] text-[var(--anda-primary)]"
                      : "border-[var(--anda-border)] text-[var(--anda-text-dim)] hover:bg-[var(--anda-surface-2)]"
                  }`}
                >
                  Auto
                </button>
                {iconosFiltrados.map(({ name, Icon }) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={name}
                    disabled={!canEdit}
                    onClick={() => setStyle({ icon: { ...(style.icon ?? {}), name } })}
                    className={`flex h-8 items-center justify-center rounded-lg border ${
                      style.icon?.name === name
                        ? "border-[var(--anda-primary)] bg-[var(--anda-primary-soft)] text-[var(--anda-primary)]"
                        : "border-[var(--anda-border)] text-[var(--anda-text-dim)] hover:bg-[var(--anda-surface-2)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              {/* Un icono propio: una imagen de la biblioteca, que es de la
                  organización y por tanto sirve para todos los tours */}
              <Button size="sm" variant="outline" className="mt-2" disabled={!canEdit} onClick={() => setPickerField("icono:image")}>
                <ImagePlus className="h-4 w-4" /> {t("icon_from_library")}
              </Button>
            </>
          )}
        </Field>
        {/* Tamaño del botón: deslizador con muestra a escala real, porque el
            número solo no dice nada hasta que se ve sobre el panorama. */}
        <Field label={t("icon_size")} htmlFor="hs-size" hint={t("icon_size_hint")}>
          <div className="flex items-center gap-3">
            <input
              id="hs-size"
              type="range"
              min={24}
              max={96}
              step={2}
              value={hotspotSize}
              disabled={!canEdit}
              className="h-1.5 flex-1 accent-[var(--anda-primary)]"
              onChange={(e) => setStyle({ icon: { ...(style.icon ?? {}), size: num(e.target.value, 44) } })}
            />
            <Input
              type="number"
              min="24"
              max="96"
              className="max-w-20"
              aria-label={t("icon_size")}
              value={String(hotspotSize)}
              disabled={!canEdit}
              onChange={(e) => setStyle({ icon: { ...(style.icon ?? {}), size: num(e.target.value, 44) } })}
            />
            <span
              aria-hidden
              className="shrink-0 rounded-full border border-[var(--anda-border)] bg-[var(--anda-primary)]"
              style={{ width: hotspotSize / 2, height: hotspotSize / 2 }}
            />
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {([["S", 32], ["M", 44], ["L", 64], ["XL", 84]] as const).map(([label, value]) => (
              <Button
                key={label}
                size="sm"
                variant={hotspotSize === value ? "secondary" : "ghost"}
                disabled={!canEdit}
                onClick={() => setStyle({ icon: { ...(style.icon ?? {}), size: value } })}
              >
                {label}
              </Button>
            ))}
            {style.icon?.size != null && (
              <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => setStyle({ icon: { ...(style.icon ?? {}), size: undefined } })}>
                {t("inherit")}
              </Button>
            )}
          </div>
        </Field>
        <Field label={t("icon_color")} htmlFor="hs-color">
          <Input id="hs-color" type="color" value={String(style.icon?.color ?? "#ffffff")} disabled={!canEdit}
            onChange={(e) => setStyle({ icon: { ...(style.icon ?? {}), color: e.target.value } })} />
        </Field>
        {/* Giro del dibujo: una flecha tiene que poder apuntar al pasillo, no
            solo al norte. La muestra gira a la vez para verlo sin salir. */}
        <Field label={t("icon_rotation")} htmlFor="hs-rot" hint={t("icon_rotation_hint")}>
          <div className="flex items-center gap-3">
            <input
              id="hs-rot"
              type="range"
              min={0}
              max={359}
              step={1}
              value={hotspotRotation}
              disabled={!canEdit}
              className="h-1.5 flex-1 accent-[var(--anda-primary)]"
              onChange={(e) => setStyle({ icon: { ...(style.icon ?? {}), rotation: num(e.target.value, 0) } })}
            />
            <Input
              type="number"
              min="0"
              max="359"
              className="max-w-20"
              aria-label={t("icon_rotation")}
              value={String(hotspotRotation)}
              disabled={!canEdit}
              onChange={(e) => setStyle({ icon: { ...(style.icon ?? {}), rotation: num(e.target.value, 0) } })}
            />
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--anda-border)] bg-[var(--anda-surface-2)] text-[var(--anda-primary)]"
            >
              <ArrowUp className="h-4 w-4 transition-transform" style={{ transform: `rotate(${hotspotRotation}deg)` }} />
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((grados) => (
              <Button
                key={grados}
                size="sm"
                variant={hotspotRotation === grados ? "secondary" : "ghost"}
                disabled={!canEdit}
                onClick={() => setStyle({ icon: { ...(style.icon ?? {}), rotation: grados === 0 ? undefined : grados } })}
              >
                {grados}°
              </Button>
            ))}
          </div>
        </Field>
        <Switch id="hs-chip" checked={style.icon?.chip !== false} disabled={!canEdit}
          onCheckedChange={(v) => setStyle({ icon: { ...(style.icon ?? {}), chip: v } })} label={t("icon_chip")} />
        <Switch id="hs-pulse" checked={style.pulse === true} disabled={!canEdit} onCheckedChange={(v) => setStyle({ pulse: v })} label={t("pulse")} />
        <Switch id="hs-dscale" checked={style.distanceScale !== false} disabled={!canEdit} onCheckedChange={(v) => setStyle({ distanceScale: v })} label={t("distance_scale")} />
      </Section>
      )}

      {activeTab === "conditions" && (
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
      )}
      </div>

      {/* Editor ampliado para textos largos (Markdown) */}
      <Dialog
        open={expand != null}
        onOpenChange={(o) => {
          if (!o) setExpand(null);
        }}
        title={expand?.label ?? ""}
        wide
        footer={
          <Button onClick={() => setExpand(null)}>{t("close")}</Button>
        }
      >
        {expand != null && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <MarkdownField
                id="hs-expanded"
                rows={18}
                autoFocus
                mono
                value={String(content[expand.key] ?? "")}
                disabled={!canEdit}
                onChange={(v) => setContent({ [expand.key]: v })}
              />
              <div className="min-h-0">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">{t("markdown_preview")}</p>
                <div
                  className="anda-md-preview max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface-2)] p-4 text-[14px]"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(String(content[expand.key] ?? "")) }}
                />
              </div>
            </div>
            <p className="text-xs text-[var(--anda-text-dim)]">{t("markdown_hint")}</p>
          </div>
        )}
      </Dialog>

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
          } else if (field === "icono") {
            setStyle({ icon: { ...(style.icon ?? {}), url: `media:${item.id}`, name: undefined } });
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

/**
 * Área de texto con barra de formato Markdown.
 *
 * «¿Cómo pongo negritas?» era la pregunta: las marcas (**así**) están en la
 * pista, pero nadie las lee. Los botones envuelven la selección con la marca
 * que toque, y quien prefiera escribirlas a mano puede seguir haciéndolo.
 */
function MarkdownField({ id, value, onChange, rows, disabled, placeholder, autoFocus, mono, onExpand }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  mono?: boolean;
  onExpand?: () => void;
}): React.ReactNode {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);

  /** Envuelve la selección (o inserta un ejemplo) y devuelve el foco donde estaba. */
  const wrap = (before: string, after: string, ejemplo: string, linea = false): void => {
    const el = ref.current;
    if (el == null || disabled) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const seleccion = value.slice(start, end);
    let inicio = start;
    let cuerpo = seleccion !== "" ? seleccion : ejemplo;
    let prefijo = before;
    if (linea) {
      // Las marcas de línea (título, lista) van al principio de la línea
      inicio = value.lastIndexOf("\n", start - 1) + 1;
      cuerpo = value.slice(inicio, end) || ejemplo;
      prefijo = cuerpo.split("\n").map((l) => before + l).join("\n");
      const next = value.slice(0, inicio) + prefijo + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(inicio, inicio + prefijo.length);
      });
      return;
    }
    const next = value.slice(0, start) + prefijo + cuerpo + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefijo.length, start + prefijo.length + cuerpo.length);
    });
  };

  const boton = (icon: React.ReactNode, label: string, onClick: () => void): React.ReactNode => (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className="rounded-md p-1 text-[var(--anda-text-dim)] hover:bg-[var(--anda-surface-2)] hover:text-[var(--anda-text)] disabled:opacity-40"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5" role="toolbar" aria-label={t("markdown_toolbar")}>
        {boton(<Bold className="h-3.5 w-3.5" />, t("markdown_bold"), () => wrap("**", "**", t("markdown_bold").toLowerCase()))}
        {boton(<Italic className="h-3.5 w-3.5" />, t("markdown_italic"), () => wrap("*", "*", t("markdown_italic").toLowerCase()))}
        {boton(<Heading2 className="h-3.5 w-3.5" />, t("markdown_heading"), () => wrap("## ", "", t("markdown_heading"), true))}
        {boton(<List className="h-3.5 w-3.5" />, t("markdown_list"), () => wrap("- ", "", t("markdown_list"), true))}
        {boton(<LinkIcon className="h-3.5 w-3.5" />, t("markdown_link"), () => wrap("[", "](https://)", t("markdown_link").toLowerCase()))}
        <span className="flex-1" />
        {onExpand != null && boton(<Maximize2 className="h-3.5 w-3.5" />, t("expand_editor"), onExpand)}
      </div>
      <Textarea
        ref={ref}
        id={id}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={mono ? "font-mono text-[13px] leading-relaxed" : undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): React.ReactNode {
  return (
    <details open className="group rounded-xl border border-[var(--anda-border)] bg-[var(--anda-bg)] shadow-sm">
      <summary className="flex cursor-pointer select-none items-center justify-between rounded-xl px-3.5 py-2.5 text-[12.5px] font-bold uppercase tracking-wide text-[var(--anda-text-dim)] transition-colors hover:text-[var(--anda-text)]">
        {title}
        <span className="text-[10px] transition-transform group-open:rotate-180" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </summary>
      <div className="space-y-3 px-3.5 pb-4 pt-1">
        {hint != null && <p className="text-xs text-[var(--anda-text-dim)]">{hint}</p>}
        {children}
      </div>
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
        <div key={i} className="rounded-lg border border-[var(--anda-border)] p-2 text-xs">
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
        <div key={i} className="rounded-lg border border-[var(--anda-border)] p-2">
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
      <Field label={t("notify_email")} htmlFor="form-em">
        <Input id="form-em" type="email" value={destination.email ?? ""} disabled={!canEdit}
          onChange={(e) => onChange({ destination: { ...destination, email: e.target.value || undefined } })} />
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
          <Input id="qz-pts" type="number" min="0" value={String(content.points ?? 1)} disabled={!canEdit} onChange={(e) => onChange({ points: num(e.target.value, 1) })} />
        </Field>
        <Field label={t("attempts")} htmlFor="qz-att">
          <Input id="qz-att" type="number" min="0" value={String(content.attempts ?? 0)} disabled={!canEdit} onChange={(e) => onChange({ attempts: num(e.target.value, 0) })} />
        </Field>
      </div>
      <Field label="Feedback correcto" htmlFor="qz-fc">
        <Input id="qz-fc" value={String(content.feedbackCorrect ?? "")} disabled={!canEdit} onChange={(e) => onChange({ feedbackCorrect: e.target.value })} />
      </Field>
      <Field label="Feedback incorrecto" htmlFor="qz-fw">
        <Input id="qz-fw" value={String(content.feedbackWrong ?? "")} disabled={!canEdit} onChange={(e) => onChange({ feedbackWrong: e.target.value })} />
      </Field>
      <Switch id="qz-gate" checked={content.gate === true} disabled={!canEdit} onCheckedChange={(v) => onChange({ gate: v })} label={t("gate")} />
      <p className="text-xs leading-relaxed text-[var(--anda-text-dim)]">{t("gate_hint")}</p>
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
          <Select value={a.op} disabled={!canEdit} aria-label={t("operation")} className="max-w-24"
            onChange={(e) => onChange({ actions: actions.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })}>
            {["set", "inc", "dec", "toggle"].map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </Select>
          {a.op === "set" && (
            <Input
              value={String(a.value ?? "")}
              placeholder={t("value")}
              disabled={!canEdit}
              aria-label={t("value")}
              className="max-w-24"
              onChange={(e) => {
                // Números y booleanos se guardan tipados; el resto, como texto.
                const raw = e.target.value;
                const value = raw === "true" ? true : raw === "false" ? false : raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
                onChange({ actions: actions.map((x, j) => (j === i ? { ...x, value } : x)) });
              }}
            />
          )}
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
