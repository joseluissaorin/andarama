# Politica de seguridad

## Divulgacion responsable

Si encuentras una vulnerabilidad en ULL360, por favor no abras un issue publico. Escribe a:

- **seguridad@ull360.dev** (canal preferente)
- o utiliza los avisos de seguridad privados de GitHub ("Report a vulnerability") en el repositorio.

Nos comprometemos a:

- Acusar recibo en un plazo maximo de 72 horas.
- Publicar una correccion o mitigacion en un plazo objetivo de 30 dias para vulnerabilidades criticas.
- Acreditar el descubrimiento (si lo deseas) en las notas de la version corregida.

## Ambito

Estan en ambito: la API (`apps/api`), el Studio (`apps/studio`), el visor (`packages/viewer`, `packages/viewer-ui`), los paquetes exportados, los adaptadores y las configuraciones de despliegue de referencia.

Quedan fuera de ambito: vulnerabilidades en dependencias ya publicadas por sus autores (actualizamos mediante CI), ataques de denegacion de servicio volumetricos, e ingenieria social.

## Practicas del proyecto

- Hashing de contrasenas con Argon2id (self-host) o PBKDF2-SHA256 via WebCrypto (Workers, por limites de CPU de la plataforma; documentado en la guia de administracion).
- Sesiones con cookies HttpOnly + Secure + SameSite=Lax; CSRF de doble token en operaciones de mutacion.
- CSP estricta con nonces, HSTS, X-Content-Type-Options, Referrer-Policy y frame-ancestors por tour.
- Autorizacion comprobada en servidor en cada operacion; IDs no adivinables.
- Saneado de HTML generado (lista blanca), saneado de SVG subidos, validacion de tipo real por magic bytes.
- Auditoria de dependencias en CI (npm audit + OSV) y registro de auditoria de acciones sensibles.
