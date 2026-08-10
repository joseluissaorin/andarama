import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { Button, Input, Select, useToast } from "@andarama/ui";
import { api } from "../api";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { readAreas } from "./areas";
import type { ProjectInfo } from "./EditorPage";

interface TranslationEntry {
  entity: string;
  entityId: string;
  field: string;
  value: string;
}

/** Vista de traduccion lado a lado con completitud y XLIFF/CSV (§3.4). */
export function TranslationsView({ project, canEdit }: { project: ProjectInfo; canEdit: boolean }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const defaultLang = (snapshot.settings.defaultLang as string) ?? "es";
  const langs = ((snapshot.settings.langs as string[]) ?? [defaultLang]).filter((l) => l !== defaultLang);
  const [lang, setLang] = useState(langs[0] ?? "");
  const [newLang, setNewLang] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const importFormat = useRef<"xliff" | "csv">("xliff");

  const sources = useQuery({
    queryKey: ["tr-sources", project.id, snapshot.scenes.length, readAreas(snapshot.settings).map((a) => `${a.id}:${a.title}`).join("|")],
    queryFn: async () => {
      // Las cadenas de origen se derivan del snapshot local (ya cargado)
      const out: { entity: string; entityId: string; field: string; value: string; label: string }[] = [];
      out.push({ entity: "tour", entityId: "meta", field: "title", value: String(project.title), label: "Título del tour" });
      const desc = snapshot.settings.description;
      if (typeof desc === "string" && desc !== "") out.push({ entity: "tour", entityId: "meta", field: "description", value: desc, label: "Descripción" });
      // Las áreas dan nombre a los grupos del menú de escenas y a las plantas
      // del minimapa: si no se traducen, un tour bilingüe enseña «Planta baja»
      // a todo el mundo.
      for (const area of readAreas(snapshot.settings)) {
        if (area.title.trim() === "") continue;
        out.push({ entity: "area", entityId: area.id, field: "title", value: area.title, label: `Área: ${area.title}` });
      }
      for (const scene of snapshot.scenes) {
        out.push({ entity: "scene", entityId: scene.id, field: "title", value: scene.title, label: `${scene.title}: título` });
        const meta = JSON.parse(scene.metaJson || "{}") as Record<string, unknown>;
        for (const f of ["description", "altText", "category"]) {
          if (typeof meta[f] === "string" && meta[f] !== "") {
            out.push({ entity: "scene", entityId: scene.id, field: f, value: meta[f] as string, label: `${scene.title}: ${f}` });
          }
        }
        for (const hs of snapshot.hotspots.filter((h) => h.sceneId === scene.id)) {
          const content = JSON.parse(hs.contentJson || "{}") as Record<string, unknown>;
          const walk = (obj: unknown, path: string): void => {
            if (obj == null) return;
            if (Array.isArray(obj)) {
              obj.forEach((v, i) => walk(v, path === "" ? String(i) : `${path}.${i}`));
              return;
            }
            if (typeof obj === "object") {
              for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
                const p = path === "" ? k : `${path}.${k}`;
                const l10nFields = ["label", "altText", "tooltip", "body", "title", "caption", "text", "question", "feedbackCorrect", "feedbackWrong", "successMessage", "submitLabel", "transcript"];
                if (typeof v === "string" && v !== "" && (l10nFields.includes(k) || /\.(title|description|label|text)$/.test(p))) {
                  out.push({ entity: "hotspot", entityId: hs.id, field: p, value: v, label: `${scene.title} / ${hs.type}: ${p}` });
                } else if (typeof v === "object") {
                  walk(v, p);
                }
              }
            }
          };
          walk(content, "");
        }
      }
      return out;
    },
  });

  const existing = useQuery({
    queryKey: ["translations", project.id, lang],
    queryFn: () => api<TranslationEntry[]>(`/projects/${project.id}/translations/${lang}`),
    enabled: lang !== "",
  });

  const trMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of existing.data ?? []) map.set(`${e.entity}:${e.entityId}:${e.field}`, e.value);
    return map;
  }, [existing.data]);

  const completeness = useMemo(() => {
    const total = sources.data?.length ?? 0;
    if (total === 0) return 100;
    let done = 0;
    for (const s of sources.data ?? []) {
      const key = `${s.entity}:${s.entityId}:${s.field}`;
      if ((drafts[key] ?? trMap.get(key) ?? "") !== "") done++;
    }
    return Math.round((done / total) * 100);
  }, [sources.data, trMap, drafts]);

  const saveDrafts = async (): Promise<void> => {
    const entries = Object.entries(drafts).map(([key, value]) => {
      const [entity, entityId, ...fieldParts] = key.split(":");
      return { entity: entity!, entityId: entityId!, field: fieldParts.join(":"), value };
    });
    if (entries.length === 0) return;
    await api(`/projects/${project.id}/translations/${lang}`, { method: "PUT", body: entries });
    setDrafts({});
    void queryClient.invalidateQueries({ queryKey: ["translations", project.id, lang] });
    toast.push(t("saved"), "ok");
  };

  const addLanguage = (): void => {
    const code = newLang.trim().toLowerCase();
    if (code === "" || code === defaultLang) return;
    editor.apply((draft) => {
      const list = (draft.settings.langs as string[]) ?? [defaultLang];
      if (!list.includes(code)) draft.settings.langs = [...list, code];
    });
    setLang(code);
    setNewLang("");
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-[var(--anda-text-dim)]">
          {t("source_lang")}: <strong>{defaultLang}</strong>
        </span>
        <Select value={lang} onChange={(e) => setLang(e.target.value)} className="max-w-32" aria-label="Idioma destino">
          {langs.length === 0 && <option value="">-</option>}
          {langs.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            <Input value={newLang} onChange={(e) => setNewLang(e.target.value)} placeholder="fr" className="max-w-20" aria-label={t("add_language")} />
            <Button size="sm" variant="outline" onClick={addLanguage}>
              <Plus className="h-4 w-4" /> {t("add_language")}
            </Button>
          </div>
        )}
        <div className="flex-1" />
        {lang !== "" && (
          <>
            <span className="text-sm">
              {t("completeness")}: <strong>{completeness}%</strong>
            </span>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--anda-surface-2)]">
              <div className="h-full bg-[var(--anda-primary)]" style={{ width: `${completeness}%` }} />
            </div>
            <a href={`/api/v1/projects/${project.id}/translations/${lang}/xliff`} download>
              <Button size="sm" variant="outline">
                <Download className="h-4 w-4" /> XLIFF
              </Button>
            </a>
            <a href={`/api/v1/projects/${project.id}/translations/${lang}/csv`} download>
              <Button size="sm" variant="outline">
                <Download className="h-4 w-4" /> CSV
              </Button>
            </a>
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    importFormat.current = "xliff";
                    fileInput.current?.click();
                  }}
                >
                  <Upload className="h-4 w-4" /> {t("import_xliff")}
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xliff,.xlf,.csv"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file == null) return;
                    const format = file.name.endsWith(".csv") ? "csv" : "xliff";
                    void file.text().then((text) =>
                      api<{ imported: number }>(`/projects/${project.id}/translations/${lang}/${format}`, {
                        method: "POST",
                        body: text,
                        headers: { "content-type": format === "csv" ? "text/csv" : "application/xml" },
                      }).then((r) => {
                        toast.push(`${r.imported} traducciones importadas`, "ok");
                        void queryClient.invalidateQueries({ queryKey: ["translations", project.id, lang] });
                      }),
                    );
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </>
        )}
      </div>

      {lang === "" ? (
        <p className="text-sm text-[var(--anda-text-dim)]">{t("add_language")}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--anda-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--anda-surface-2)] text-left text-xs text-[var(--anda-text-dim)]">
              <tr>
                <th className="w-1/2 px-4 py-2">{defaultLang}</th>
                <th className="px-4 py-2">{lang}</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--anda-surface)]">
              {(sources.data ?? []).map((s) => {
                const key = `${s.entity}:${s.entityId}:${s.field}`;
                const value = drafts[key] ?? trMap.get(key) ?? "";
                return (
                  <tr key={key} className="border-t border-[var(--anda-border)] align-top">
                    <td className="px-4 py-2">
                      <p className="text-[11px] text-[var(--anda-text-dim)]">{s.label}</p>
                      <p className="whitespace-pre-wrap">{s.value}</p>
                    </td>
                    <td className="px-4 py-2">
                      <textarea
                        className={`w-full resize-y rounded-lg border bg-transparent p-2 text-sm ${value === "" ? "border-amber-300" : "border-[var(--anda-border)]"}`}
                        rows={Math.min(4, Math.max(1, Math.ceil(s.value.length / 60)))}
                        value={value}
                        disabled={!canEdit}
                        aria-label={s.label}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {Object.keys(drafts).length > 0 && (
        <div className="sticky bottom-4 mt-4 flex justify-end">
          <Button onClick={() => void saveDrafts()}>{t("save")}</Button>
        </div>
      )}
    </div>
  );
}
