import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Spinner } from "@ull360/ui";
import { api } from "../api";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import type { ProjectInfo } from "./EditorPage";

interface Summary {
  slug: string;
  unavailable?: boolean;
  reason?: string;
  visits: number;
  uniqueSessions: number;
  sceneViews: { sceneId: string; views: number; avgDurationMs: number }[];
  hotspotClicks: { sceneId: string; hotspotId: string; clicks: number }[];
  devices: { device: string; count: number }[];
  languages: { lang: string; count: number }[];
  referers: { host: string; count: number }[];
  heatmap: { sceneId: string; yawBucket: number; pitchBucket: number; count: number }[];
  timeseries: { day: string; visits: number }[];
}

/** Panel de analitica (§2.14): embudo, hotspots, heatmap de orientaciones. */
export function AnalyticsView({ project }: { project: ProjectInfo }): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const [days, setDays] = useState(30);
  const to = Date.now();
  const from = to - days * 24 * 3600 * 1000;
  const q = useQuery({
    queryKey: ["analytics", project.id, days],
    queryFn: () => api<Summary>(`/projects/${project.id}/analytics?from=${from}&to=${to}`),
    retry: 0,
  });

  const sceneTitle = (id: string): string => editor.snapshot?.scenes.find((s) => s.id === id)?.title ?? id;

  if (q.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  const data = q.data;
  if (data == null || q.isError) {
    return <p className="p-6 text-sm text-[var(--ull-text-dim)]">{(q.error as Error | null)?.message ?? t("no_data")}</p>;
  }
  if (data.unavailable === true) {
    return <p className="p-6 text-sm text-[var(--ull-text-dim)]">{data.reason}</p>;
  }

  const maxViews = Math.max(1, ...data.sceneViews.map((s) => s.views));
  const maxTs = Math.max(1, ...data.timeseries.map((d) => d.visits));
  const heatByScene = new Map<string, { yawBucket: number; pitchBucket: number; count: number }[]>();
  for (const h of data.heatmap) {
    heatByScene.set(h.sceneId, [...(heatByScene.get(h.sceneId) ?? []), h]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm ${days === d ? "bg-[var(--ull-primary)] text-white" : "bg-[var(--ull-surface-2)]"}`}
          >
            {t(`period_${d}`)}
          </button>
        ))}
        <div className="flex-1" />
        <a href={`/api/v1/projects/${project.id}/submissions.csv`} download>
          <Button size="sm" variant="outline">
            <Download className="h-4 w-4" /> {t("form_submissions")}
          </Button>
        </a>
        <a href={`/api/v1/projects/${project.id}/quiz-results.csv`} download>
          <Button size="sm" variant="outline">
            <Download className="h-4 w-4" /> {t("quiz_results")}
          </Button>
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("visits")} value={data.visits} />
        <Stat label={t("unique_sessions")} value={data.uniqueSessions} />
        <Stat label={t("devices")} value={data.devices.length > 0 ? data.devices.sort((a, b) => b.count - a.count)[0]!.device : "-"} />
        <Stat label={t("languages_stat")} value={data.languages.length > 0 ? data.languages.sort((a, b) => b.count - a.count)[0]!.lang : "-"} />
      </div>

      {/* Serie temporal */}
      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
        <h2 className="mb-3 text-[15px] font-semibold">{t("visits")}</h2>
        {data.timeseries.length === 0 ? (
          <p className="text-sm text-[var(--ull-text-dim)]">{t("no_data")}</p>
        ) : (
          <svg viewBox={`0 0 ${Math.max(1, data.timeseries.length) * 20} 120`} className="h-28 w-full" role="img" aria-label={t("visits")}>
            {data.timeseries.map((d, i) => (
              <g key={d.day}>
                <rect x={i * 20 + 2} y={110 - (d.visits / maxTs) * 100} width={16} height={(d.visits / maxTs) * 100} rx={3} fill="var(--ull-primary)">
                  <title>{`${d.day}: ${d.visits}`}</title>
                </rect>
              </g>
            ))}
          </svg>
        )}
      </section>

      {/* Embudo de escenas */}
      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
        <h2 className="mb-3 text-[15px] font-semibold">{t("scene_funnel")}</h2>
        <div className="space-y-2">
          {[...data.sceneViews]
            .sort((a, b) => b.views - a.views)
            .map((s) => (
              <div key={s.sceneId} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate">{sceneTitle(s.sceneId)}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--ull-surface-2)]">
                  <div className="flex h-full items-center rounded bg-[var(--ull-primary)] px-2 text-[11px] text-white" style={{ width: `${(s.views / maxViews) * 100}%` }}>
                    {s.views}
                  </div>
                </div>
                <span className="w-16 text-right text-xs text-[var(--ull-text-dim)]">{(s.avgDurationMs / 1000).toFixed(0)}s</span>
              </div>
            ))}
          {data.sceneViews.length === 0 && <p className="text-sm text-[var(--ull-text-dim)]">{t("no_data")}</p>}
        </div>
      </section>

      {/* Hotspots mas usados */}
      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
        <h2 className="mb-3 text-[15px] font-semibold">{t("top_hotspots")}</h2>
        <div className="space-y-1.5 text-sm">
          {[...data.hotspotClicks]
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 12)
            .map((h) => (
              <div key={`${h.sceneId}-${h.hotspotId}`} className="flex items-center gap-3">
                <span className="flex-1 truncate">
                  {sceneTitle(h.sceneId)} / {h.hotspotId}
                </span>
                <span className="font-medium">{h.clicks}</span>
              </div>
            ))}
          {data.hotspotClicks.length === 0 && <p className="text-[var(--ull-text-dim)]">{t("no_data")}</p>}
        </div>
      </section>

      {/* Mapa de calor de orientaciones (a donde mira la gente §2.14) */}
      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-5">
        <h2 className="mb-3 text-[15px] font-semibold">{t("orientation_heatmap")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[...heatByScene.entries()].map(([sceneId, cells]) => {
            const maxCount = Math.max(1, ...cells.map((c) => c.count));
            return (
              <div key={sceneId}>
                <p className="mb-1 truncate text-sm font-medium">{sceneTitle(sceneId)}</p>
                <svg viewBox="0 0 160 80" className="w-full rounded-lg border border-[var(--ull-border)]" role="img" aria-label={`${t("orientation_heatmap")}: ${sceneTitle(sceneId)}`}>
                  <rect width="160" height="80" fill="var(--ull-surface-2)" />
                  {Array.from({ length: 16 }, (_, yaw) =>
                    Array.from({ length: 8 }, (_, pitch) => {
                      const cell = cells.find((c) => c.yawBucket === yaw && c.pitchBucket === pitch);
                      const alpha = cell != null ? cell.count / maxCount : 0;
                      return (
                        <rect key={`${yaw}-${pitch}`} x={yaw * 10} y={(7 - pitch) * 10} width={10} height={10} fill="var(--ull-primary)" opacity={alpha * 0.95}>
                          {cell != null && <title>{`yaw ${yaw}, pitch ${pitch}: ${cell.count}`}</title>}
                        </rect>
                      );
                    }),
                  )}
                </svg>
              </div>
            );
          })}
          {heatByScene.size === 0 && <p className="text-sm text-[var(--ull-text-dim)]">{t("no_data")}</p>}
        </div>
      </section>

      {/* Dispositivos / idiomas / origenes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ListCard title={t("devices")} items={data.devices.map((d) => [d.device, d.count])} />
        <ListCard title={t("languages_stat")} items={data.languages.map((d) => [d.lang, d.count])} />
        <ListCard title={t("referers")} items={data.referers.map((d) => [d.host, d.count])} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }): React.ReactNode {
  return (
    <div className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-[var(--ull-text-dim)]">{label}</p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: [string, number][] }): React.ReactNode {
  const t = useT();
  return (
    <div className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--ull-text-dim)]">{t("no_data")}</p>
      ) : (
        <div className="space-y-1 text-sm">
          {items
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([label, count]) => (
              <div key={label} className="flex justify-between">
                <span className="truncate">{label}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
