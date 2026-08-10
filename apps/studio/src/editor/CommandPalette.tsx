import { useEffect, useMemo, useRef, useState } from "react";
import { Command, CornerDownLeft } from "lucide-react";
import { useEditor } from "../stores";
import { useT } from "../i18n";

export interface PaletteAction {
  kind: "tab" | "scene" | "dialog" | "undo" | "redo";
  tab?: string;
  /** Modo del lienzo cuando la pestaña es el grafo. */
  mode?: string;
  sceneId?: string;
  dialog?: string;
}

/** Paleta de comandos Ctrl/Cmd+K (§3.5). */
export function CommandPalette({ open, onClose, onAction }: {
  open: boolean;
  onClose: () => void;
  onAction: (action: PaletteAction) => void;
}): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const base: { label: string; action: PaletteAction }[] = [
      { label: `${t("scenes")}`, action: { kind: "tab", tab: "scenes" } },
      { label: t("graph"), action: { kind: "tab", tab: "graph" } },
      { label: `${t("graph")}: ${t("graph_mode_plan")}`, action: { kind: "tab", tab: "graph", mode: "plan" } },
      { label: `${t("graph")}: ${t("graph_mode_geo")}`, action: { kind: "tab", tab: "graph", mode: "geo" } },
      { label: `${t("graph")}: ${t("graph_mode_autopilot")}`, action: { kind: "tab", tab: "graph", mode: "autopilot" } },
      { label: `${t("graph")}: ${t("areas")}`, action: { kind: "tab", tab: "graph", mode: "scenes" } },
      { label: t("translations"), action: { kind: "tab", tab: "translations" } },
      { label: t("settings"), action: { kind: "tab", tab: "settings" } },
      { label: t("analytics"), action: { kind: "tab", tab: "analytics" } },
      { label: t("comments"), action: { kind: "tab", tab: "comments" } },
      { label: t("versions"), action: { kind: "tab", tab: "versions" } },
      { label: t("publish"), action: { kind: "dialog", dialog: "publish" } },
      { label: t("export"), action: { kind: "dialog", dialog: "export" } },
      { label: t("share"), action: { kind: "dialog", dialog: "share" } },
      { label: t("live_tour"), action: { kind: "dialog", dialog: "live" } },
      { label: `${t("undo")} (Ctrl+Z)`, action: { kind: "undo" } },
      { label: `${t("redo")} (Ctrl+Shift+Z)`, action: { kind: "redo" } },
    ];
    for (const scene of editor.snapshot?.scenes ?? []) {
      base.push({ label: `${t("scenes")}: ${scene.title}`, action: { kind: "scene", sceneId: scene.id } });
    }
    if (query.trim() === "") return base;
    const q = query.toLowerCase();
    return base.filter((i) => i.label.toLowerCase().includes(q));
  }, [query, editor.snapshot?.scenes, t]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 pt-24" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("command_palette")}>
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-[var(--anda-surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--anda-border)] px-4 py-3">
          <Command className="h-4 w-4 text-[var(--anda-text-dim)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") setIndex((i) => Math.min(items.length - 1, i + 1));
              else if (e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
              else if (e.key === "Enter" && items[index] != null) onAction(items[index]!.action);
            }}
            placeholder={t("command_palette")}
            className="flex-1 bg-transparent text-sm outline-none"
            aria-label={t("command_palette")}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {items.slice(0, 30).map((item, i) => (
            <button
              key={item.label}
              type="button"
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${i === index ? "bg-[var(--anda-surface-2)]" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => onAction(item.action)}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {i === index && <CornerDownLeft className="h-3.5 w-3.5 text-[var(--anda-text-dim)]" />}
            </button>
          ))}
          {items.length === 0 && <p className="p-3 text-sm text-[var(--anda-text-dim)]">{t("no_data")}</p>}
        </div>
      </div>
    </div>
  );
}
