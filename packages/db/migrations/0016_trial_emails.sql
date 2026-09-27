-- Correos del ciclo de la prueba de 14 días (bienvenida, día 7, día 12 y
-- final). Una fila por usuario y paso enviado: el cron diario no repite
-- ninguno. El paso «baja» marca a quien ha pedido no recibir más.
CREATE TABLE trial_emails (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, step)
);
