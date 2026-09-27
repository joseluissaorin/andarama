---
title: Instalación en un servidor propio
description: Guía paso a paso para instalar Andarama en un servidor Linux con Docker, un dominio propio y HTTPS.
---

Esta guía instala Andarama en un servidor Linux propio, con su dominio y HTTPS, de principio a fin. El ejemplo usa el dominio `pruebaandarama.jls.name`: sustitúyelo por el tuyo en cada paso.

Al terminar tendrás, en la misma dirección:

| Ruta | Qué es |
|---|---|
| `/studio/` | El Studio, el editor de recorridos (la portada `/` lleva aquí) |
| `/t/<slug>` | Cada recorrido publicado, listo para compartir o incrustar |
| `/explorar/` | La galería pública de recorridos |
| `/docs/` | Esta documentación |
| `/api/v1/health` | Comprobación de estado para la monitorización |

En una instalación propia están activas todas las funciones, sin planes ni límites comerciales: sin insignia en el visor, con exportación SCORM y con LTI.

## 1. Qué hace falta

- **Un servidor Linux** con acceso por SSH y permisos de administrador (Debian, Ubuntu u otra distribución con Docker). Para el servicio basta con 1 vCPU y 1 GB de RAM; para **construir la imagen en el propio servidor** (paso 3, mientras no esté publicada) conviene tener 2 GB o activar swap, porque la compilación consume bastante más memoria que el servicio.
- **Docker Engine con el complemento Compose** (`docker compose version` debe responder). Si no está instalado, sigue la [guía oficial de Docker](https://docs.docker.com/engine/install/). La guía da por hecho que tu usuario está en el grupo `docker`; si no, antepón `sudo` a las órdenes `docker`.
- **Un nombre de dominio** que puedas apuntar al servidor.
- **Los puertos 80 y 443 abiertos** hacia Internet: el 80 lo usa Let's Encrypt para emitir el certificado y el 443 sirve la instancia.
- Espacio en disco para las panorámicas: cuenta con unos 10 a 30 MB por escena, entre original y teselas.

## 2. DNS

En el panel de tu proveedor de DNS, crea un registro **A** con el nombre `pruebaandarama` en la zona `jls.name` apuntando a la IP pública del servidor (y un registro **AAAA** si el servidor tiene IPv6). Si el dominio pasa por Cloudflare, deja el registro en «solo DNS» (nube gris) al menos hasta que Caddy haya obtenido el certificado.

Comprueba que ya resuelve antes de seguir:

```bash
dig +short pruebaandarama.jls.name
```

Si el servidor tiene cortafuegos, abre los puertos. Con `ufw`, por ejemplo:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

## 3. Descargar Andarama

:::note[Mientras la imagen no esté publicada]
La imagen oficial se publicará en `ghcr.io/joseluissaorin/andarama`. Hasta entonces, la vía que funciona es **clonar el repositorio y construir la imagen en el servidor**, que es la que sigue esta guía. El `docker-compose.yml` ya sabe hacerlo: si no puede descargar la imagen, la construye con el código clonado.
:::

```bash
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/joseluissaorin/andarama.git
sudo chown -R "$USER" /opt/andarama
cd /opt/andarama/deploy/docker
```

Todos los comandos que siguen se ejecutan en esa carpeta, `deploy/docker`, que contiene el `docker-compose.yml`, el `Caddyfile`, el script de copias y la plantilla de configuración.

## 4. Configuración (`.env`)

Copia la plantilla y edítala:

```bash
cp .env.example .env
nano .env
```

Las líneas imprescindibles para este ejemplo:

```ini
PUBLIC_URL=https://pruebaandarama.jls.name
APP_SECRET=pega-aquí-el-resultado-de-openssl
ADMIN_EMAILS=profesora@ejemplo.es,profesor@ejemplo.es
DOMINIO=pruebaandarama.jls.name
ANDARAMA_BIND=127.0.0.1
```

- **`PUBLIC_URL`**: la dirección con la que se entra, con `https://` y sin barra final. Andarama la usa para los enlaces de los correos, los tours compartidos, el SSO y LTI; si no coincide con la real, esos enlaces apuntarán a otro sitio.
- **`APP_SECRET`**: genera uno con `openssl rand -hex 32` y pégalo. Firma las sesiones y los enlaces de los medios; no lo cambies después ni lo compartas.
- **`ADMIN_EMAILS`** (recomendada): los correos que serán administradores de la instancia, separados por comas. Consulta el [paso 6](#6-primer-administrador).
- **`DOMINIO`**: el dominio que servirá Caddy con HTTPS; el mismo que en `PUBLIC_URL`.
- **`ANDARAMA_BIND=127.0.0.1`**: con Caddy delante, el puerto interno 8788 solo escucha en la propia máquina y no queda expuesto a Internet.

El resto de variables son opcionales y están explicadas en el propio `.env.example` y en [Funciones que necesitan configuración](#9-funciones-que-necesitan-configuración).

## 5. Arrancar con HTTPS

```bash
docker compose --profile https up -d --build
```

El perfil `https` enciende, junto a Andarama, un contenedor de [Caddy](https://caddyserver.com/) que hace de proxy inverso: pide el certificado de Let's Encrypt para `DOMINIO`, lo renueva solo y redirige HTTP a HTTPS. Su configuración está en `deploy/docker/Caddyfile` (admite subidas de hasta 512 MB, el mismo límite que el servidor).

La primera vez tarda unos minutos, porque construye la imagen. Comprueba que todo responde:

```bash
docker compose ps
docker compose logs -f andarama     # Ctrl+C para salir
curl https://pruebaandarama.jls.name/api/v1/health
```

La última orden debe devolver `{"ok":true,"platform":"node"}`. Si el certificado falla, casi siempre es el DNS (aún no apunta al servidor) o el puerto 80 cerrado: `docker compose logs caddy` lo dice.

:::tip[Si ya tienes un proxy inverso]
Si el servidor ya tiene nginx, Apache o Traefik con sus certificados, no uses el perfil `https`: arranca solo Andarama con `docker compose up -d --build` y apunta tu proxy a `http://127.0.0.1:8788`. Necesita pasar las cabeceras `Host` y `X-Forwarded-*`, permitir el paso a WebSocket (el modo «en vivo» usa `/rt/`) y aceptar cuerpos de hasta 512 MB (en nginx: `client_max_body_size 512m;`).
:::

## 6. Primer administrador

Abre `https://pruebaandarama.jls.name/studio/register` y crea la cuenta.

- **Con `ADMIN_EMAILS`** (recomendado): solo las direcciones de la lista reciben el papel de administrador de la instancia al registrarse, aunque otra persona se registre antes. Así no hay carrera entre publicar la URL y registrarse.
- **Sin `ADMIN_EMAILS`**: el **primer usuario que se registra es el administrador**. Regístrate tú antes de difundir la dirección.

Después, en el Studio, **Administración → Ajustes de instancia → Política de registro**, elige si cualquiera puede registrarse, solo con invitación o solo con correos de ciertos dominios (por ejemplo, el de tu centro). Para una instancia de pruebas, «solo por invitación» es lo más prudente.

Para comprobar que la instalación funciona de punta a punta: sube una panorámica equirectangular en **Medios** (hay ejemplos en `examples/panoramas/` del repositorio), crea un tour con ella, publícalo y abre el enlace `/t/…` en otro navegador.

## 7. Copias de seguridad

Todo lo que importa vive en el volumen de Docker montado en `/data`: la base de datos SQLite (`andarama.db`) y los medios (`storage/`: originales, teselas y tours publicados). El script `backup.sh` hace una copia consistente sin parar el servicio:

```bash
sudo mkdir -p /srv/copias-andarama
sudo ./backup.sh /srv/copias-andarama
```

Cada ejecución deja `anda-FECHA.db` y `storage-FECHA/` en el destino. Prográmala a diario con `sudo crontab -e`:

```text
30 3 * * * /opt/andarama/deploy/docker/backup.sh /srv/copias-andarama >> /var/log/andarama-backup.log 2>&1
```

Las copias de los medios son completas, no incrementales: borra las antiguas de vez en cuando (por ejemplo, con `find /srv/copias-andarama -maxdepth 1 -mtime +14 -exec rm -rf {} +`) y lleva alguna fuera del servidor. Además, en cada actualización con migraciones Andarama guarda una copia previa de la base de datos en `/data/anda-backup-FECHA.db`.

**Restaurar una copia** (sustituye `FECHA` por la de la copia):

```bash
docker compose stop andarama
docker run --rm --volumes-from "$(docker compose ps -aq andarama)" \
  -v /srv/copias-andarama:/copia alpine sh -c '
    rm -f /data/andarama.db-wal /data/andarama.db-shm &&
    cp /copia/anda-FECHA.db /data/andarama.db &&
    rm -rf /data/storage && cp -a /copia/storage-FECHA /data/storage'
docker compose start andarama
```

## 8. Actualizar

Desde el código (la vía de esta guía):

```bash
cd /opt/andarama
git pull
cd deploy/docker
sudo ./backup.sh /srv/copias-andarama
docker compose --profile https up -d --build
```

Cuando la imagen esté publicada en GHCR, basta con:

```bash
docker compose --profile https pull
docker compose --profile https up -d
```

Por defecto se usa la etiqueta `latest`, que corresponde a la última versión publicada. Para fijar una versión concreta, pon en el `.env` `ANDARAMA_IMAGE=ghcr.io/joseluissaorin/andarama:0.2.0` (o `:main` para seguir la rama principal).

Las migraciones de la base de datos se aplican solas al arrancar, con copia previa. Para volver atrás, restaura la copia del paso 7 con la versión anterior.

## 9. Funciones que necesitan configuración

Todo lo esencial (editar, subir, publicar, galería, SCORM, exportación) funciona sin nada más. Estas funciones necesitan algo extra:

| Función | Qué hace falta |
|---|---|
| **Correo** (verificar cuentas, invitaciones, recuperar contraseña) | Un servidor SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` y `SMTP_SECURE=1` si es TLS directo (puerto 465). Sin SMTP, las cuentas se crean ya verificadas y los correos solo se escriben en `docker compose logs andarama`; las invitaciones y la recuperación de contraseña no llegan a nadie. |
| **Antispam en formularios** de los tours publicados | Un widget de [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) (gratuito) para tu dominio: `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET`. Sin él, los formularios funcionan igual, solo con limitación por IP. |
| **LTI 1.3** (Moodle, Aula Virtual) | Nada en el `.env`, pero sí HTTPS y un `PUBLIC_URL` correcto. La plataforma la registra el administrador de la organización en **Ajustes de la organización → LTI: Moodle y otros LMS** (o el operador, desde **Administración → LTI**), y Moodle usa las URL `https://pruebaandarama.jls.name/api/v1/lti/login`, `/api/v1/lti/launch` y `/api/v1/lti/jwks`. Pasos exactos en [Insertar en Moodle](/docs/usuario/moodle/#5-lti-13). |
| **Inicio de sesión institucional** (SSO OIDC: Google Workspace, Microsoft Entra, Keycloak…) | Una aplicación OIDC en tu proveedor con la URL de retorno `https://pruebaandarama.jls.name/api/v1/auth/oidc/callback`, y `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` y, si quieres limitarlo, `OIDC_ALLOWED_DOMAINS`. |
| **Almacenamiento externo** | Por defecto los medios van al disco del servidor. Para S3 o MinIO: `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`. |
| **Dominio propio para un tour** | Consulta [Dominio propio para un tour](/docs/despliegue/dominios/): el dominio del tour debe apuntar también a este servidor y figurar en el `Caddyfile`. |

Tras cambiar el `.env`, aplica los cambios con `docker compose --profile https up -d`.

## Problemas frecuentes

- **El Studio se queda en «Cargando»**: abre `https://tu-dominio/api/v1/config`. Debe decir `"auth":"local"`; si dice `"clerk"`, hay variables `CLERK_…` con valor en el `.env` (bórralas: la instalación propia no usa Clerk).
- **Los enlaces de los correos o de los tours compartidos apuntan a `localhost`**: falta `PUBLIC_URL` o no coincide con el dominio. Corrígela y reinicia.
- **Una subida grande falla**: si usas tu propio proxy, revisa su límite de tamaño de cuerpo (512 MB como mínimo).
- **Quiero la portada de andarama.com en `/`**: pon `SHOW_LANDING=1` en el `.env`. Por defecto `/` lleva al Studio, porque esa portada enlaza con la instancia alojada.
