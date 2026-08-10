import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Save } from "lucide-react";
import { Button, Field, Input, Select, Spinner, Switch, useToast } from "@andarama/ui";
import { api } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";

/**
 * Valores por defecto de la organización.
 *
 * Es lo que hace que una facultad no tenga que reconfigurar el tema, los
 * idiomas y las pantallas en cada tour. Al guardar, los cambios se propagan a
 * los borradores que no habían personalizado esa clave; los tours publicados
 * se quedan como están hasta que se vuelvan a publicar.
 */

interface Defaults {
  langs?: string[];
  defaultLang?: string;
  author?: string;
  ui?: { theme?: { base?: string; primaryColor?: string; fontFamily?: string }; [k: string]: unknown };
  transition?: { kind?: string };
  vr?: { hotspots?: string; dwellSeconds?: number };
}

export function OrgDefaultsPage(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const orgId = useAuth((s) => s.currentOrgId);
  const [draft, setDraft] = useState<Defaults>({});
  const [saving, setSaving] = useState(false);

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
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--anda-primary-soft)] text-[var(--anda-primary)]">
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold">{t("org_defaults")}</h1>
          <p className="text-[13px] text-[var(--anda-text-dim)]">{t("org_defaults_intro")}</p>
        </div>
      </div>

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

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} loading={saving}>
          <Save className="h-4 w-4" /> {t("save")}
        </Button>
        <p className="text-xs text-[var(--anda-text-dim)]">{t("defaults_propagation_note")}</p>
      </div>
    </div>
  );
}
