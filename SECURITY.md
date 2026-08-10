# Política de seguridad

## Divulgación responsable

Si encuentras una vulnerabilidad en Andarama, por favor no abras un issue público. Escribe a:

- **seguridad@andarama.dev** (canal preferente)
- o utiliza los avisos de seguridad privados de GitHub ("Report a vulnerability") en el repositorio.

Nos comprometemos a:

- Acusar recibo en un plazo máximo de 72 horas.
- Publicar una corrección o mitigación en un plazo objetivo de 30 días para vulnerabilidades críticas.
- Acreditar el descubrimiento (si lo deseas) en las notas de la versión corregida.

## Ámbito

Están en ámbito: la API (`apps/api`), el Studio (`apps/studio`), el visor (`packages/viewer`, `packages/viewer-ui`), los paquetes exportados, los adaptadores y las configuraciones de despliegue de referencia.

Quedan fuera de ámbito: vulnerabilidades en dependencias ya publicadas por sus autores (actualizamos mediante CI), ataques de denegación de servicio volumétricos, e ingeniería social.

## Prácticas del proyecto

- Hashing de contraseñas con Argon2id (self-host) o PBKDF2-SHA256 vía WebCrypto (Workers, por límites de CPU de la plataforma; documentado en la guía de administración).
- Sesiones con cookies HttpOnly + Secure + SameSite=Lax; CSRF de doble token en operaciones de mutación.
- CSP estricta con nonces, HSTS, X-Content-Type-Options, Referrer-Policy y frame-ancestors por tour.
- Autorización comprobada en servidor en cada operación; IDs no adivinables.
- Saneado de HTML generado (lista blanca), saneado de SVG subidos, validación de tipo real por magic bytes.
- Auditoría de dependencias en CI (npm audit + OSV) y registro de auditoría de acciones sensibles.
