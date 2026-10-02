import { createContext, useContext } from "react";
import { Dialog } from "@andarama/ui";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { MediaLibrary, type MediaItem } from "../pages/MediaPage";

/**
 * Recorrido abierto en el editor. Los selectores que no pasan `projectId`
 * lo toman de aquí: así lo que se sube desde cualquier panel del editor queda
 * en el tour y aparece en «Este tour».
 */
export const PickerTourContext = createContext<string | undefined>(undefined);

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
  const openTour = useContext(PickerTourContext);
  const tourId = projectId ?? openTour;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t("select_media")} wide>
      {orgId != null && (
        <MediaLibrary
          orgId={orgId}
          kindFilter={kind}
          tourId={tourId}
          onSelect={(item) => {
            onSelect(item);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
