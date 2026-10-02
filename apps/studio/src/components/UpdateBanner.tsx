import { RefreshCw } from "lucide-react";
import { Button } from "@andarama/ui";
import { usePwa } from "../pwa";
import { useT } from "../i18n";

/**
 * Aviso de versión nueva, visible en todas las pantallas (también en el
 * editor y en el móvil, donde la barra lateral es un cajón cerrado).
 */
export function UpdateBanner(): React.ReactNode {
  const t = useT();
  const { updateReady, applyUpdate } = usePwa();
  if (!updateReady) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--anda-primary)] bg-[var(--anda-surface)] py-2 pl-4 pr-2 text-[13px] font-medium shadow-[var(--anda-shadow-lg)]"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-[var(--anda-primary-ink)]" aria-hidden="true" />
      <span>{t("update_ready")}</span>
      <Button size="sm" onClick={applyUpdate}>
        {t("update_reload")}
      </Button>
    </div>
  );
}
