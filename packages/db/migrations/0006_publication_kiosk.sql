-- Modo de apertura de la publicación.
--
-- El modo quiosco existía solo dentro del paquete exportado: quien quería una
-- pantalla en bucle en un vestíbulo tenía que descargarse un ZIP y servirlo por
-- su cuenta. Ahora la publicación recuerda cómo se abre su enlace, así que un
-- televisor puede apuntar a la URL de siempre y arrancar el recorrido solo.
ALTER TABLE publications ADD COLUMN kiosk INTEGER NOT NULL DEFAULT 0;
