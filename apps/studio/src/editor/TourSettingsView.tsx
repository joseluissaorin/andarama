import { useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { Button, Field, Input, Select, Switch, Textarea, useToast } from "@andarama/ui";
import { CssGuideDialog, cssPrompt } from "./CssGuide";
import { MediaPicker } from "./MediaPicker";
import { FAMILY_ORDER, HOTSPOT_CATALOG } from "./hotspotCatalog";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useEditor } from "../stores";
import type { BrandKit } from "../pages/OrgDefaultsPage";
import { useT } from "../i18n";
import type { ProjectInfo } from "./EditorPage";

/** Ajustes del tour: UI, tema, autorotate, pantallas, quiz, tesoro, autopilot, variables. */
export function TourSettingsView({ project: _project, canEdit }: { project: ProjectInfo; canEdit: boolean }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const settings = snapshot.settings;
  const ui = (settings.ui as Record<string, any>) ?? {};
  const theme = (ui.theme as Record<string, any>) ?? {};
  const autorotate = (settings.autorotate as Record<string, any>) ?? {};
  const quiz = (settings.quiz as Record<string, any>) ?? {};
  const welcome = (ui.welcome as Record<string, any>) ?? {};
  const final = (ui.final as Record<string, any>) ?? {};
  const geoMap = (settings.geoMap as Record<string, any>) ?? {};
  const hunt = (settings.treasureHunt as Record<string, any>) ?? {};
  const vr = (settings.vr as Record<string, any>) ?? {};
  const social = (settings.social as Record<string, any>) ?? {};

  const [cssHelp, setCssHelp] = useState(false);
  const [socialPicker, setSocialPicker] = useState(false);
  const kits = useQuery({
    queryKey: ["org-defaults-kits", _project.orgId],
    queryFn: () => api<{ brandKits?: BrandKit[] }>(`/orgs/${_project.orgId}/defaults`),
  }).data?.brandKits;

  const patch = (fn: (s: Record<string, any>) => void): void => {
    if (!canEdit) return;
    editor.apply((draft) => fn(draft.settings));
  };
  const patchSocial = (patchObj: Record<string, unknown>): void =>
    patch((s) => {
      const next = { ...(s.social as object), ...patchObj };
      for (const [k, v] of Object.entries(next)) if (v === undefined) delete (next as Record<string, unknown>)[k];
      s.social = next;
    });
  const patchVr = (patchObj: Record<string, unknown>): void =>
    patch((s) => {
      s.vr = { ...(s.vr as object), ...patchObj };
    });
  const patchUi = (patchObj: Record<string, unknown>): void =>
    patch((s) => {
      s.ui = { ...(s.ui as object), ...patchObj };
    });
  const patchTheme = (patchObj: Record<string, unknown>): void =>
    patch((s) => {
      const u = (s.ui as Record<string, any>) ?? {};
      s.ui = { ...u, theme: { ...(u.theme as object), ...patchObj } };
    });

  const UI_TOGGLES = [
    "titleBar", "sceneMenu", "thumbnails", "compass", "loadingIndicator", "zoomControls",
    "gyroToggle", "vr", "fullscreen", "share", "mute", "help", "langSelector", "accessibleMode",
  ] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <section className="anda-bloque p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("tour_settings")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("default_lang")} htmlFor="ts-lang">
            <Input id="ts-lang" value={String(settings.defaultLang ?? "es")} disabled={!canEdit}
              onChange={(e) => patch((s) => {
                s.defaultLang = e.target.value;
                const langs = (s.langs as string[]) ?? [];
                if (!langs.includes(e.target.value)) s.langs = [e.target.value, ...langs];
              })} />
          </Field>
          <Field label={t("start_scene")} htmlFor="ts-start">
            <Select id="ts-start" value={String(settings.startScene ?? "")} disabled={!canEdit} onChange={(e) => patch((s) => { s.startScene = e.target.value; })}>
              {snapshot.scenes.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("intro_effect")} htmlFor="ts-intro">
            <Select id="ts-intro" value={String(settings.intro ?? "none")} disabled={!canEdit} onChange={(e) => patch((s) => { s.intro = e.target.value; })}>
              <option value="none">{t("intro_none")}</option>
              <option value="littlePlanet">{t("intro_littleplanet")}</option>
              <option value="fade">{t("intro_fade")}</option>
            </Select>
          </Field>
          <Field label={t("transition")} htmlFor="ts-trans">
            <Select id="ts-trans" value={String((settings.transition as { kind?: string })?.kind ?? "fade")} disabled={!canEdit}
              onChange={(e) => patch((s) => { s.transition = { ...(s.transition as object), kind: e.target.value, duration: 800 }; })}>
              <option value="fade">Fundido</option>
              <option value="zoom">Zoom</option>
              <option value="crossRotate">Fundido con rotacion</option>
              <option value="cut">Corte</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t("description")} htmlFor="ts-desc">
            <Textarea id="ts-desc" rows={2} value={String(settings.description ?? "")} disabled={!canEdit} onChange={(e) => patch((s) => { s.description = e.target.value; })} />
          </Field>
        </div>
      </section>

      <section className="anda-bloque p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("ui_components")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {UI_TOGGLES.map((key) => (
            <div key={key}>
              <Switch
                id={`ui-${key}`}
                checked={ui[key] !== false}
                disabled={!canEdit}
                onCheckedChange={(v) => patchUi({ [key]: v })}
                label={t(`ui_${key}` as never)}
              />
              <p className="ml-11 mt-0.5 text-xs leading-snug text-[var(--anda-text-dim)]">{t(`ui_${key}_desc` as never)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Field label={t("hotspot_size_default")} htmlFor="ui-hssize" hint={t("hotspot_size_default_hint")}>
            <div className="flex items-center gap-3">
              <input
                id="ui-hssize"
                type="range"
                min={24}
                max={96}
                step={2}
                value={Number(ui.hotspotSize ?? 44)}
                disabled={!canEdit}
                className="h-1.5 max-w-64 flex-1 accent-[var(--anda-primary)]"
                onChange={(e) => patchUi({ hotspotSize: Number(e.target.value) })}
              />
              <span className="w-10 text-right text-sm tabular-nums">{Number(ui.hotspotSize ?? 44)}</span>
              <span
                aria-hidden
                className="shrink-0 rounded-full bg-[var(--anda-primary)]"
                style={{ width: Number(ui.hotspotSize ?? 44) / 2, height: Number(ui.hotspotSize ?? 44) / 2 }}
              />
            </div>
          </Field>
        </div>
        {/* La marca: colores, tipografía y logotipo de una vez. La de serie
            es la de Andarama; las demás se definen en Ajustes de la
            organización y valen para todos los tours. */}
        <div className="mt-4">
          <Field label={t("brand_kit")} htmlFor="th-brand" hint={t("brand_apply_hint")}>
            <div className="flex items-center gap-2">
              <Select id="th-brand" value="" disabled={!canEdit} className="max-w-xs"
                onChange={(e) => {
                  if (e.target.value === "") return;
                  const kit: BrandKit =
                    e.target.value === "__anda"
                      ? { id: "__anda", name: "Andarama", base: "anda", primaryColor: "#f59e00", fontFamily: "Baloo 2" }
                      : (kits ?? []).find((k) => k.id === e.target.value)!;
                  if (kit == null) return;
                  patch((s2) => {
                    const u = (s2.ui as Record<string, any>) ?? {};
                    s2.ui = {
                      ...u,
                      theme: { ...(u.theme as object), base: kit.base, primaryColor: kit.primaryColor, fontFamily: kit.fontFamily },
                      watermark: kit.watermark?.image != null ? { image: kit.watermark.image, link: kit.watermark.link } : undefined,
                    };
                  });
                  toast.push(t("brand_applied", { name: kit.name }), "ok");
                  e.target.value = "";
                }}>
                <option value="">{t("brand_kit")}…</option>
                <option value="__anda">{t("brand_default_name")}</option>
                {(kits ?? []).map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </Select>
            </div>
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("theme")} htmlFor="th-base">
            <Select id="th-base" value={theme.base === "ull" ? "anda" : String(theme.base ?? "anda")} disabled={!canEdit} onChange={(e) => patchTheme({ base: e.target.value })}>
              <option value="anda">Andarama</option>
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
              <option value="auto">Auto</option>
            </Select>
          </Field>
          <Field label={t("primary_color")} htmlFor="th-color">
            {/* Un input de color estirado se ve como una raya y no se sabe qué
                color es: muestra cuadrada, valor legible y atajos de marca. */}
            <div className="flex items-center gap-2">
              <input
                id="th-color"
                type="color"
                aria-label={t("primary_color")}
                value={String(theme.primaryColor ?? "#f59e00")}
                disabled={!canEdit}
                onChange={(e) => patchTheme({ primaryColor: e.target.value })}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[var(--anda-border)] bg-transparent p-0.5"
              />
              <Input
                aria-label={`${t("primary_color")} (hex)`}
                className="max-w-28 font-mono text-xs uppercase"
                value={String(theme.primaryColor ?? "#f59e00")}
                disabled={!canEdit}
                onChange={(e) => patchTheme({ primaryColor: e.target.value })}
              />
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {(["#f59e00", "#ffd900", "#0b1020", "#00847f"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  title={c}
                  disabled={!canEdit}
                  onClick={() => patchTheme({ primaryColor: c })}
                  className={`h-6 w-6 rounded-full border-2 ${
                    String(theme.primaryColor ?? "#f59e00").toLowerCase() === c ? "border-[var(--anda-text)]" : "border-transparent"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
          <Field label="Radio de esquinas" htmlFor="th-radius">
            <Input id="th-radius" value={String(theme.borderRadius ?? "12px")} disabled={!canEdit} onChange={(e) => patchTheme({ borderRadius: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t("custom_css")} htmlFor="th-css" hint={t("custom_css_hint")}>
            <Textarea id="th-css" rows={4} className="font-mono text-xs" value={String(theme.customCss ?? "")} disabled={!canEdit} onChange={(e) => patchTheme({ customCss: e.target.value })} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setCssHelp(true)}>
              <BookOpen className="h-4 w-4" /> {t("css_guide")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(cssPrompt(String(theme.base ?? "anda"), String(theme.primaryColor ?? "#f59e00")));
                toast.push(t("prompt_copied"), "ok");
              }}
            >
              <Sparkles className="h-4 w-4" /> {t("copy_ai_prompt")}
            </Button>
          </div>
        </div>
      </section>

      <CssGuideDialog open={cssHelp} onClose={() => setCssHelp(false)} />

      {/* Cómo se ve el enlace del tour al pegarlo en un chat o una red */}
      <section className="anda-bloque p-5">
        <h2 className="mb-1 text-[15px] font-semibold">{t("social_settings")}</h2>
        <p className="mb-4 text-xs text-[var(--anda-text-dim)]">{t("social_intro")}</p>

        {/* Vista previa de la tarjeta, que es lo que de verdad se juzga */}
        <div className="mb-4 max-w-md overflow-hidden rounded-xl border border-[var(--anda-border)]">
          <div className="flex aspect-[1200/630] items-center justify-center bg-[var(--anda-surface-2)]">
            {social.image != null && social.image !== "" ? (
              <img src={String(social.image)} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-[var(--anda-text-dim)]">{t("social_no_image")}</span>
            )}
          </div>
          <div className="space-y-0.5 bg-[var(--anda-surface)] p-3">
            <p className="text-[11px] uppercase tracking-wide text-[var(--anda-text-dim)]">
              {String(social.siteName ?? "") || new URL(location.origin).host}
            </p>
            <p className="truncate text-[13px] font-semibold">
              {String(social.title ?? "") || String(settings.title ?? t("tour"))}
            </p>
            <p className="line-clamp-2 text-xs text-[var(--anda-text-dim)]">
              {String(social.description ?? "") || String(settings.description ?? "")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("social_title")} htmlFor="so-title" hint={t("social_title_hint")}>
            <Input id="so-title" value={String(social.title ?? "")} disabled={!canEdit} onChange={(e) => patchSocial({ title: e.target.value || undefined })} />
          </Field>
          <Field label={t("social_site")} htmlFor="so-site">
            <Input id="so-site" value={String(social.siteName ?? "")} placeholder="Museo de la Ciudad" disabled={!canEdit} onChange={(e) => patchSocial({ siteName: e.target.value || undefined })} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t("social_description")} htmlFor="so-desc" hint={t("social_description_hint")}>
            <Textarea id="so-desc" rows={2} value={String(social.description ?? "")} disabled={!canEdit} onChange={(e) => patchSocial({ description: e.target.value || undefined })} />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("social_image")} hint={t("social_image_hint")}>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setSocialPicker(true)}>
                {social.image != null && social.image !== "" ? t("change") : t("select_media")}
              </Button>
              {social.image != null && social.image !== "" && (
                <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => patchSocial({ image: undefined })}>
                  {t("delete")}
                </Button>
              )}
            </div>
          </Field>
          <Field label={t("social_image_alt")} htmlFor="so-alt">
            <Input id="so-alt" value={String(social.imageAlt ?? "")} disabled={!canEdit} onChange={(e) => patchSocial({ imageAlt: e.target.value || undefined })} />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("social_card")} htmlFor="so-card">
            <Select id="so-card" value={String(social.twitterCard ?? "summary_large_image")} disabled={!canEdit} onChange={(e) => patchSocial({ twitterCard: e.target.value })}>
              <option value="summary_large_image">{t("social_card_large")}</option>
              <option value="summary">{t("social_card_small")}</option>
            </Select>
          </Field>
          <Field label={t("social_twitter_site")} htmlFor="so-tsite" hint="@ull">
            <Input id="so-tsite" value={String(social.twitterSite ?? "")} disabled={!canEdit} onChange={(e) => patchSocial({ twitterSite: e.target.value || undefined })} />
          </Field>
          <Field label={t("social_locale")} htmlFor="so-locale" hint="es_ES">
            <Input id="so-locale" value={String(social.locale ?? "")} disabled={!canEdit} onChange={(e) => patchSocial({ locale: e.target.value || undefined })} />
          </Field>
        </div>
        <div className="mt-4">
          <Switch id="so-noindex" checked={social.noindex === true} disabled={!canEdit} onCheckedChange={(v) => patchSocial({ noindex: v || undefined })} label={t("social_noindex")} />
          <p className="ml-11 mt-0.5 text-xs text-[var(--anda-text-dim)]">{t("social_noindex_desc")}</p>
        </div>

        <MediaPicker
          open={socialPicker}
          onClose={() => setSocialPicker(false)}
          kind="image"
          onSelect={(item) => {
            patchSocial({ image: `media:${item.id}` });
            setSocialPicker(false);
          }}
        />
      </section>

      {/* Gafas y cardboard: qué se puede accionar sin ratón ni teclado */}
      <section className="anda-bloque p-5">
        <h2 className="mb-1 text-[15px] font-semibold">{t("vr_settings")}</h2>
        <p className="mb-4 text-xs text-[var(--anda-text-dim)]">{t("vr_settings_intro")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("vr_hotspots_mode")} htmlFor="vr-mode">
            <Select
              id="vr-mode"
              value={String(vr.hotspots ?? "all")}
              disabled={!canEdit}
              onChange={(e) => patchVr({ hotspots: e.target.value })}
            >
              <option value="all">{t("vr_hotspots_all")}</option>
              <option value="navigationOnly">{t("vr_hotspots_nav")}</option>
              <option value="custom">{t("vr_hotspots_custom")}</option>
            </Select>
          </Field>
          <Field label={t("vr_dwell")} htmlFor="vr-dwell" hint={t("vr_dwell_hint")}>
            <Input
              id="vr-dwell"
              type="number"
              step="0.5"
              min="0.8"
              max="8"
              value={String(vr.dwellSeconds ?? 2.5)}
              disabled={!canEdit}
              onChange={(e) => patchVr({ dwellSeconds: Number(e.target.value) })}
            />
          </Field>
        </div>

        {vr.hotspots === "custom" && (
          <div className="mt-4 space-y-3">
            {FAMILY_ORDER.map((family) => {
              const kinds = HOTSPOT_CATALOG.filter((k) => k.family === family && k.type !== "navigation");
              if (kinds.length === 0) return null;
              const allOn = kinds.every((k) => (vr.types as Record<string, boolean> | undefined)?.[k.type] !== false);
              return (
                <div key={family} className="rounded-lg border border-[var(--anda-border)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold">{t(`hotspot_family_${family}` as never)}</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canEdit}
                      onClick={() => {
                        const next: Record<string, boolean> = { ...((vr.types as Record<string, boolean>) ?? {}) };
                        for (const k of kinds) next[k.type] = !allOn;
                        patchVr({ types: next });
                      }}
                    >
                      {allOn ? t("disable_family") : t("enable_family")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {kinds.map((k) => (
                      <Switch
                        key={k.type}
                        id={`vr-${k.type}`}
                        checked={(vr.types as Record<string, boolean> | undefined)?.[k.type] !== false}
                        disabled={!canEdit}
                        label={t(`hotspot_${k.type}` as never)}
                        onCheckedChange={(v) =>
                          patchVr({ types: { ...((vr.types as Record<string, boolean>) ?? {}), [k.type]: v } })
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-[var(--anda-text-dim)]">{t("vr_nav_always")}</p>
          </div>
        )}
      </section>

      <section className="anda-bloque p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("autorotate")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <Switch id="ar-enabled" checked={autorotate.enabled === true} disabled={!canEdit}
            onCheckedChange={(v) => patch((s) => { s.autorotate = { ...(s.autorotate as object), enabled: v }; })} label={t("enabled")} />
          <Field label={t("speed")} htmlFor="ar-speed">
            <Input id="ar-speed" type="number" step="0.01" className="max-w-24" value={String(autorotate.speed ?? 0.06)} disabled={!canEdit}
              onChange={(e) => patch((s) => { s.autorotate = { ...(s.autorotate as object), speed: parseFloat(e.target.value) }; })} />
          </Field>
          <Field label={t("delay_s")} htmlFor="ar-delay">
            <Input id="ar-delay" type="number" className="max-w-24" value={String(autorotate.delay ?? 5)} disabled={!canEdit}
              onChange={(e) => patch((s) => { s.autorotate = { ...(s.autorotate as object), delay: parseFloat(e.target.value) }; })} />
          </Field>
        </div>
      </section>

      <section className="anda-bloque p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("welcome_screen")} / {t("final_screen")}</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <Switch id="ws-en" checked={welcome.enabled === true} disabled={!canEdit}
              onCheckedChange={(v) => patchUi({ welcome: { ...welcome, enabled: v } })} label={`${t("welcome_screen")}: ${t("enabled")}`} />
            <Field label={t("title")} htmlFor="ws-title">
              <Input id="ws-title" value={String(welcome.title ?? "")} disabled={!canEdit} onChange={(e) => patchUi({ welcome: { ...welcome, enabled: welcome.enabled === true, title: e.target.value } })} />
            </Field>
            <Field label={t("body_text")} htmlFor="ws-body">
              <Textarea id="ws-body" rows={2} value={String(welcome.body ?? "")} disabled={!canEdit} onChange={(e) => patchUi({ welcome: { ...welcome, enabled: welcome.enabled === true, body: e.target.value } })} />
            </Field>
          </div>
          <div className="space-y-3">
            <Switch id="fs-en" checked={final.enabled === true} disabled={!canEdit}
              onCheckedChange={(v) => patchUi({ final: { ...final, enabled: v } })} label={`${t("final_screen")}: ${t("enabled")}`} />
            <Field label={t("title")} htmlFor="fs-title">
              <Input id="fs-title" value={String(final.title ?? "")} disabled={!canEdit} onChange={(e) => patchUi({ final: { ...final, enabled: final.enabled === true, title: e.target.value } })} />
            </Field>
            <Field label={t("cta_label")} htmlFor="fs-cta">
              <Input id="fs-cta" value={String(final.cta?.label ?? "")} disabled={!canEdit}
                onChange={(e) => patchUi({ final: { ...final, enabled: final.enabled === true, cta: { ...(final.cta ?? {}), label: e.target.value, url: final.cta?.url ?? "https://" } } })} />
            </Field>
            <Field label={t("cta_url")} htmlFor="fs-url">
              <Input id="fs-url" value={String(final.cta?.url ?? "")} disabled={!canEdit}
                onChange={(e) => patchUi({ final: { ...final, enabled: final.enabled === true, cta: { ...(final.cta ?? {}), url: e.target.value, label: final.cta?.label ?? "" } } })} />
            </Field>
          </div>
        </div>
      </section>

      <section className="anda-bloque p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("quiz_settings")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t("passing_score")} htmlFor="qz-pass">
            <Input id="qz-pass" type="number" className="max-w-24" value={quiz.passingScore != null ? String(quiz.passingScore) : ""} disabled={!canEdit}
              onChange={(e) => patch((s) => { s.quiz = { ...(s.quiz as object), passingScore: e.target.value === "" ? undefined : parseInt(e.target.value, 10) }; })} />
          </Field>
          <Switch id="qz-report" checked={quiz.finalReport !== false} disabled={!canEdit}
            onCheckedChange={(v) => patch((s) => { s.quiz = { ...(s.quiz as object), finalReport: v }; })} label={t("final_report")} />
          <Switch id="qz-cert" checked={quiz.certificate?.enabled === true} disabled={!canEdit}
            onCheckedChange={(v) => patch((s) => { s.quiz = { ...(s.quiz as object), certificate: { ...(quiz.certificate ?? {}), enabled: v } }; })} label={t("certificate")} />
          <Switch id="qz-rand" checked={quiz.randomize === true} disabled={!canEdit}
            onCheckedChange={(v) => patch((s) => { s.quiz = { ...(s.quiz as object), randomize: v }; })} label="Aleatorizar" />
        </div>
      </section>

      <section className="anda-bloque p-5">
        <h2 className="mb-1 text-[15px] font-semibold">{t("treasure_hunt")}</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--anda-text-dim)]">{t("treasure_explain")}</p>
        {(() => {
          const tesoros = snapshot.hotspots.filter((h) => h.type === "treasure");
          if (tesoros.length === 0) {
            return <p className="rounded-lg bg-[var(--anda-surface-2)] px-3 py-2 text-[12.5px] text-[var(--anda-text-dim)]">{t("treasure_none_yet")}</p>;
          }
          return (
            <div className="space-y-4">
              <p className="rounded-lg bg-[var(--anda-primary-soft)] px-3 py-2 text-[12.5px]">
                {t("treasure_count_hint", { n: String(tesoros.length) })}
              </p>
              <ul className="space-y-1">
                {tesoros.map((h, i) => {
                  const escena = snapshot.scenes.find((sc) => sc.id === h.sceneId);
                  const etiqueta = (JSON.parse(h.contentJson || "{}") as { label?: string }).label;
                  return (
                    <li key={h.id} className="flex items-center gap-2 rounded-lg bg-[var(--anda-surface-2)] px-2.5 py-1.5 text-[13px]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--anda-primary)] text-[11px] font-semibold text-[#33260f]">{i + 1}</span>
                      <span className="flex-1 truncate">
                        {etiqueta != null && etiqueta !== "" ? etiqueta : t("hotspot_treasure")}
                        <span className="text-[var(--anda-text-dim)]"> · {escena?.title ?? h.sceneId}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("treasure_title_label")} htmlFor="th-title">
                  <Input id="th-title" value={String(hunt.title ?? "")} disabled={!canEdit}
                    placeholder={t("treasure_title_placeholder")}
                    onChange={(e) => patch((s2) => { s2.treasureHunt = { ...(s2.treasureHunt as object), title: e.target.value || undefined }; })} />
                </Field>
                <Field label={t("treasure_completion")} htmlFor="th-done">
                  <Input id="th-done" value={String(hunt.completionMessage ?? "")} disabled={!canEdit}
                    placeholder={t("treasure_completion_placeholder")}
                    onChange={(e) => patch((s2) => { s2.treasureHunt = { ...(s2.treasureHunt as object), completionMessage: e.target.value || undefined }; })} />
                </Field>
              </div>
            </div>
          );
        })()}
      </section>

      <section className="anda-bloque p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("geo_map")}</h2>
        <Switch id="geo-en" checked={geoMap.enabled === true} disabled={!canEdit}
          onCheckedChange={(v) => patch((s) => { s.geoMap = { ...(s.geoMap as object), enabled: v }; })} label={t("enabled")} />
      </section>

      <section className="anda-bloque p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("autopilot_routes")} / {t("variables")}</h2>
        <Field label={`${t("autopilot_routes")} (JSON)`} htmlFor="ap-json" hint='[{"id":"r1","title":"Visita","steps":[{"scene":"...","rotate":6.28,"dwell":2}],"loop":true}]'>
          <Textarea
            id="ap-json"
            rows={3}
            className="font-mono text-xs"
            defaultValue={settings.autopilot != null ? JSON.stringify(settings.autopilot) : ""}
            disabled={!canEdit}
            onBlur={(e) => {
              try {
                const parsed = e.target.value.trim() === "" ? undefined : JSON.parse(e.target.value);
                patch((s) => { s.autopilot = parsed; });
              } catch {
                // JSON invalido: no guardar
              }
            }}
          />
        </Field>
        <Field label={`${t("variables")} (JSON)`} htmlFor="vars-json" hint='{"puerta_abierta": false, "puntos": 0}'>
          <Textarea
            id="vars-json"
            rows={2}
            className="font-mono text-xs"
            defaultValue={settings.variables != null ? JSON.stringify(settings.variables) : ""}
            disabled={!canEdit}
            onBlur={(e) => {
              try {
                const parsed = e.target.value.trim() === "" ? undefined : JSON.parse(e.target.value);
                patch((s) => { s.variables = parsed; });
              } catch {
                // JSON invalido
              }
            }}
          />
        </Field>
      </section>
    </div>
  );
}

