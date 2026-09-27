# LTI 1.3 con un Moodle real

Prueba de punta a punta de la integración LTI 1.3 de Andarama contra un
**Moodle 4.5 LTS** en Docker. No corre en CI: se lanza a mano antes de tocar
`apps/api/src/routes/lti.ts`, el envío del quiz del visor o las cabeceras de
seguridad, y antes de anunciar cambios de LTI.

Lo que comprueba, en este orden (`lti-moodle.spec.ts`):

1. **Andarama**: el operador abre la instancia; un centro se registra, sube un
   panorama real (`examples/panoramas/aula-magna.jpg`, troceado en el
   navegador) y publica un recorrido con dos preguntas.
2. **Moodle**: el administrador registra Andarama como herramienta externa
   LTI 1.3 (Deep Linking, servicio de calificaciones AGS, nombre y notas) y lee
   los datos de **View configuration details**.
3. **Andarama**: el administrador del centro da de alta la plataforma en
   **Ajustes de la organización › LTI: Moodle y otros LMS**.
4. **Moodle**: la profesora añade la actividad con **Select content** (Deep
   Linking) y el nombre llega relleno con el título del recorrido.
5. **Moodle**: el alumno abre la actividad (el recorrido va en el iframe de
   Moodle) y acierta las dos preguntas.
6. **Moodle**: la nota (100.00) está en su informe de usuario y en el del
   calificador. Deja una captura en `test-results/libro-de-calificaciones.png`.
7. **Andarama**: el resultado queda guardado con el nombre del alumno y marcado
   como lanzamiento LTI.

## Cómo se conecta todo

| Quién | Llega a Moodle en | Llega a Andarama en |
|---|---|---|
| Navegador (Playwright) | `http://localhost:8080` | `http://andarama.test:8795`, resuelto a 127.0.0.1 con `--host-resolver-rules` |
| Contenedor de Moodle | `http://localhost:8080` (él mismo) | `http://andarama.test:8795`, vía `host-gateway` |
| Andarama (Node en el anfitrión) | `http://localhost:8080` (puerto publicado) | no aplica |

Andarama y Moodle son **sitios distintos**, como en producción: el recorrido
se abre en un iframe de terceros. Van por http; Chromium los trata como
contexto seguro (`--unsafely-treat-insecure-origin-as-secure`) porque el Studio
necesita `crypto.subtle` para subir medios. Moodle, por su parte, bloquea por
defecto las peticiones a redes privadas y a puertos no estándar:
`moodle-setup.sh` vacía `curlsecurityblockedhosts` y `curlsecurityallowedport`
para que pueda leer el JWKS de Andarama y validar el Deep Linking y el token de
AGS.

## Pasos

Requisitos: Docker (en macOS vale colima), las dependencias del monorepo y el
Studio construido, porque Andarama sirve sus estáticos.

```sh
pnpm install
pnpm run build:packages
pnpm --filter @andarama/studio build

# Moodle 4.5 + Postgres; la primera vez tarda unos minutos en instalarse
docker compose -f tooling/lti-moodle/docker-compose.yml up -d
docker compose -f tooling/lti-moodle/docker-compose.yml logs -f moodle   # hasta «ready to handle connections»

# Curso ANDA360, profesora y alumno, y red abierta hacia Andarama (idempotente)
docker compose -f tooling/lti-moodle/docker-compose.yml exec moodle sh /usr/local/bin/moodle-setup.sh

# La prueba: arranca Andarama en el puerto 8795 con datos nuevos cada vez
pnpm test:lti-moodle
```

Se puede repetir sin reiniciar Moodle: cada pasada usa nombres nuevos (la
herramienta `Andarama <id>`, el recorrido y la actividad), así que el curso va
acumulando actividades. Para empezar de cero:

```sh
docker compose -f tooling/lti-moodle/docker-compose.yml down -v
```

Al terminar, si no vas a repetirla, borra también las imágenes:

```sh
docker compose -f tooling/lti-moodle/docker-compose.yml down -v --rmi all
```

## Cuentas

| Dónde | Usuario | Contraseña |
|---|---|---|
| Moodle, administración | `admin` | `Admin-lti-2026` |
| Moodle, profesora | `profesora` | `Moodle-lti-2026` |
| Moodle, alumno | `alumno` | `Moodle-lti-2026` |
| Andarama, centro | `centro-<id>@andarama.test` | `password-centro-123` |

Para mirar a mano, `ANDA_REUSE=1` hace que la prueba use un Andarama ya
arrancado en el 8795 en vez de levantar uno, y
`pnpm exec playwright test -c tooling/lti-moodle/playwright.config.ts --headed`
la enseña en pantalla. Con `--trace on`, `playwright show-trace` deja ver cada
paso dentro del iframe de Moodle.

## Lo que no cubre

- **HTTPS real**: en producción Moodle marca su cookie de sesión con
  `SameSite=None; Secure` y la cadena del iframe funciona igual; aquí va por
  http. Andarama no usa cookies en el iframe (estado y lanzamiento viajan en la
  URL y en su almacén), así que no depende del bloqueo de cookies de terceros.
- **La instancia alojada** (Cloudflare Workers): el código de las rutas es el
  mismo, pero el almacén de estado es Workers KV en vez de SQLite.
- **Otras plataformas** (Canvas, Blackboard, Sakai): LTI 1.3 es un estándar,
  pero solo Moodle está comprobado.
