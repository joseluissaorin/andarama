---
title: Planes, prueba gratuita, cuentas con Clerk y uso razonable
description: Cómo funciona la instancia alojada de andarama.com, qué compra cada plan, qué da la prueba de catorce días, qué es la insignia y cómo se mide de dónde vienen las altas.
---

Andarama es de código abierto bajo EUPL-1.2. **El plan gratuito es montárselo en casa**: quien despliega la aplicación en su servidor o en su cuenta de Cloudflare no tiene cuotas de plan, no paga nada y usa exactamente el mismo programa, con todas las capacidades. Esta página explica la otra opción: dejar que la instancia de referencia, [andarama.com](https://andarama.com), lo cuide por ti.

## Los planes de andarama.com

| Plan | Precio | Recorridos | Medios | Qué añade |
|---|---|---|---|---|
| **Andar** | 2 $ al mes | 1 | 5 GB | Lo básico para un recorrido |
| **Aula** | 42 $ al año por docente | hasta 5 | 10 GB | Más recorridos y espacio para un curso |
| **Paseo** | 20 $ al mes o 200 $ al año | hasta 10 | 50 GB | Más recorridos y más espacio |
| **Excursión** | 500 $ al año | hasta 500 | 100 GB | Sin insignia, dominio propio |
| **Formación** | 99 $ al mes o 990 $ al año | hasta 100 | 200 GB | SCORM, LTI 1.3, sin insignia, dominio propio |
| **De por vida** | 1000 $, una sola vez | hasta 1000 | 200 GB | Sin insignia, dominio propio |

El quiz con nota, el certificado, la búsqueda del tesoro y lo necesario para montar un escape room (compuertas, variables y condiciones) están en **todos** los planes, igual que el **trabajo en equipo** (invitar a personas con su rol y compartir un recorrido con el botón Personas) y la exportación ZIP, HTML único y PWA.

Los slugs que el servidor entiende (y que hay que usar tal cual en Clerk) son `andar`, `aula`, `paseo`, `excursion`, `formacion` y `vitalicio`. El precio mensual y el anual de un mismo plan comparten slug: para el servidor son el mismo plan.

Todos los planes son de **proyectos limitados** y están sujetos a una **política de uso razonable**: los límites están pensados para una persona o un equipo pequeño. Si el uso deja de parecerse a eso (revendedores, automatizaciones que crean y borran recorridos en bucle, bibliotecas de medios que no son de nadie), hablamos antes de cortar nada.

La pasarela cobra en dólares estadounidenses porque Clerk Billing todavía no admite otras monedas; el banco aplica el cambio. Los impuestos dependen del país de quien compra.

## La prueba gratuita de catorce días

Quien crea una cuenta en andarama.com sin elegir plan tiene **catorce días de prueba sin tarjeta**: un recorrido y 500 MB de medios, con la insignia «Hecho con Andarama» y sin las capacidades de los planes altos. Es suficiente para subir un panorama, enlazar unas escenas, publicar y compartir el enlace.

- La prueba empieza al crearse la cuenta local (la primera vez que el Studio habla con la API con un token de Clerk) y queda en la columna `trial_ends_at` del usuario. Quien llega ya con un plan no la necesita y no la tiene; el administrador de la instancia tampoco.
- Mientras dura, la página **Plan** del Studio dice «Prueba gratuita: quedan N días» y ofrece elegir plan. La API la devuelve como plan efectivo `prueba` en `GET /api/v1/billing/me`, junto con `trialEndsAt` y `trialDaysLeft`.
- **Al caducar, lo publicado sigue en línea y exportar sigue libre.** El recorrido publicado se sigue sirviendo con la insignia, y exportarlo (ZIP, `.andarama`) no pide nada: es la promesa. Lo demás pide plan: editar el contenido (escenas, puntos, ajustes, título, traducciones), publicar o republicar, restaurar una versión publicada y subir medios responden `403` con `code: "plan_required"` y `trialEnded: true`. Ordenar en carpetas y etiquetas, mirar, comentar y despublicar siguen libres.
- En el Studio, una franja encima de todo cuenta los días que quedan; al caducar, el tablero explica qué sigue funcionando y el editor abre en solo lectura con un aviso. `GET /projects/:id` y `GET /orgs/:id/usage` devuelven `planLocked`.
- Un cupón canjeado durante la prueba concede su plan sin más: la prueba no cuenta como plan previo.
- El administrador puede alargarla o retirarla desde `PATCH /api/v1/admin/users/:id` con `trialEndsAt` (epoch en milisegundos, o `null`).

## Capacidades por plan

Además de la cuota, cada plan enciende unas capacidades. En el self-host todas están permitidas; en la instancia alojada mandan estas:

| Capacidad | Qué es | Planes |
|---|---|---|
| `classroom` | Etiqueta del plan Aula reservada para un futuro código de clase. No activa ni limita nada: el quiz, la búsqueda del tesoro y el escape room están en todos los planes | Aula (sin efecto) |
| `scorm` | Exportar el recorrido como paquete SCORM 1.2 o 2004 | Formación |
| `lti` | Lanzarlo desde Moodle u otro LMS por LTI 1.3, con Deep Linking y la nota de vuelta al libro de calificaciones | Formación |
| `whiteLabel` | Sin la insignia «Hecho con Andarama» | Excursión, Formación, De por vida |
| `customDomain` | Servir el recorrido bajo un dominio propio (CNAME) | Excursión, Formación, De por vida |
| `team` | Etiqueta heredada. No limita nada: el trabajo en equipo está en todos los planes y nada la comprueba | Formación (sin efecto) |
| `invoice` | Factura con datos fiscales | Formación |

Dónde se aplican hoy:

- **Dominio propio**: al publicar con `customDomain`, la API exige la capacidad (`403` con `code: "capability"` y `capability: "customDomain"`). Un dominio ya puesto no se rompe al republicar solo el contenido.
- **LTI**: el launch de Resource Link comprueba el plan de quien responde del recorrido; sin la capacidad, Moodle recibe un `403`.
- **SCORM**: el paquete se arma en el navegador con lo que devuelve `POST /projects/:id/export`, así que el control está en el Studio: sin la capacidad, el selector de SCORM del diálogo de exportación aparece desactivado con su explicación. Si algún día hiciera falta cerrarlo en el servidor, el sitio es ese mismo endpoint (bastaría un parámetro `scorm` y `requireOrgCapability`).
- **LTI**, además, se comprueba al dar de alta la plataforma y al abrir el selector de Deep Linking. Los pasos están en [Insertar en Moodle](/docs/usuario/moodle/#5-lti-13).
- **`classroom` y `team`**: están definidas, pero nada las consulta y la página **Plan** del Studio ya no las enseña, porque lo que nombran (aula y equipo) está en todos los planes. No hay código de clase; las invitaciones y el botón Personas funcionan en todos los planes.
- **`invoice`**: la página Plan la enseña, pero la factura con datos fiscales no es automática: se pide por correo.

La lista de capacidades del usuario viene en `GET /api/v1/me` (`billing.capabilities`) y en `GET /api/v1/billing/me`. En el self-host el valor es `null`: todo permitido.

## La insignia «Hecho con Andarama»

Los recorridos publicados por cuentas sin `whiteLabel` (Andar, Aula, Paseo y la prueba) llevan un enlace pequeño «Hecho con Andarama» sobre los controles de la esquina inferior derecha del visor. Es un enlace accesible con su etiqueta, sigue el tema del recorrido, no tapa el panorama y se ve también en pantalla completa. Lleva a `https://andarama.com/?utm_source=insignia&utm_medium=tour&utm_campaign=hecho-con`, así que se sabe cuántas visitas trae.

El autor puede cambiar el texto (no el enlace) en **Ajustes del tour › Componentes de interfaz › Texto de la insignia**, que se guarda como `ui.badgeText` y se recorta a 80 caracteres.

Se decide **al publicar**, no al servir: el puntero `current.json` de la publicación lleva `badge: true`, porque el servido de `/t/{slug}` no toca la base de datos. Cambiar de plan y republicar la quita. Los paquetes exportados no la llevan, y el self-host no la pone nunca. La explicación para usuarios está en [La insignia «Hecho con Andarama»](/docs/usuario/insignia/).

## Cómo se aplica la cuota

- La cuota de una organización la fija **el plan de quien responde de ella** (la persona que la creó). Los colaboradores invitados no necesitan plan propio para editar.
- La cuota es **de la persona, no de cada organización**: los recorridos y el almacenamiento se suman en todas las organizaciones de las que responde. Abrir organizaciones nuevas no multiplica lo que compró; el uso que muestra el Studio en cualquiera de ellas es el total.
- Al cambiar de plan, el token de sesión trae el plan nuevo y la cuota se actualiza en la siguiente petición. La página **Plan** del Studio fuerza ese refresco al volver de la pasarela.
- Sin plan de pago (y sin prueba vigente) no se puede crear ningún recorrido; lo demás (mirar, editar lo compartido, exportar) sigue funcionando.
- El administrador de la instancia no se cobra a sí mismo: su cuota es la que fija en la organización, como en el self-host, y tiene todas las capacidades.
- Un plan se puede **conceder a mano** desde el panel de administración (`PATCH /api/v1/admin/users/:id` con `planOverride`): sirve para cortesías, transferencias bancarias o el plan vitalicio si alguien lo paga por otra vía. Lo concedido a mano manda sobre lo que diga Clerk.

## Cupones

Un **cupón** es un código de un solo uso que concede un plan sin pasar por la pasarela: al canjearlo se escribe en la cuenta el mismo `plan_override` que concede el administrador a mano, así que manda sobre lo que diga Clerk y no caduca con la suscripción. Sirve para licencias vitalicias de un lanzamiento, cortesías, patrocinios o quien paga por transferencia.

Se generan en **Administración → Cupones**: se elige cuántos, qué plan, un lote para agruparlos y una nota. Los códigos aparecen enteros al generarlos, con botones para copiarlos y descargarlos en CSV, y siempre se pueden volver a consultar en la tabla, que además dice quién ha canjeado cada uno.

Quien recibe un código lo canjea en **Plan → ¿Tienes un cupón?**. Detalles que conviene conocer:

- El código tiene la forma `ANDA-XXXX-XXXX`, sin letras ni cifras que se confundan al dictado (ni `O`, ni `0`, ni `1`, ni `I`). Se acepta tecleado en minúsculas, con espacios o sin el prefijo.
- **Un cupón, un solo uso.** El reparto es atómico: si dos personas canjean el mismo código a la vez, solo una se lo lleva.
- Un cupón **nunca rebaja** a quien ya tiene un plan de pago igual o mejor; en ese caso se da por gastado y se conserva el plan que ya tenía. La prueba gratuita no cuenta como plan previo.
- Los cupones se pueden retirar mientras nadie los haya canjeado.
- Cada canje queda en la auditoría de la instancia.

Por API: `POST /api/v1/admin/coupons` genera una tanda, `GET /api/v1/admin/coupons` la lista y `POST /api/v1/billing/coupon` canjea. Solo tienen sentido en la instancia alojada: en el self-host y en el ejecutable de escritorio no hay cuotas de plan que conceder.

## Atribución de las altas (Google Ads, Microsoft Ads)

Para saber qué anuncio trae cada alta sin meter píxeles de terceros en el Studio:

1. Al cargar, el Studio lee de la URL (y del referente, si la landing enlaza conservando la query) `gclid`, `msclkid`, `utm_source`, `utm_medium`, `utm_campaign` y `utm_term`, y los guarda en `localStorage` noventa días. **El primer toque gana**: una visita posterior con otros parámetros no lo pisa.
2. La primera vez que existe la cuenta local (`GET /api/v1/me` devuelve `billing.attributionPending: true`), el Studio los manda a `POST /api/v1/me/attribution`. El servidor los valida (solo esas claves, más la ruta de entrada, el host del referente y la hora del primer toque; cualquier otra cosa se rechaza) y los escribe **una sola vez** en `users.attribution_json` y `attributed_at`. Nunca llevan datos personales.
3. El administrador descarga `GET /api/v1/admin/attribution/export` (CSV): usuario, correo, plan, plan concedido, fecha de alta, fecha del primer pago (`first_paid_at`, que fecha el webhook de Clerk Billing; si no la hay, `plan_updated_at` cuando hay plan), `Google Click ID`, `Microsoft Click Id`, las `utm_*` y las fechas del toque y de la atribución. Con `?only=attributed` salen solo quienes llegaron con algún identificador; con `?since=<epoch ms>` se acota por fecha de alta. Las columnas llevan los nombres que esperan las plantillas de subida de conversiones de Google Ads y Microsoft Ads, para copiar y pegar hasta que exista la subida automática.

Solo funciona en modo Clerk: en el self-host el endpoint responde `ok: false` y no guarda nada.

## Medición del Studio con Plausible

La instancia alojada mide el Studio con [Plausible](https://plausible.io) (sin cookies ni datos personales). El `index.html` del Studio es un asset estático de Vite, así que el worker de Cloudflare inyecta el script al servirlo, **solo cuando la instancia está en modo Clerk**; la CSP de las páginas que sirve la API admite `https://plausible.io` en `script-src` y `connect-src` con la misma condición. El self-host no habla con nadie.

Eventos, todos sin propiedades personales:

| Evento | Cuándo |
|---|---|
| `registro` | La primera vez que existe la cuenta local (una vez por usuario, apuntado en `localStorage`) |
| `prueba_inicio` | Junto a `registro`, si la cuenta arranca en prueba |
| `pago` (prop `plan`) | Cuando el plan de Clerk pasa de nada a algo entre dos cargas |

## Qué hace Clerk y qué no

Con Clerk delante, la instancia cierra sus cuentas propias: registro, contraseña, verificación en dos pasos, passkeys y correos de acceso los lleva Clerk; el SSO OIDC propio y el TOTP dejan de ofrecerse. Los datos (usuarios, organizaciones, recorridos, medios) siguen viviendo en la base de datos de Andarama: Clerk solo aporta la llave y el cobro. La primera vez que alguien entra con Clerk se le crea su cuenta local y su organización; si ya existía una cuenta con ese correo, se enlaza.

Los tokens personales de API (`andarama_...`) siguen funcionando igual en los dos modos.

El token de Clerk viaja en la cabecera `Authorization` de cada petición del Studio. Lo que el navegador carga por URL (miniaturas, tiles de la vista previa, descargas, los iframes de los códigos de inserción) no puede llevar cabeceras, así que el Studio acuña al arrancar una **cookie de lectura** a cambio del token (`POST /api/v1/auth/clerk/session`): dura doce horas, solo vale para peticiones `GET` y se borra al cerrar sesión. Las mutaciones exigen siempre el token.

## Activarlo en una instancia propia

No hace falta para el self-host, pero cualquiera puede repetir el montaje:

1. Crea una aplicación en [Clerk](https://dashboard.clerk.com) y activa **Billing para usuarios** (`clerk enable billing --for users` con la CLI de Clerk). Conecta una cuenta de Stripe.
2. Define los planes con los slugs `andar`, `aula`, `paseo`, `excursion`, `formacion` y `vitalicio` (este último como pago único, `is_recurring: false`). Los slugs son lo que el servidor lee del claim `pla` del token; los precios y los textos son libres. Los pasos exactos, con precios mensuales y anuales, están en `docs/seo/CLERK-CHECKLIST.md` del repositorio.
3. Define las variables de entorno:

| Variable | Descripción |
|---|---|
| `CLERK_PUBLISHABLE_KEY` | Clave publicable; el Studio la recibe de `/api/v1/config` |
| `CLERK_SECRET_KEY` | Clave secreta; verifica los tokens y consulta el perfil al dar de alta |
| `CLERK_JWT_KEY` | Opcional. Clave pública PEM para verificar sin red |
| `CLERK_AUTHORIZED_PARTIES` | Opcional. Orígenes admitidos separados por comas; por defecto, la URL pública y su subdominio `app.` |
| `SAMPLE_PROJECT_ID` | Opcional. Id del proyecto que se clona como tour de ejemplo a cada cuenta nueva |
| `TEMPLATE_PROJECTS` | Opcional. Plantillas por sector de «Nuevo proyecto»: `sector:id` separados por comas (sectores con nombre: `escape_room`, `quiz`, `tesoro`, `prl`, `museo`, `campus`, `inmobiliaria`) |
| `CLERK_WEBHOOK_SECRET` | Opcional. Secreto de firma (`whsec_...`) del webhook de Clerk: supresión de cuentas y fecha del primer pago. Véase [Webhook de Clerk](/docs/despliegue/cloudflare/#webhook-de-clerk) |
| `ADMIN_EMAILS` | Recomendada. Administradores de la instancia, separados por comas. Con Clerk y sin esta lista nadie administra la instancia |

4. Aplica las migraciones de `0007_clerk_billing` a `0014_activation` (el arranque en Node y `pnpm deploy:cloudflare` lo hacen solos).
5. Da de alta el webhook de Clerk (`user.deleted` y los eventos de Billing) como se explica en [Webhook de Clerk](/docs/despliegue/cloudflare/#webhook-de-clerk).

Con las dos primeras variables definidas la instancia pasa a modo Clerk; sin ellas, sigue con sus cuentas propias.

## Tour de ejemplo y plantillas por sector

El primer minuto de una cuenta nueva no debería ser una pantalla vacía. El operador guarda en una organización propia («Plantillas») unos cuantos recorridos terminados y los señala con dos variables:

- `SAMPLE_PROJECT_ID`: al dar de alta a alguien (con Clerk), se le clona ese recorrido en su organización. Queda marcado como ejemplo (`is_sample`), lleva la insignia «Ejemplo» en el tablero, se abre solo la primera vez y **no cuenta en la cuota**.
- `TEMPLATE_PROJECTS`: la lista de plantillas que «Nuevo proyecto» ofrece por sector, por ejemplo `escape_room:abc,quiz:pqr,tesoro:stu,prl:def,museo:ghi,campus:jkl,inmobiliaria:mno`. Los sectores `escape_room`, `quiz` y `tesoro` salen juntos bajo el grupo **Educación**. Un id sin sector también vale; se muestra con su título. Un proyecto hecho desde una plantilla sí cuenta en la cuota.

En los dos casos **los medios no se copian**: las escenas clonadas siguen apuntando a los panoramas de la organización Plantillas, así que cualquier cuenta puede leerlos (nunca modificarlos ni borrarlos). Por eso no conviene borrar medios de esa organización mientras haya clones que los usen. Si una variable falta o el proyecto ya no existe, no pasa nada: ni ejemplo ni sección de plantillas.

## Primeros pasos

El tablero y el editor enseñan una lista de cuatro pasos: subir una foto 360, añadir un punto, publicar y compartir. Los tres primeros se deducen de lo que la persona ya ha hecho (el tour de ejemplo no cuenta); compartir se apunta al copiar el enlace o el código de inserción. El progreso y el cierre de la lista se guardan en la cuenta (`GET` y `POST /api/v1/me/onboarding`). La primera publicación propia manda a Plausible el evento `primer_publicado`.

## Moderación de la galería

Una ficha de la galería pública (`/explorar/`) solo se lista, y solo entra en `sitemap-tours.xml`, cuando la aprueba un administrador de la instancia. Al publicar con ficha nueva, o al cambiar sus textos, la ficha queda pendiente y, si la instancia tiene correo configurado, se avisa a los administradores. La pestaña **Galería** del panel de administración enseña las pendientes, las aprobadas y las rechazadas, con su texto, su portada y quién la envió (`GET /api/v1/admin/gallery?status=pending|approved|rejected`, `POST /api/v1/admin/gallery/:projectId/approve|reject`). Rechazar una ficha no despublica el recorrido. Republicar el contenido sin tocar la ficha conserva la revisión, y lo que publica un administrador entra aprobado. Las fichas que ya estaban en la galería antes de la moderación se dieron por aprobadas en la migración `0014_activation`.
