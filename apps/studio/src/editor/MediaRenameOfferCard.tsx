import { Button, useToast } from "@andarama/ui";
import { api } from "../api";
import { useT } from "../i18n";
import type { MediaRenameOffer } from "./mediaRename";

/** La pregunta, con sus dos botones. `onClose` se llama al elegir cualquiera. */
export function MediaRenameOfferCard({ offer, onClose, className = "" }: {
  offer: MediaRenameOffer;
  onClose: () => void;
  className?: string;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  return (
    <div className={`rounded-lg bg-[var(--anda-surface-2)] p-2 text-[12px] ${className}`} role="status">
      <p>{t("rename_media_offer", { from: offer.from, to: offer.to })}</p>
      <div className="mt-1.5 flex gap-1.5">
        <Button
          size="sm"
          onClick={() => {
            onClose();
            void api(`/media/${offer.mediaId}`, { method: "PATCH", body: { filename: offer.to } })
              .then(() => toast.push(t("rename_media_done", { name: offer.to }), "ok"))
              .catch((err: unknown) => toast.push(String(err instanceof Error ? err.message : err), "error"));
          }}
        >
          {t("rename_media_yes")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("rename_media_no")}
        </Button>
      </div>
    </div>
  );
}
