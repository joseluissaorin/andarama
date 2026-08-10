import { useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { Button, Field, Input, Select, Switch, Textarea, useToast } from "@ull360/ui";
import { CssGuideDialog, cssPrompt } from "./CssGuide";
import { FAMILY_ORDER, HOTSPOT_CATALOG } from "./hotspotCatalog";
import { useEditor } from "../stores";
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

  const [cssHelp, setCssHelp] = useState(false);

  const patch = (fn: (s: Record<string, any>) => void): void => {
    if (!canEdit) return;
    editor.apply((draft) => fn(draft.settings));
  };
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
      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
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

      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
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
              <p className="ml-11 mt-0.5 text-xs leading-snug text-[var(--ull-text-dim)]">{t(`ui_${key}_desc` as never)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("theme")} htmlFor="th-base">
            <Select id="th-base" value={String(theme.base ?? "ull")} disabled={!canEdit} onChange={(e) => patchTheme({ base: e.target.value })}>
              <option value="ull">ULL</option>
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
              <option value="auto">Auto</option>
            </Select>
          </Field>
          <Field label={t("primary_color")} htmlFor="th-color">
            <Input id="th-color" type="color" value={String(theme.primaryColor ?? "#5c68a5")} disabled={!canEdit} onChange={(e) => patchTheme({ primaryColor: e.target.value })} />
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
                void navigator.clipboard.writeText(cssPrompt(String(theme.base ?? "ull"), String(theme.primaryColor ?? "#5c068c")));
                toast.push(t("prompt_copied"), "ok");
              }}
            >
              <Sparkles className="h-4 w-4" /> {t("copy_ai_prompt")}
            </Button>
          </div>
        </div>
      </section>

      <CssGuideDialog open={cssHelp} onClose={() => setCssHelp(false)} />

      {/* Gafas y cardboard: qué se puede accionar sin ratón ni teclado */}
      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
        <h2 className="mb-1 text-[15px] font-semibold">{t("vr_settings")}</h2>
        <p className="mb-4 text-xs text-[var(--ull-text-dim)]">{t("vr_settings_intro")}</p>
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
                <div key={family} className="rounded-lg border border-[var(--ull-border)] p-3">
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
            <p className="text-xs text-[var(--ull-text-dim)]">{t("vr_nav_always")}</p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
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

      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
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

      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
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

      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("treasure_hunt")}</h2>
        <Switch id="th-en" checked={hunt.enabled === true} disabled={!canEdit}
          onCheckedChange={(v) => {
            patch((s) => {
              const targets = v
                ? snapshot.hotspots
                    .filter((h) => h.type !== "navigation")
                    .slice(0, 5)
                    .map((h) => ({ hotspotId: h.id, sceneId: h.sceneId }))
                : (hunt.targets ?? []);
              s.treasureHunt = { ...(s.treasureHunt as object), enabled: v, targets };
            });
          }}
          label={`${t("enabled")} (objetivos: ${(hunt.targets ?? []).length})`} />
        <p className="mt-2 text-xs text-[var(--ull-text-dim)]">
          Los objetivos se toman de los hotspots de contenido; edita la lista en JSON avanzado si necesitas afinarlos.
        </p>
      </section>

      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("geo_map")}</h2>
        <Switch id="geo-en" checked={geoMap.enabled === true} disabled={!canEdit}
          onCheckedChange={(v) => patch((s) => { s.geoMap = { ...(s.geoMap as object), enabled: v }; })} label={t("enabled")} />
      </section>

      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
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
