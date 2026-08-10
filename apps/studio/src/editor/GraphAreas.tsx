import { useState } from "react";
import { Crosshair, Image as ImageIcon, Layers, MapPin, Plus, Ruler, Trash2 } from "lucide-react";
import { Button, Input, Tooltip } from "@andarama/ui";
import { useT } from "../i18n";
import { AREA_COLORS, type Area } from "./areas";

/**
 * Panel de áreas del grafo.
 *
 * Un área es a la vez la planta, la zona y la categoría: el marco que agrupa
 * los nodos en el lienzo, el grupo del menú de escenas del visitante y, si
 * tiene plano, la planta del minimapa. Aquí se crean y se les pone nombre,
 * color, nivel y plano.
 */

export interface AreaCounts {
  scenes: number;
  placed: number;
}

export function GraphAreas({
  areas,
  counts,
  looseCount,
  currentPlan,
  canEdit,
  onCreate,
  onPatch,
  onDelete,
  onPickPlan,
  onCalibrate,
  onFocus,
  onOpenPlan,
}: {
  areas: Area[];
  counts: Record<string, AreaCounts>;
  looseCount: number;
  currentPlan: string | null;
  canEdit: boolean;
  onCreate: (parent?: string) => void;
  onPatch: (id: string, patch: Partial<Omit<Area, "id">>) => void;
  onDelete: (id: string) => void;
  onPickPlan: (id: string) => void;
  onCalibrate: (id: string) => void;
  onFocus: (id: string) => void;
  onOpenPlan: (id: string) => void;
}): React.ReactNode {
  const t = useT();
  const [colorFor, setColorFor] = useState<string | null>(null);

  const roots = areas.filter((a) => a.parent == null || !areas.some((p) => p.id === a.parent));

  const row = (area: Area, nested: boolean): React.ReactNode => {
    const count = counts[area.id] ?? { scenes: 0, placed: 0 };
    return (
      <li key={area.id} className={nested ? "ml-4 border-l border-[var(--anda-border)] pl-2" : ""}>
        <div className="group flex items-center gap-1.5 rounded-lg px-1 py-1 hover:bg-[var(--anda-surface-2)]">
          <button
            type="button"
            aria-label={t("area_color")}
            className="h-4 w-4 shrink-0 rounded-full border border-black/10"
            style={{ background: area.color ?? AREA_COLORS[0] }}
            onClick={() => setColorFor(colorFor === area.id ? null : area.id)}
            disabled={!canEdit}
          />
          <Input
            className="h-7 flex-1 border-transparent bg-transparent px-1 text-[13px] hover:border-[var(--anda-border)]"
            value={area.title}
            disabled={!canEdit}
            aria-label={t("area_name")}
            onChange={(e) => onPatch(area.id, { title: e.target.value })}
          />
          <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-[var(--anda-text-dim)]">{count.scenes}</span>
          <Tooltip content={t("focus_area")}>
            <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={t("focus_area")} onClick={() => onFocus(area.id)}>
              <Crosshair className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>

        {colorFor === area.id && (
          <div className="mb-1 ml-5 flex flex-wrap gap-1">
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                className={`h-5 w-5 rounded-full border-2 ${area.color === c ? "border-[var(--anda-text)]" : "border-transparent"}`}
                style={{ background: c }}
                onClick={() => {
                  onPatch(area.id, { color: c });
                  setColorFor(null);
                }}
              />
            ))}
          </div>
        )}

        <div className="ml-5 flex flex-wrap items-center gap-1 pb-1">
          {area.plan != null ? (
            <>
              <Button
                size="sm"
                variant={currentPlan === area.id ? "primary" : "ghost"}
                className="h-6 px-1.5 text-[11px]"
                onClick={() => onOpenPlan(area.id)}
              >
                <MapPin className="h-3 w-3" /> {t("open_plan")}
              </Button>
              <span className="text-[11px] text-[var(--anda-text-dim)]">
                {t("placed_of", { placed: String(counts[area.id]?.placed ?? 0), total: String(counts[area.id]?.scenes ?? 0) })}
              </span>
              <Tooltip content={area.plan.widthMeters != null ? t("calibrated_width", { m: String(area.plan.widthMeters) }) : t("calibrate_plan")}>
                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-6 w-6 ${area.plan.widthMeters != null ? "text-[var(--anda-primary)]" : ""}`}
                  aria-label={t("calibrate_plan")}
                  disabled={!canEdit}
                  onClick={() => onCalibrate(area.id)}
                >
                  <Ruler className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
              <label className="flex items-center gap-1 text-[11px] text-[var(--anda-text-dim)]">
                {t("floor_level")}
                <Input
                  type="number"
                  className="h-6 w-12 px-1 text-[11px]"
                  aria-label={t("floor_level")}
                  disabled={!canEdit}
                  value={area.level != null ? String(area.level) : ""}
                  // Un campo vacío no es «planta NaN»: es «sin nivel»
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    onPatch(area.id, { level: Number.isFinite(n) ? n : undefined });
                  }}
                />
              </label>
              <Tooltip content={t("remove_plan")}>
                <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={t("remove_plan")} disabled={!canEdit} onClick={() => onPatch(area.id, { plan: undefined })}>
                  <ImageIcon className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={!canEdit} onClick={() => onPickPlan(area.id)}>
              <ImageIcon className="h-3 w-3" /> {t("add_plan")}
            </Button>
          )}
          {!nested && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={!canEdit} onClick={() => onCreate(area.id)}>
              <Plus className="h-3 w-3" /> {t("add_zone")}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={t("delete")} disabled={!canEdit} onClick={() => onDelete(area.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {areas.some((c) => c.parent === area.id) && (
          <ul>{areas.filter((c) => c.parent === area.id).map((c) => row(c, true))}</ul>
        )}
      </li>
    );
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-[var(--anda-border)] bg-[var(--anda-surface)]">
      <header className="flex items-center gap-2 border-b border-[var(--anda-border)] px-3 py-2">
        <Layers className="h-4 w-4 text-[var(--anda-primary)]" />
        <h3 className="flex-1 text-[13px] font-semibold">{t("areas")}</h3>
        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => onCreate()}>
          <Plus className="h-3.5 w-3.5" /> {t("new_area")}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {areas.length === 0 ? (
          <p className="px-2 py-4 text-[13px] text-[var(--anda-text-dim)]">{t("areas_empty")}</p>
        ) : (
          <ul>{roots.map((a) => row(a, false))}</ul>
        )}
        {looseCount > 0 && (
          <p className="mt-2 rounded-lg bg-[var(--anda-surface-2)] px-2 py-1.5 text-[11px] text-[var(--anda-text-dim)]">
            {t("scenes_without_area", { count: String(looseCount) })}
          </p>
        )}
      </div>
      <p className="border-t border-[var(--anda-border)] px-3 py-2 text-[11px] text-[var(--anda-text-dim)]">{t("areas_hint")}</p>
    </aside>
  );
}
