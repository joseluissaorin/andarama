import { Dialog } from "@ull360/ui";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { MediaLibrary, type MediaItem } from "../pages/MediaPage";

/** Selector de medios reutilizable (biblioteca + subida integrada). */
export function MediaPicker({ open, onClose, onSelect, kind }: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
  kind?: string;
}): React.ReactNode {
  const t = useT();
  const orgId = useAuth((s) => s.currentOrgId);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t("select_media")} wide>
      {orgId != null && (
        <MediaLibrary
          orgId={orgId}
          kindFilter={kind}
          onSelect={(item) => {
            onSelect(item);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
