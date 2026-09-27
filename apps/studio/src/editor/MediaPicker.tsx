import { Dialog } from "@andarama/ui";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { MediaLibrary, type MediaItem } from "../pages/MediaPage";

/** Selector de medios reutilizable (biblioteca + subida integrada). */
export function MediaPicker({ open, onClose, onSelect, kind, projectId }: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
  kind?: string;
  /** Recorrido abierto: el selector empieza por sus medios. */
  projectId?: string;
}): React.ReactNode {
  const t = useT();
  const orgId = useAuth((s) => s.currentOrgId);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t("select_media")} wide>
      {orgId != null && (
        <MediaLibrary
          orgId={orgId}
          kindFilter={kind}
          tourId={projectId}
          onSelect={(item) => {
            onSelect(item);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
