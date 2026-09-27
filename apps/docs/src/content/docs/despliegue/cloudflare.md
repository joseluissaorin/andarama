---
title: Despliegue en Cloudflare
---

Objetivo: **de cero a instancia funcionando en menos de 10 minutos** con una cuenta gratuita de Cloudflare.

## Requisitos

- Node.js 20+ y pnpm 10+
- Cuenta de Cloudflare (el free tier basta para usos pequeños y medios)

## Un comando

```bash
git clone https://github.com/joseluissaorin/andarama && cd andarama
pnpm install
pnpm deploy:cloudflare
```

El script bootstrap (interactivo e idempotente):

1. Comprueba la autenticación de wrangler (abre `wrangler login` si hace falta).
2. Crea la base **D1** y aplica las migraciones.
3. Crea el bucket **R2** y el namespace **KV**.
4. Genera y guarda el secreto **APP_SECRET**; pregunta por los opcionales (email, Turnstile, SSO, Clerk).
5. Compila los paquetes, la documentación, el visor y el Studio, y **despliega el Worker** con los assets.

Todo queda descrito en [`deploy/cloudflare/wrangler.jsonc`](https://github.com/joseluissaorin/andarama/blob/main/deploy/cloudflare/wrangler.jsonc) (infraestructura como código); el script es [`deploy/cloudflare/bootstrap.mjs`](https://github.com/joseluissaorin/andarama/blob/main/deploy/cloudflare/bootstrap.mjs). Actualizar la instancia = volver a ejecutar `pnpm deploy:cloudflare`.

Tras el primer despliegue: pon tu correo en `ADMIN_EMAILS` (vars de `wrangler.jsonc`, separadas por comas), fija `PUBLIC_URL` y vuelve a desplegar; después abre la URL `*.workers.dev` mostrada y regístrate con ese correo: entrarás como administrador. Si dejas `ADMIN_EMAILS` vacía y no usas Clerk, el primer usuario registrado administra la instancia.

## Qué usa cada capacidad

| Capacidad | Servicio |
|---|---|
| HTTP + estáticos | Worker + Workers Assets |
| Base de datos | D1 (Time Travel 30 días) |
| Medios y tiles | R2 (+ caché CDN) |
| Sesiones/caché | KV |
| Tiempo real | Durable Objects (SQLite-backed, free tier) |
| Analítica | Workers Analytics Engine o tabla D1 (`ANALYTICS_BACKEND=d1`, por defecto) |
| Colas | Cloudflare Queues (opcional, plan Paid) o tabla `jobs` + runner |
| Anti-bots | Turnstile (opcional) |

## Opciones avanzadas

- **Dominio propio**: añade `routes` en `wrangler.jsonc` y actualiza `PUBLIC_URL`.
- **Subidas prefirmadas S3**: crea un token R2 (Panel R2, Manage API Tokens) y define los secretos `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` y `CF_ACCOUNT_ID`. Sin ellos, las subidas pasan por el Worker en streaming (funciona igualmente).
- **Analytics Engine con consultas**: define `ANALYTICS_BACKEND=ae` y los secretos `CF_ACCOUNT_ID` + `CF_ANALYTICS_TOKEN` (token con permiso Account Analytics Read).
- **Cloudflare Stream** para vídeo: `STREAM_ACCOUNT_ID` + `STREAM_API_TOKEN`.
- **Contenedor de procesado** (imágenes más allá de la capacidad del navegador): ejecuta el runner en cualquier máquina con acceso a la API usando la CLI `anda-tile`, o despliega la imagen Docker como Cloudflare Container asociado a la cola.
- **Email transaccional**: `EMAIL_WEBHOOK_URL`/`EMAIL_WEBHOOK_KEY` compatibles con la API de Resend.
- **Cuentas y planes con Clerk** (así funciona andarama.com): secretos `CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY`. Sin ellos la instancia usa sus cuentas propias, que es lo normal en un despliegue propio. Con Clerk, define también `ADMIN_EMAILS`: nadie se hace administrador por llegar primero. Detalles en [Planes, Clerk y uso razonable](/docs/admin/planes/).

## Webhook de Clerk

Con Clerk delante, la instancia necesita enterarse de dos cosas que el token de sesión no trae: que alguien ha **borrado su cuenta** (para borrar o anonimizar sus datos) y **cuándo pagó por primera vez** (para las conversiones y la atribución). Las recibe por un webhook firmado con Svix.

1. En el [panel de Clerk](https://dashboard.clerk.com), entra en la aplicación (instancia de producción) y abre **Configure → Webhooks**. Pulsa **Add Endpoint**.
2. **Endpoint URL**: `https://tu-instancia/api/v1/webhooks/clerk` (en andarama.com, `https://andarama.com/api/v1/webhooks/clerk`).
3. En **Subscribe to events** marca:
   - `user.deleted`;
   - de **Billing**: `subscription.created`, `subscription.updated`, `subscription.active`, todos los `subscriptionItem.*`, y `paymentAttempt.created` y `paymentAttempt.updated`.
4. Crea el endpoint y copia su **Signing Secret** (empieza por `whsec_`).
5. Guárdalo como secreto del Worker: `wrangler secret put CLERK_WEBHOOK_SECRET -c deploy/cloudflare/wrangler.jsonc` (el bootstrap lo pregunta si aún no existe). En Docker o Node es la variable `CLERK_WEBHOOK_SECRET`.
6. Desde la pestaña **Testing** del endpoint, envía un `user.deleted` de ejemplo: la respuesta debe ser `200` con `{"ok":true,...}`. Si es `401`, el secreto no coincide; si es `404`, la instancia no tiene `CLERK_WEBHOOK_SECRET`.

Qué hace cada evento:

| Evento | Efecto |
|---|---|
| `user.deleted` | Borra las organizaciones en las que la persona era el único miembro (proyectos, publicaciones y su copia servida, dominios propios, medios del almacenamiento, formularios, resultados y registros LTI), la retira de las compartidas (si respondía de alguna, pasa a responder el administrador más antiguo que quede), deja sus comentarios sin autor y borra su cuenta. Queda auditado como `user.deleted` |
| `subscription.*`, `subscriptionItem.*` | Copian el plan de pago activo en la cuenta y, la primera vez, fechan el primer pago en `users.first_paid_at` (las pruebas gratuitas de Clerk no cuentan como pago). Si solo queda activo el plan gratuito de Clerk, se retira el plan de pago |
| `paymentAttempt.*` con estado `paid` | Fecha el primer pago con `paid_at`, que es la fecha más fiable |

La firma se comprueba en cada mensaje (se admiten varias firmas durante la rotación del secreto) y se rechazan los que llegan con más de cinco minutos de desfase. Clerk reintenta lo que no recibe un `2xx`; cada mensaje se procesa una sola vez gracias a su `svix-id`.
