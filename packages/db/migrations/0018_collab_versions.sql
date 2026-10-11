-- Edición en grupo: cada escena, cada punto y los ajustes de cada recorrido
-- llevan una versión que sube en cada cambio. El Studio manda la versión que
-- conoce al guardar; si alguien guardó antes, la API contesta 409 y el Studio
-- fusiona lo del otro con lo que se está escribiendo, sin perder nada, y
-- vuelve a guardar. Las filas existentes empiezan en 0.
ALTER TABLE scenes ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hotspots ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN settings_version INTEGER NOT NULL DEFAULT 0;
