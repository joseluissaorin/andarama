-- Alta, prueba y activación de la instancia alojada.
--
-- Tour de ejemplo: al dar de alta a alguien se le clona un recorrido de la
-- organización «Plantillas» del operador. Va marcado para no contar en la
-- cuota y para que el Studio lo enseñe como ejemplo; sus medios siguen
-- siendo los de la plantilla (no se copian).
ALTER TABLE projects ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;

-- Moderación de la galería (/explorar/): una ficha solo se lista cuando la
-- aprueba un administrador de la instancia. Pendiente = sin aprobar y sin
-- revisar; rechazada = sin aprobar y revisada.
ALTER TABLE publications ADD COLUMN gallery_approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publications ADD COLUMN gallery_reviewed_at INTEGER;

-- Las fichas que ya estaban en la galería antes de la moderación se dan por
-- aprobadas: no deben desaparecer de /explorar/ ni del sitemap.
UPDATE publications
   SET gallery_approved = 1,
       gallery_reviewed_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE in_gallery = 1;
