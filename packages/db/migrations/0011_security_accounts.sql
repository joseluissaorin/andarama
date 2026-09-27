-- Seguridad y cuentas.
--
-- 1. Cada registro LTI pertenece a una organización: el selector de Deep
--    Linking solo ofrece los recorridos publicados de esa organización, y el
--    administrador de una organización cliente puede dar de alta su propia
--    plataforma. Los registros anteriores quedan sin organización (null) y
--    no ofrecen recorridos hasta que el operador los asigne.
-- 2. Fecha real del primer pago, que llega por el webhook de Clerk Billing.
ALTER TABLE lti_registrations ADD COLUMN org_id TEXT;
CREATE INDEX lti_org_idx ON lti_registrations(org_id);
ALTER TABLE users ADD COLUMN first_paid_at INTEGER;
