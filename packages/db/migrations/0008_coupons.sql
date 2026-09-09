-- Cupones canjeables de la instancia alojada.
--
-- Clerk Billing cobra los planes, pero sus códigos promocionales son
-- descuentos sobre una suscripción y solo se crean a mano en su panel: no
-- sirven para repartir cien vitalicios, que además son un pago único. Un
-- cupón de Andarama es un código de un solo uso que escribe `plan_override`
-- en la cuenta de quien lo canjea, así que no pasa por la pasarela y sigue
-- mandando sobre lo que diga Clerk.
CREATE TABLE coupons (
  code TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  /* Tanda en la que se generó: agrupa los cien de un lanzamiento. */
  batch TEXT,
  note TEXT,
  expires_at INTEGER,
  redeemed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX coupons_batch_idx ON coupons(batch);
CREATE INDEX coupons_redeemed_idx ON coupons(redeemed_by);
