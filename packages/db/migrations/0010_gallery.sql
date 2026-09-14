-- Galería pública de recorridos (andarama.com/explorar/).
--
-- Los competidores posicionan por el nombre de los lugares gracias a las
-- páginas de los tours de sus usuarios. Aquí cada publicación puede pedir una
-- ficha propia en la galería con un título pensado para el buscador, una
-- descripción corta, el lugar (nombre y país ISO-2) y, si se saben, sus
-- coordenadas. El idioma es el de esos textos; la portada es la captura que
-- el Studio hace al publicar (`share.jpg`), si la hay.
ALTER TABLE publications ADD COLUMN in_gallery INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publications ADD COLUMN gallery_title TEXT;
ALTER TABLE publications ADD COLUMN gallery_description TEXT;
ALTER TABLE publications ADD COLUMN gallery_credits TEXT;
ALTER TABLE publications ADD COLUMN place_name TEXT;
ALTER TABLE publications ADD COLUMN place_country TEXT;
ALTER TABLE publications ADD COLUMN place_lat REAL;
ALTER TABLE publications ADD COLUMN place_lng REAL;
ALTER TABLE publications ADD COLUMN gallery_lang TEXT;
ALTER TABLE publications ADD COLUMN poster_key TEXT;
CREATE INDEX publications_gallery_idx ON publications(in_gallery, published_at);
