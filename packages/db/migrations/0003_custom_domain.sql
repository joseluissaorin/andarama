-- Publicación bajo dominio propio (CNAME apuntando a la instancia).
ALTER TABLE publications ADD COLUMN custom_domain TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pub_custom_domain ON publications(custom_domain);
