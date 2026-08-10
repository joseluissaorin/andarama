-- El grafo pasa a derivarse íntegramente de los hotspots de navegación: una
-- arista es un hotspot y no había forma de recorrer una conexión suelta, cuyo
-- modo de entrada y transición no llegaba a leer nadie. Las escenas ya
-- conectadas conservan sus hotspots; lo que desaparece es la tabla paralela.
DROP INDEX IF EXISTS connections_from_idx;
DROP INDEX IF EXISTS connections_project_idx;
DROP TABLE IF EXISTS connections;
