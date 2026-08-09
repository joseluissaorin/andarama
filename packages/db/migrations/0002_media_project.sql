-- Biblioteca organizable por tour: los medios pueden asignarse a un proyecto.
ALTER TABLE media ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_media_project ON media(project_id);
