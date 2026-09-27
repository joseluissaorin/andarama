# Instalar Andarama en pruebaandarama.jls.name

Pasos mínimos para tener vuestra propia instancia de Andarama con HTTPS. La guía completa, con copias de seguridad, actualización y funciones opcionales, está en la documentación: «Despliegue → Instalación en un servidor propio» (en vuestra instancia, `/docs/despliegue/servidor-propio/`).

## Qué necesitáis

- Un servidor Linux con Docker y el complemento Compose (`docker compose version` debe responder), con al menos 2 GB de RAM o swap para construir la imagen.
- Un registro DNS **A** de `pruebaandarama.jls.name` apuntando a la IP del servidor.
- Los puertos 80 y 443 abiertos.

## Pasos

1. Descargar el código:

   ```bash
   sudo git clone https://github.com/joseluissaorin/andarama.git /opt/andarama
   sudo chown -R "$USER" /opt/andarama
   cd /opt/andarama/deploy/docker
   ```

2. Crear la configuración:

   ```bash
   cp .env.example .env
   openssl rand -hex 32        # copiad el resultado
   nano .env
   ```

   Y dejad estas líneas así (con vuestros correos):

   ```ini
   PUBLIC_URL=https://pruebaandarama.jls.name
   APP_SECRET=el-resultado-de-openssl
   ADMIN_EMAILS=vuestro-correo@ejemplo.es
   DOMINIO=pruebaandarama.jls.name
   ANDARAMA_BIND=127.0.0.1
   ```

3. Construir y arrancar (la primera vez tarda unos minutos):

   ```bash
   docker compose --profile https up -d --build
   ```

4. Comprobar que responde:

   ```bash
   curl https://pruebaandarama.jls.name/api/v1/health
   ```

   Debe devolver `{"ok":true,"platform":"node"}`.

5. Crear la cuenta de administración en `https://pruebaandarama.jls.name/studio/register` con uno de los correos de `ADMIN_EMAILS`. Hacedlo antes de difundir la dirección: si la versión instalada todavía no aplica `ADMIN_EMAILS`, el primer usuario que se registra es el administrador. Después, en **Administración → Ajustes de instancia → Política de registro**, elegid «solo por invitación» o limitadlo al dominio de vuestro centro.

6. Programar la copia de seguridad diaria (`sudo crontab -e`):

   ```cron
   30 3 * * * /opt/andarama/deploy/docker/backup.sh /srv/copias-andarama >> /var/log/andarama-backup.log 2>&1
   ```

## Actualizar

```bash
cd /opt/andarama && git pull
cd deploy/docker && sudo ./backup.sh /srv/copias-andarama
docker compose --profile https up -d --build
```

## Si algo falla

- `docker compose logs andarama` y `docker compose logs caddy` suelen decir qué pasa.
- Si el certificado no sale, casi siempre es que el DNS aún no apunta al servidor o que el puerto 80 está cerrado.
- El correo (invitaciones, recuperar contraseña), el antispam de formularios (Turnstile) y el inicio de sesión institucional necesitan configuración extra en el `.env`; sin ella, todo lo demás funciona. LTI con Moodle se configura desde el panel de Administración.

Cualquier duda, escribidme.
