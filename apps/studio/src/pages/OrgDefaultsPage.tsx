import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button, Field, Input, Select, Spinner, Switch, useToast } from "@andarama/ui";
import { api } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { Cabecera } from "../components/Cabecera";
import { MediaPicker } from "../editor/MediaPicker";

/**
 * Valores por defecto de la organización.
 *
 * Es lo que hace que una facultad no tenga que reconfigurar el tema, los
 * idiomas y las pantallas en cada tour. Al guardar, los cambios se propagan a
 * los borradores que no habían personalizado esa clave; los tours publicados
 * se quedan como están hasta que se vuelvan a publicar.
 */

export interface BrandKit {
  id: string;
  name: string;
  base?: string;
  primaryColor?: string;
  fontFamily?: string;
  watermark?: { image?: string; link?: string };
}

interface Defaults {
  langs?: string[];
  defaultLang?: string;
  author?: string;
  ui?: { theme?: { base?: string; primaryColor?: string; fontFamily?: string }; [k: string]: unknown };
  transition?: { kind?: string };
  vr?: { hotspots?: string; dwellSeconds?: number };
  /** Marcas reutilizables de la organización; la de serie es la de Andarama. */
  brandKits?: BrandKit[];
}

/** Una referencia media:<id> convertida en URL servible para la miniatura. */
function logoPreviewUrl(ref: string): string {
  const m = /^media:([A-Za-z0-9_-]+)$/.exec(ref);
  return m != null ? `/api/v1/media/${m[1]}/file` : ref;
}

