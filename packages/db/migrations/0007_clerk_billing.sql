-- Cuentas de Clerk y planes de la instancia alojada.
--
-- Andarama sigue siendo gratis en casa: quien se lo instala no ve nada de
-- esto. En andarama.com la puerta la pone Clerk (registro, contraseñas,
-- pasarela de pago) y cada usuario lleva su plan, que es el que manda sobre
-- la cuota de las organizaciones que ha creado. La cuenta local se mantiene:
-- Clerk solo aporta la llave; los datos siguen viviendo aquí.
ALTER TABLE users ADD COLUMN clerk_id TEXT;
ALTER TABLE users ADD COLUMN plan TEXT;
ALTER TABLE users ADD COLUMN plan_override TEXT;
ALTER TABLE users ADD COLUMN plan_updated_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_idx ON users(clerk_id);
-- Quién responde de una organización: su plan fija la cuota en modo alojado.
ALTER TABLE orgs ADD COLUMN owner_id TEXT;
