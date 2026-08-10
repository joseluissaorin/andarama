---
title: Dominio propio para un tour
description: Servir un tour publicado bajo tu propio dominio o subdominio con un CNAME.
---

Cada publicación puede servirse en la **raíz de un dominio propio** (por ejemplo `tour.midominio.es`), además de en `/t/slug`. El campo **Dominio propio** está en el diálogo de publicación del editor.

## Cómo funciona

La instancia resuelve la cabecera `Host` de cada petición: si el host no es el canónico y está registrado como dominio propio de una publicación, el tour se sirve en `/` de ese dominio (portada, `tour.json`, tiles y assets incluidos). El mapeo host → tour se guarda al publicar y se elimina al despublicar; un dominio solo puede pertenecer a una publicación.

## Configuración en Cloudflare

1. Publica el tour con el dominio (p. ej. `tour.midominio.es`) en **Dominio propio**.
2. En el panel de Cloudflare del Worker (`Workers & Pages → tu worker → Settings → Domains & Routes`), añade ese dominio como **Custom Domain**. Cloudflare crea el DNS y el certificado TLS automáticamente si la zona está en tu cuenta.
   - Si la zona DNS está en otro proveedor, crea primero un **CNAME** `tour.midominio.es → tu-worker.workers.dev` y usa una regla de ruta (`Route`) en su lugar.
3. Listo: `https://tour.midominio.es` sirve el tour.

## Configuración en self-host (Docker)

1. Crea el **CNAME** (o registro A) del subdominio hacia tu servidor.
2. Añade el dominio al proxy. Con el Caddyfile incluido basta con ampliarlo:

   ```caddyfile
   tour.midominio.es {
     reverse_proxy ull360:8788
   }
   ```

   Caddy emite el certificado TLS solo. Con nginx/Traefik, apunta el `server_name`/router al mismo servicio.
3. Publica el tour con ese **Dominio propio**. No hace falta reiniciar nada.

## Notas

- El resto de rutas de la instancia (`/studio`, `/api`, `/docs`) no se exponen en el dominio propio: solo el tour.
- La visibilidad (contraseña, organización, dominios de embebido, fechas) se aplica igual bajo el dominio propio.
- Para cambiar el dominio, vuelve a publicar con el valor nuevo; para quitarlo, publica con el campo vacío.
