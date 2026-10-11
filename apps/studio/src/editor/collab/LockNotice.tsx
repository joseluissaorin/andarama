import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@andarama/ui";
import { useT } from "../../i18n";
import { initials, useLockedByOther, type PresenceLock } from "./store";

/**
 * Bloqueo blando de un panel: si otra persona lo abrió antes, sus campos
 * quedan en solo lectura aquí para no pisarse lo que cada uno escribe. Es un
 * aviso, no un cerrojo: «Editar igualmente» lo salta (y la fusión de la API
 * sigue protegiendo lo de los dos).
 */
export function useSoftLock(kind: "scene" | "hotspot", id: string | null | undefined): {
  lock: PresenceLock | null;
  /** El panel se puede tocar (nadie lo tiene, o se decidió editar igualmente). */
  free: boolean;
  override: () => void;
} {
  const lock = useLockedByOther(kind, id);
  const [overridden, setOverridden] = useState<string | null>(null);
  // La decisión vale para ese elemento y ese bloqueo; si se libera, se olvida
  useEffect(() => {
    if (lock == null) setOverridden(null);
  }, [lock]);
  const key = id != null ? `${kind}:${id}` : null;
  return { lock, free: lock == null || overridden === key, override: () => setOverridden(key) };
}

export function LockNotice({ lock, overridden, onOverride }: { lock: PresenceLock; overridden: boolean; onOverride: () => void }): React.ReactNode {
  const t = useT();
  const name = lock.name !== "" ? lock.name : t("collab_someone");
  return (
    <div
      role="status"
      data-testid="collab-lock"
      className="flex items-start gap-2.5 border-b border-[var(--anda-border)] px-4 py-2.5 text-[12.5px] leading-snug"
      style={{ background: `color-mix(in srgb, ${lock.color} 12%, transparent)` }}
    >
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: lock.color }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 font-semibold">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("collab_editing_by", { name })}
        </p>
        {!overridden && <p className="mt-0.5 text-[var(--anda-text-dim)]">{t("collab_editing_by_hint")}</p>}
      </div>
      {!overridden && (
        <Button size="sm" variant="outline" onClick={onOverride}>
          {t("collab_edit_anyway")}
        </Button>
      )}
    </div>
  );
}
