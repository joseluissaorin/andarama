import { createContext, useContext } from "react";
import { Dialog } from "@andarama/ui";
import { useAuth, useLibraryAccess } from "../stores";
import { useT } from "../i18n";
import { MediaLibrary, type MediaItem } from "../pages/MediaPage";

/**
 * Recorrido abierto en el editor. Los selectores que no pasan `projectId`
 * lo toman de aquí: así lo que se sube desde cualquier panel del editor queda
 * en el tour y aparece en «Este tour». Lleva también su organización: la
 * biblioteca es la del recorrido, no la que la persona tenga elegida, que en
 * un recorrido compartido por otra organización es otra.
 */
export const PickerTourContext = createContext<{ id: string; orgId: string } | undefined>(undefined);

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
  const currentOrgId = useAuth((s) => s.currentOrgId);
  const openTour = useContext(PickerTourContext);
  const tourId = projectId ?? openTour?.id;
  const orgId = openTour?.orgId ?? currentOrgId;
  // Sin rol en la organización del recorrido, solo lo del recorrido
  const libraryAccess = useLibraryAccess(orgId ?? "");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t("select_media")} wide>
      {orgId != null && (
        <MediaLibrary
          orgId={orgId}
          kindFilter={kind}
          tourId={tourId}
          tourOnly={tourId != null && !libraryAccess}
          onSelect={(item) => {
            onSelect(item);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
