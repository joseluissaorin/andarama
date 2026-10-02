-- «Informar de un problema» desde el Studio: lo que cuentan las personas que
-- prueban la beta, con el contexto que el Studio adjunta solo (dirección,
-- proyecto, escena, navegador, ventana y versión del Studio) para que cada
-- informe diga qué versión se probó. La captura, si la hay, vive en el
-- almacenamiento bajo `feedback/<id>.<ext>`. `notified_at` queda vacío si la
-- instancia no tiene correo saliente: entonces se ve en el panel.
CREATE TABLE feedback_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  context_json TEXT,
  image_key TEXT,
  image_mime TEXT,
  notified_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX feedback_reports_created_idx ON feedback_reports(created_at);
