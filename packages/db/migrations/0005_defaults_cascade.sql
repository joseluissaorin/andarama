-- Valores por defecto en cascada: instancia → organización → usuario → tour.
-- Antes los ajustes de un tour nuevo se escribían a mano en el código y ni la
-- columna de la organización ni los ajustes de instancia se llegaban a leer.
ALTER TABLE users ADD COLUMN prefs_json TEXT NOT NULL DEFAULT '{}';
