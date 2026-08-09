import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select } from "@ull360/ui";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import { clientId, readJson } from "./editorApi";
import { MediaPicker } from "./MediaPicker";
import type { ProjectInfo } from "./EditorPage";

/**
 * Editor de plano de planta (§3.4): subir plano, arrastrar escenas al plano,
 * orientar el radar (norte del panorama) y soporte multi-planta.
 */
export function FloorplanView({ project, canEdit }: { project: ProjectInfo; canEdit: boolean }): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const floorplans = (snapshot.settings.floorplans as { id: string; title: string; url: string; level?: number }[]) ?? [];
  const [currentId, setCurrentId] = useState<string | null>(floorplans[0]?.id ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const current = floorplans.find((f) => f.id === currentId) ?? floorplans[0] ?? null;

  const patchSettings = (fn: (settings: Record<string, unknown>) => void): void => {
    editor.apply((draft) => fn(draft.settings));
  };

  const scenesOnPlan = snapshot.scenes.filter((s) => {
    const map = readJson<{ floorplan?: string }>(s.mapJson, {});
    return map.floorplan === current?.id;
  });
  const scenesOffPlan = snapshot.scenes.filter((s) => !scenesOnPlan.includes(s));

  const mediaUrl = (ref: string): string => {
    const m = /^media:(.+)$/.exec(ref);
    return m != null ? `/api/v1/media/${m[1]}/file` : ref;
  };

  return (
    <div className="flex h-full">
      <aside className="w-64 space-y-4 overflow-y-auto border-r border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("floorplan")}</h3>
            {canEdit && (
              <Button size="sm" variant="ghost" aria-label={t("add_floorplan")} onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          {floorplans.map((fp) => (
            <div key={fp.id} className={`mb-1 flex items-center gap-2 rounded-lg p-2 ${current?.id === fp.id ? "bg-[var(--ull-surface-2)]" : ""}`}>
              <button type="button" className="flex-1 truncate text-left text-sm" onClick={() => setCurrentId(fp.id)}>
                {fp.title}
              </button>
              <Input
                type="number"
                className="max-w-14 text-xs"
                value={String(fp.level ?? 0)}
                disabled={!canEdit}
                aria-label={t("floor_level")}
                onChange={(e) => {
                  patchSettings((s) => {
                    const list = (s.floorplans as typeof floorplans) ?? [];
                    const target = list.find((x) => x.id === fp.id);
                    if (target != null) target.level = parseInt(e.target.value, 10);
                  });
                }}
              />
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={t("delete")}
                  onClick={() => {
                    patchSettings((s) => {
                      s.floorplans = ((s.floorplans as typeof floorplans) ?? []).filter((x) => x.id !== fp.id);
                    });
                    editor.apply((draft) => {
                      for (const scene of draft.scenes) {
                        const map = readJson<Record<string, unknown>>(scene.mapJson, {});
                        if (map.floorplan === fp.id) {
                          delete map.floorplan;
                          delete map.x;
                          delete map.y;
                          scene.mapJson = Object.keys(map).length > 0 ? JSON.stringify(map) : null;
                        }
                      }
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {current != null && (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("scenes")}</h3>
            <p className="mb-2 text-xs text-[var(--ull-text-dim)]">{t("drag_scenes_hint")}</p>
            {scenesOffPlan.map((scene) => (
              <div
                key={scene.id}
                draggable={canEdit}
                onDragStart={(e) => e.dataTransfer.setData("text/scene-id", scene.id)}
                className="mb-1 cursor-grab rounded-lg border border-dashed border-[var(--ull-border)] px-3 py-2 text-sm"
              >
                {scene.title}
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="relative flex-1 overflow-auto bg-[var(--ull-surface-2)] p-6">
        {current == null ? (
          <div className="flex h-full items-center justify-center">
            <Button disabled={!canEdit} onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" /> {t("add_floorplan")}
            </Button>
          </div>
        ) : (
          <div
            className="relative mx-auto max-w-4xl"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const sceneId = e.dataTransfer.getData("text/scene-id");
              if (sceneId === "" || !canEdit) return;
              const rect = (e.currentTarget.querySelector("img") as HTMLElement).getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              const y = (e.clientY - rect.top) / rect.height;
              editor.apply((draft) => {
                const scene = draft.scenes.find((s) => s.id === sceneId);
                if (scene != null) {
                  const map = readJson<Record<string, unknown>>(scene.mapJson, {});
                  scene.mapJson = JSON.stringify({ ...map, floorplan: current.id, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
                }
              });
            }}
          >
            <img src={mediaUrl(current.url)} alt={current.title} className="w-full rounded-xl border border-[var(--ull-border)] bg-white shadow" />
            {scenesOnPlan.map((scene) => {
              const map = readJson<{ x?: number; y?: number; north?: number }>(scene.mapJson, {});
              return (
                <div
                  key={scene.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(map.x ?? 0.5) * 100}%`, top: `${(map.y ?? 0.5) * 100}%` }}
                >
                  <div
                    draggable={canEdit}
                    onDragStart={(e) => e.dataTransfer.setData("text/scene-id", scene.id)}
                    className={`h-4 w-4 cursor-grab rounded-full border-2 border-white shadow ${
                      editor.selectedSceneId === scene.id ? "bg-[var(--ull-primary)]" : "bg-[var(--ull-text-dim)]"
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-label={scene.title}
                    onClick={() => editor.select(scene.id)}
                  />
                  <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    {scene.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {current != null && editor.selectedSceneId != null && scenesOnPlan.some((s) => s.id === editor.selectedSceneId) && (
          <div className="absolute right-6 top-6 w-60 space-y-3 rounded-xl bg-[var(--ull-surface)] p-4 shadow-lg">
            <p className="text-sm font-medium">{snapshot.scenes.find((s) => s.id === editor.selectedSceneId)?.title}</p>
            <Field label={t("calibrate_north")} htmlFor="fp-north" hint="Grados respecto al plano">
              <Input
                id="fp-north"
                type="number"
                step="5"
                disabled={!canEdit}
                value={String(
                  Math.round(
                    ((readJson<{ north?: number }>(snapshot.scenes.find((s) => s.id === editor.selectedSceneId)?.mapJson ?? null, {}).north ?? 0) * 180) / Math.PI,
                  ),
                )}
                onChange={(e) => {
                  const rad = (parseFloat(e.target.value || "0") * Math.PI) / 180;
                  editor.apply((draft) => {
                    const scene = draft.scenes.find((s) => s.id === editor.selectedSceneId);
                    if (scene != null) {
                      const map = readJson<Record<string, unknown>>(scene.mapJson, {});
                      scene.mapJson = JSON.stringify({ ...map, north: rad });
                    }
                  });
                }}
              />
            </Field>
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit}
              onClick={() => {
                editor.apply((draft) => {
                  const scene = draft.scenes.find((s) => s.id === editor.selectedSceneId);
                  if (scene != null) {
                    const map = readJson<Record<string, unknown>>(scene.mapJson, {});
                    delete map.floorplan;
                    delete map.x;
                    delete map.y;
                    scene.mapJson = Object.keys(map).length > 0 ? JSON.stringify(map) : null;
                  }
                });
              }}
            >
              <Trash2 className="h-4 w-4" /> {t("delete")}
            </Button>
          </div>
        )}
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        kind="floorplan"
        onSelect={(item) => {
          const id = clientId().slice(0, 10);
          patchSettings((s) => {
            const list = (s.floorplans as typeof floorplans) ?? [];
            s.floorplans = [...list, { id, title: item.filename.replace(/\.[^.]+$/, ""), url: `media:${item.id}`, level: list.length }];
          });
          setCurrentId(id);
        }}
      />
    </div>
  );
}
