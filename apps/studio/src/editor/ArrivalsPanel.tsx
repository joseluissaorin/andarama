import { AlertTriangle, Crosshair, DoorOpen, Play } from "lucide-react";
import { Button, Tooltip } from "@andarama/ui";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import {
  ENTRY_MODES,
  arrivalNeedsReturn,
  arrivalsOf,
  resolveArrivalView,
  setArrivalMode,
  setArrivalView,
  type Arrival,
  type EntryMode,
} from "./arrivals";

/**
 * «Cómo se llega aquí».
 *
 * La orientación de entrada se decidía desde el marcador de la escena de
 * origen, que es justo donde no se puede juzgar el resultado: el botón de
 * «usar la vista actual» capturaba el ángulo del panorama equivocado. Aquí se
 * decide estando en el destino, mirando lo que verá el visitante.
 */

export function ArrivalsPanel({ sceneId, canEdit, onPreview, getCurrentView }: {
  sceneId: string;
  canEdit: boolean;
  /** Gira el panorama del editor hasta esa llegada. */
  onPreview: (view: { yaw: number; pitch: number; fov?: number }) => void;
  /** Vista que se está mirando ahora mismo en el panorama. */
  getCurrentView: () => { yaw: number; pitch: number; fov: number };
}): React.ReactNode {
  const t = useT();
  const editor = useEditor();
  const snapshot = editor.snapshot!;
  const arrivals = arrivalsOf(snapshot, sceneId);

  if (arrivals.length === 0) {
    return (
      <p className="rounded-xl bg-[var(--anda-surface-2)] px-3 py-2 text-xs text-[var(--anda-text-dim)]">{t("arrivals_none")}</p>
    );
  }

  const label = (a: Arrival): string =>
    a.kind === "start" ? (a.isStart === true ? t("arrival_start") : t("arrival_default")) : t("arrival_from", { name: a.fromTitle });

  return (
    <ul className="space-y-1.5">
      {arrivals.map((a) => {
        const view = resolveArrivalView(snapshot, sceneId, a);
        const falta = arrivalNeedsReturn(snapshot, sceneId, a);
        return (
          <li key={a.id} className="anda-ficha p-2">
            <div className="flex items-center gap-2">
              {/* La brújula dice de un vistazo hacia dónde se entra */}
              <Compass yaw={view.yaw} muted={a.mode === "relative"} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {a.kind === "start" ? null : <DoorOpen className="mr-1 inline h-3.5 w-3.5 text-[var(--anda-text-dim)]" />}
                {label(a)}
              </span>
              <Tooltip content={t("arrival_preview")}>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("arrival_preview")} onClick={() => onPreview(view)}>
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {(a.kind === "start" ? (["fixed"] as EntryMode[]) : ENTRY_MODES).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!canEdit || a.kind === "start"}
                  aria-pressed={a.mode === m}
                  onClick={() => editor.apply((draft) => setArrivalMode(draft, sceneId, a, m))}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                    a.mode === m
                      ? "bg-[var(--anda-primary-soft)] text-[var(--anda-primary)]"
                      : "text-[var(--anda-text-dim)] hover:bg-[var(--anda-surface-2)]"
                  } disabled:opacity-60`}
                >
                  {t(`entry_${m}` as never)}
                </button>
              ))}
              <div className="flex-1" />
              {(a.mode === "fixed" || a.kind === "start") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={!canEdit}
                  onClick={() => editor.apply((draft) => setArrivalView(draft, sceneId, a, getCurrentView()))}
                >
                  <Crosshair className="h-3.5 w-3.5" /> {t("use_current_view")}
                </Button>
              )}
            </div>

            {falta && (
              <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                {t("arrival_needs_return")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Aguja pequeña: el mismo lenguaje que el radar del plano y la brújula. */
function Compass({ yaw, muted }: { yaw: number; muted: boolean }): React.ReactNode {
  const grados = (yaw * 180) / Math.PI;
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--anda-border)]"
      aria-hidden="true"
      style={{ opacity: muted ? 0.4 : 1 }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: `rotate(${grados}deg)` }}>
        <path d="M7 1 L10 12 L7 9.4 L4 12 Z" fill="var(--anda-primary)" />
      </svg>
    </span>
  );
}
