import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, Eye, RotateCcw } from "lucide-react";
import { Badge, Button, Dialog, Input, useToast } from "@andarama/ui";
import type { Tour } from "@andarama/schema";
import { api } from "../api";
import { useT } from "../i18n";
import type { ProjectInfo } from "./EditorPage";

interface Version {
  id: string;
  number: number;
  note: string | null;
  kind: string;
  createdAt: number;
  createdBy: string;
}

/** Historial de versiones con diff a nivel de escena/hotspot y restauracion (§3.5). */
export function VersionsView({ project }: { project: ProjectInfo }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [diff, setDiff] = useState<{ a: number; b: number; lines: string[] } | null>(null);

  const q = useQuery({
    queryKey: ["versions", project.id],
    queryFn: () => api<Version[]>(`/projects/${project.id}/versions`),
  });

  const snapshot = async (): Promise<void> => {
    await api(`/projects/${project.id}/versions`, { method: "POST", body: { note: note || undefined } });
    setNote("");
    void queryClient.invalidateQueries({ queryKey: ["versions", project.id] });
    toast.push(t("saved"), "ok");
  };

  const restore = async (n: number): Promise<void> => {
    try {
      await api(`/projects/${project.id}/versions/${n}/restore`, { method: "POST", body: {} });
      toast.push(t("publish_ok"), "ok");
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };

  const compare = async (a: number, b: number): Promise<void> => {
    const [tourA, tourB] = await Promise.all([
      api<Tour>(`/projects/${project.id}/versions/${a}/tour`),
      api<Tour>(`/projects/${project.id}/versions/${b}/tour`),
    ]);
    setDiff({ a, b, lines: diffTours(tourA, tourB, t) });
  };

  const versions = q.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("version_note")} className="max-w-72" aria-label={t("version_note")} />
        <Button onClick={() => void snapshot()}>
          <Camera className="h-4 w-4" /> {t("snapshot")}
        </Button>
      </div>
      <div className="space-y-2">
        {versions.map((v, i) => (
          <div key={v.id} className="flex items-center gap-3 anda-ficha px-4 py-3 text-sm">
            <span className="font-mono font-bold">v{v.number}</span>
            <Badge tone={v.kind === "publish" ? "ok" : "default"}>{v.kind === "publish" ? t("published") : v.kind}</Badge>
            <span className="flex-1 truncate">{v.note ?? ""}</span>
            <span className="text-xs text-[var(--anda-text-dim)]">{new Date(v.createdAt).toLocaleString()}</span>
            {i < versions.length - 1 && (
              <Button size="sm" variant="ghost" onClick={() => void compare(versions[i + 1]!.number, v.number)}>
                <Eye className="h-4 w-4" /> {t("view_diff")}
              </Button>
            )}
            {v.kind === "publish" && project.permissions.canPublish && (
              <Button size="sm" variant="outline" onClick={() => void restore(v.number)}>
                <RotateCcw className="h-4 w-4" /> {t("restore_version")}
              </Button>
            )}
          </div>
        ))}
        {versions.length === 0 && <p className="text-sm text-[var(--anda-text-dim)]">{t("no_data")}</p>}
      </div>

      <Dialog open={diff != null} onOpenChange={(o) => !o && setDiff(null)} title={`v${diff?.a} vs v${diff?.b}`} wide>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto font-mono text-xs">
          {diff?.lines.map((line, i) => (
            <p
              key={i}
              className={
                line.startsWith("+")
                  ? "text-emerald-600"
                  : line.startsWith("-")
                    ? "text-red-500"
                    : line.startsWith("~")
                      ? "text-amber-600"
                      : "text-[var(--anda-text-dim)]"
              }
            >
              {line}
            </p>
          ))}
          {diff?.lines.length === 0 && <p>{t("no_data")}</p>}
        </div>
      </Dialog>
    </div>
  );
}

/** Diff a nivel de escena/hotspot entre dos tour.json (§3.5). */
function diffTours(a: Tour, b: Tour, t: (k: string) => string): string[] {
  const lines: string[] = [];
  const scenesA = new Map(a.scenes.map((s) => [s.id, s]));
  const scenesB = new Map(b.scenes.map((s) => [s.id, s]));
  for (const [id, scene] of scenesB) {
    if (!scenesA.has(id)) {
      lines.push(`+ ${t("scenes")}: ${JSON.stringify(scene.title)}`);
    }
  }
  for (const [id, scene] of scenesA) {
    if (!scenesB.has(id)) {
      lines.push(`- ${t("scenes")}: ${JSON.stringify(scene.title)}`);
    }
  }
  for (const [id, sceneA] of scenesA) {
    const sceneB = scenesB.get(id);
    if (sceneB == null) continue;
    const hsA = new Map(sceneA.hotspots.map((h) => [h.id, h]));
    const hsB = new Map(sceneB.hotspots.map((h) => [h.id, h]));
    for (const [hid, h] of hsB) {
      if (!hsA.has(hid)) lines.push(`+ ${JSON.stringify(sceneB.title)} / hotspot ${h.type} (${hid})`);
    }
    for (const [hid, h] of hsA) {
      if (!hsB.has(hid)) lines.push(`- ${JSON.stringify(sceneA.title)} / hotspot ${h.type} (${hid})`);
    }
    for (const [hid, hA] of hsA) {
      const hB = hsB.get(hid);
      if (hB != null && JSON.stringify(hA) !== JSON.stringify(hB)) {
        lines.push(`~ ${JSON.stringify(sceneA.title)} / hotspot ${hA.type} (${hid})`);
      }
    }
    const { hotspots: _a, ...restA } = sceneA;
    const { hotspots: _b, ...restB } = sceneB;
    if (JSON.stringify(restA) !== JSON.stringify(restB)) {
      lines.push(`~ ${t("scenes")}: ${JSON.stringify(sceneA.title)}`);
    }
  }
  const { scenes: _sa, ...metaA } = a;
  const { scenes: _sb, ...metaB } = b;
  if (JSON.stringify(metaA) !== JSON.stringify(metaB)) {
    lines.push(`~ ${t("tour_settings")}`);
  }
  return lines;
}
