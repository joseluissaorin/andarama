-- Solicitudes de demo desde la web pública (formación, universidades,
-- museos), en lugar del mailto: que no se podía medir.
--
-- Cada fila guarda lo que escribió la persona y la atribución de su sesión
-- en la web: utm_*, ruta de aterrizaje y, solo si aceptó el aviso de
-- anuncios (`ad_consent`), el identificador de clic (gclid, gbraid o wbraid).
-- Con eso se sube la conversión «Solicitud de demo» a Google Ads desde
-- /api/v1/admin/conversions.csv. `notified_at` queda vacío si la instancia
-- no tiene correo saliente: entonces el aviso está en el log y en el panel.
CREATE TABLE demo_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  lang TEXT,
  source TEXT,
  page TEXT,
  attribution_json TEXT,
  ad_consent INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,
  notified_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX demo_requests_created_idx ON demo_requests(created_at);