export function OrgDefaultsPage(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const orgId = useAuth((s) => s.currentOrgId);
  const [draft, setDraft] = useState<Defaults>({});
  const [saving, setSaving] = useState(false);
  const [logoPickerFor, setLogoPickerFor] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ["org-defaults", orgId],
    queryFn: () => api<Defaults>(`/orgs/${orgId}/defaults`),
    enabled: orgId != null,
  });

  useEffect(() => {
    if (current.data != null) setDraft(current.data);
  }, [current.data]);

  const patch = (fn: (d: Defaults) => void): void => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  const save = async (): Promise<void> => {
    if (orgId == null) return;
    setSaving(true);
    try {
      const res = await api<{ propagated: number }>(`/orgs/${orgId}/defaults`, { method: "PUT", body: { defaults: draft } });
      toast.push(t("defaults_saved", { count: String(res.propagated) }), "ok");
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setSaving(false);
    }
  };

  if (orgId == null) return null;
  if (current.isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }

  const theme = draft.ui?.theme ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Cabecera title={t("org_defaults")} hint={t("org_defaults_intro")} />

      <section className="space-y-4 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-5">
        <h2 className="text-[15px] font-semibold">{t("languages")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("default_lang")} htmlFor="od-lang">
            <Input
              id="od-lang"
              value={draft.defaultLang ?? ""}
              placeholder="es"
              onChange={(e) => patch((d) => { d.defaultLang = e.target.value || undefined; })}
            />
          </Field>
          <Field label={t("tour_langs")} htmlFor="od-langs" hint="es, en, de">
            <Input
              id="od-langs"
              value={(draft.langs ?? []).join(", ")}
              onChange={(e) =>
                patch((d) => {
                  const list = e.target.value.split(",").map((l) => l.trim()).filter((l) => l !== "");
                  d.langs = list.length > 0 ? list : undefined;
                })
              }
            />
          </Field>
        </div>
        <Field label={t("author")} htmlFor="od-author">
          <Input id="od-author" value={draft.author ?? ""} onChange={(e) => patch((d) => { d.author = e.target.value || undefined; })} />
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-5">
        <h2 className="text-[15px] font-semibold">{t("theme")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("theme")} htmlFor="od-base">
            <Select
              id="od-base"
              value={theme.base === "ull" ? "anda" : theme.base ?? "anda"}
              onChange={(e) => patch((d) => { d.ui = { ...d.ui, theme: { ...d.ui?.theme, base: e.target.value } }; })}
            >
              <option value="anda">Andarama</option>
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
              <option value="auto">Auto</option>
            </Select>
          </Field>
          <Field label={t("primary_color")} htmlFor="od-color">
            <Input
              id="od-color"
              value={theme.primaryColor ?? ""}
              placeholder="#f59e00"
              onChange={(e) => patch((d) => { d.ui = { ...d.ui, theme: { ...d.ui?.theme, primaryColor: e.target.value || undefined } }; })}
            />
          </Field>
          <Field label={t("font")} htmlFor="od-font">
            <Input
              id="od-font"
              value={theme.fontFamily ?? ""}
              placeholder="Baloo 2"
              onChange={(e) => patch((d) => { d.ui = { ...d.ui, theme: { ...d.ui?.theme, fontFamily: e.target.value || undefined } }; })}
            />
          </Field>
        </div>
        <Field label={t("transition")} htmlFor="od-trans">
          <Select
            id="od-trans"
            value={draft.transition?.kind ?? "fade"}
            onChange={(e) => patch((d) => { d.transition = { kind: e.target.value }; })}
          >
            <option value="fade">Fundido</option>
            <option value="zoom">Zoom</option>
            <option value="crossRotate">Fundido con rotación</option>
            <option value="cut">Corte</option>
          </Select>
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-5">
        <h2 className="text-[15px] font-semibold">{t("vr_settings")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("vr_hotspots_mode")} htmlFor="od-vr">
            <Select
              id="od-vr"
              value={draft.vr?.hotspots ?? "all"}
              onChange={(e) => patch((d) => { d.vr = { ...d.vr, hotspots: e.target.value }; })}
            >
              <option value="all">{t("vr_hotspots_all")}</option>
              <option value="navigationOnly">{t("vr_hotspots_nav")}</option>
            </Select>
          </Field>
          <Field label={t("vr_dwell")} htmlFor="od-dwell">
            <Input
              id="od-dwell"
              type="number"
              step="0.5"
              value={String(draft.vr?.dwellSeconds ?? 2.5)}
              onChange={(e) => patch((d) => { d.vr = { ...d.vr, dwellSeconds: Number(e.target.value) }; })}
            />
          </Field>
        </div>
        <Switch
          id="od-accessible"
          checked={draft.ui?.accessibleMode !== false}
          label={t("ui_accessibleMode")}
          onCheckedChange={(v) => patch((d) => { d.ui = { ...d.ui, accessibleMode: v }; })}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-5">
        <h2 className="text-[15px] font-semibold">{t("brand_kits")}</h2>
        <p className="text-[13px] leading-relaxed text-[var(--anda-text-dim)]">{t("brand_kits_intro")}</p>
        {(draft.brandKits ?? []).map((kit, i) => (
          <div key={kit.id} className="space-y-3 rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface-2)] p-4">
            <div className="flex items-center gap-3">
              <Input
                aria-label={t("brand_name")}
                className="max-w-xs font-semibold"
                value={kit.name}
                onChange={(e) => patch((d) => { d.brandKits![i]!.name = e.target.value; })}
              />
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => patch((d) => { d.brandKits = d.brandKits!.filter((k) => k.id !== kit.id); })}>
                {t("delete")}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t("theme")} htmlFor={`bk-base-${kit.id}`}>
                <Select id={`bk-base-${kit.id}`} value={kit.base ?? "anda"}
                  onChange={(e) => patch((d) => { d.brandKits![i]!.base = e.target.value; })}>
                  <option value="anda">Andarama</option>
                  <option value="dark">Oscuro</option>
                  <option value="light">Claro</option>
                  <option value="auto">Auto</option>
                </Select>
              </Field>
              <Field label={t("primary_color")} htmlFor={`bk-color-${kit.id}`}>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={t("primary_color")} value={kit.primaryColor ?? "#f59e00"}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[var(--anda-border)] bg-transparent p-0.5"
                    onChange={(e) => patch((d) => { d.brandKits![i]!.primaryColor = e.target.value; })} />
                  <Input aria-label={`${t("primary_color")} (hex)`} className="font-mono text-xs uppercase"
                    value={kit.primaryColor ?? ""} placeholder="#f59e00"
                    onChange={(e) => patch((d) => { d.brandKits![i]!.primaryColor = e.target.value || undefined; })} />
                </div>
              </Field>
              <Field label={t("font")} htmlFor={`bk-font-${kit.id}`}>
                <Input id={`bk-font-${kit.id}`} value={kit.fontFamily ?? ""} placeholder="Baloo 2"
                  onChange={(e) => patch((d) => { d.brandKits![i]!.fontFamily = e.target.value || undefined; })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("brand_logo")} htmlFor={`bk-logo-${kit.id}`} hint={t("brand_logo_hint")}>
                <div className="flex items-center gap-2">
                  {kit.watermark?.image != null && kit.watermark.image !== "" && (
                    <img src={logoPreviewUrl(kit.watermark.image)} alt="" className="h-9 w-9 rounded-lg border border-[var(--anda-border)] bg-white object-contain" />
                  )}
                  <Button size="sm" variant="outline" onClick={() => setLogoPickerFor(kit.id)}>
                    {kit.watermark?.image != null ? t("change") : t("choose")}
                  </Button>
                  {kit.watermark?.image != null && (
                    <Button size="sm" variant="ghost" onClick={() => patch((d) => { d.brandKits![i]!.watermark = { ...d.brandKits![i]!.watermark, image: undefined }; })}>
                      {t("delete")}
                    </Button>
                  )}
                </div>
              </Field>
              <Field label={t("brand_logo_link")} htmlFor={`bk-link-${kit.id}`}>
                <Input id={`bk-link-${kit.id}`} value={kit.watermark?.link ?? ""} placeholder="https://…"
                  onChange={(e) => patch((d) => { d.brandKits![i]!.watermark = { ...d.brandKits![i]!.watermark, link: e.target.value || undefined }; })} />
              </Field>
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline"
          onClick={() => patch((d) => {
            d.brandKits = [...(d.brandKits ?? []), { id: `marca-${Date.now().toString(36)}`, name: t("brand_new_name"), base: "anda", primaryColor: "#f59e00" }];
          })}>
          {t("brand_add")}
        </Button>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} loading={saving}>
          <Save className="h-4 w-4" /> {t("save")}
        </Button>
        <p className="text-xs text-[var(--anda-text-dim)]">{t("defaults_propagation_note")}</p>
      </div>

      <MediaPicker
        open={logoPickerFor != null}
        onClose={() => setLogoPickerFor(null)}
        kind="image"
        onSelect={(item) => {
          patch((d) => {
            const kit = d.brandKits?.find((k) => k.id === logoPickerFor);
            if (kit != null) kit.watermark = { ...kit.watermark, image: `media:${item.id}` };
          });
        }}
      />
    </div>
  );
}
