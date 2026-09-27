-- Prueba gratuita y atribución publicitaria de la instancia alojada.
--
-- Quien entra con Clerk sin plan tiene catorce días de prueba sin tarjeta:
-- `trial_ends_at` marca cuándo acaba. Al caducar, la cuota vuelve a cero
-- pero lo creado se conserva. El self-host no la usa: allí no hay planes.
ALTER TABLE users ADD COLUMN trial_ends_at INTEGER;
-- De dónde vino quien se dio de alta (gclid, msclkid, utm_*), tal como lo
-- guardó el Studio en el primer toque. Sirve para subir conversiones a
-- Google Ads y Microsoft Ads a mano; nunca lleva datos personales.
ALTER TABLE users ADD COLUMN attribution_json TEXT;
ALTER TABLE users ADD COLUMN attributed_at INTEGER;
