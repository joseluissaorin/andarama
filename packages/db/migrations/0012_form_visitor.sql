-- Formularios de un solo envío.
--
-- El formulario de un tour se podía mandar tantas veces como se abriera el
-- hotspot. Ahora el visor manda un identificador anónimo del visitante
-- (guardado en su navegador) y, si el formulario es de un solo envío, el
-- servidor rechaza el segundo. No se usa la IP: en un aula toda la clase sale
-- por la misma y se quedaría sin poder enviar.
ALTER TABLE form_submissions ADD COLUMN visitor_id TEXT;
CREATE INDEX form_submissions_visitor_idx ON form_submissions(project_id, hotspot_id, visitor_id);
