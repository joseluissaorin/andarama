---
title: "Cómo meter un recorrido 360 en Moodle (LTI y SCORM)"
description: "Tres maneras de poner un tour 360 en Moodle: incrustado en una página, como paquete SCORM con nota, o por LTI 1.3, en pruebas bajo petición."
lang: es
slug: recorrido-360-moodle
cluster: docencia
fecha: 2026-10-04
autor: jose-luis-saorin
faq:
  - q: "¿Cuál es la diferencia entre SCORM y LTI para un recorrido 360?"
    a: "SCORM es un paquete que se sube a Moodle y vive allí: si cambias el tour, hay que volver a subirlo. LTI es una conexión: Moodle abre el tour que está en Andarama, siempre actualizado. En Andarama, LTI 1.3 está en pruebas y disponible bajo petición."
  - q: "¿Puedo poner un tour en Moodle sin nota, solo para verlo?"
    a: "Sí: el código de inserción del tour se pega en una página o una etiqueta de Moodle y aparece embebido, con pantalla completa y realidad virtual. No hay calificación, pero no hace falta configurar nada."
  - q: "¿La nota del quiz llega al libro de calificaciones?"
    a: "Con SCORM, sí: el paquete envía la puntuación y el estado de finalización a la actividad SCORM, y de ahí al libro de calificaciones. La integración por LTI 1.3 está en pruebas y no garantiza todavía la devolución de la nota."
  - q: "¿Qué plan de Andarama hace falta?"
    a: "En andarama.com, SCORM está en el plan Formación, y LTI 1.3, en pruebas, se activa bajo petición. En una instalación propia del centro o de la universidad no hay planes: todo está disponible, con LTI 1.3 todavía en pruebas."
---

Hay tres maneras de meter un **recorrido 360 en Moodle**, y la elección depende de si necesitas nota o no: incrustar el tour en una página (sin nota, cero configuración), subirlo como **paquete SCORM** (con nota y finalización, pero congelado en el momento de exportar) o conectarlo por **LTI 1.3** (el docente elige el tour desde Moodle y siempre está actualizado; en pruebas y disponible bajo petición). Esta guía explica las tres con Andarama, cómo se configuran y cuándo conviene cada una. Lo mismo vale, con pequeñas diferencias, para Canvas, Blackboard y Sakai.

## Las tres opciones, de un vistazo

| | Incrustar | SCORM | LTI 1.3 |
|---|---|---|---|
| Nota en Moodle | No | Sí (informe SCORM) | En pruebas |
| Se actualiza solo | Sí | No (hay que volver a subir) | Sí |
| Configuración | Ninguna | Ninguna | Una vez, por la administración |
| Quién lo hace | Cualquier docente | Cualquier docente | Docente, tras el alta de la herramienta |
| Realidad virtual | Sí | Sí, servido por HTTPS | Sí |
| Plan en andarama.com | Cualquiera | Formación | Bajo petición |

## Opción 1: incrustar el tour en una página

Es la más rápida y suficiente para una salida virtual sin evaluación. Al publicar un tour, Andarama da un código de inserción; se pega en una **Página**, una **Etiqueta** o cualquier editor HTML de Moodle:

```html
<iframe
  src="https://andarama.com/t/mi-tour"
  style="width:100%;aspect-ratio:16/9;border:0"
  allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking"
  allowfullscreen
  title="Mi tour"></iframe>
```

El atributo `allow` es el que permite la pantalla completa, el giroscopio en el móvil y la realidad virtual dentro del marco. Si Moodle limpia el HTML y quita el iframe, hay que pedir a la administración que permita esa etiqueta para el rol docente, o usar el web component que también genera Andarama (dos líneas: un `<script>` y `<anda-tour slug="mi-tour">`). Los detalles están en [embeber un tour](https://docs.andarama.com/usuario/embeber/).

Si el tour se publica como **no listado**, solo lo verá quien tenga el enlace; y si se publica **restringido a dominios**, solo se podrá embeber desde el Moodle del centro.

## Opción 2: SCORM

Para cualquier campus, con o sin LTI, y para quien quiere el paquete en su mano. Desde el editor de Andarama, **Exportar** ofrece SCORM 1.2 y SCORM 2004 (3.ª edición). El paquete lleva dentro el visor, el `tour.json`, las teselas y los medios, y reporta al campus:

- `completion_status` al visitar todas las escenas (o al completar el quiz).
- `score.raw`, `score.min` y `score.max`, y `success_status` según la puntuación mínima configurada en el tour.

En Moodle:

1. Añade una actividad **Paquete SCORM** al curso.
2. Sube el ZIP exportado.
3. En «Calificación», elige el método (por ejemplo, la puntuación más alta) y el intento que cuenta.
4. Guarda. El alumnado abre la actividad y el tour se muestra dentro del reproductor SCORM de Moodle; la nota del quiz aparece en el informe de la actividad y, con la configuración habitual, en el libro de calificaciones.

Dos cosas que hay que saber. La primera: el paquete es una **foto fija** del tour. Si corriges una pregunta, hay que exportar y subir de nuevo. La segunda: la realidad virtual dentro del paquete exige que Moodle sirva por HTTPS (lo normal hoy); si no, el botón de gafas cae al modo cartón. Todo está descrito en [publicar y exportar](https://docs.andarama.com/usuario/publicar/).

## Opción 3: LTI 1.3 (en pruebas)

La integración por **LTI 1.3** está en pruebas y disponible bajo petición: todavía no la damos por lista para producción. La idea es que el docente, desde Moodle, pulse «añadir herramienta externa» y elija el tour en un selector (Deep Linking), sin copiar direcciones. La devolución de la nota al libro de calificaciones no está garantizada todavía; si necesitas la nota en Moodle hoy, usa el paquete SCORM.

El tour no se copia a ningún sitio: Moodle lo abre desde Andarama, así que cualquier cambio se ve al momento.

### Configuración (una sola vez, la administración)

En Moodle, Administración del sitio, Plugins, Herramientas externas, «configurar una herramienta manualmente»:

- URL de la herramienta e **Initiate login URL**: `https://tu-instancia/api/v1/lti/login`
- **Redirection URI**: `https://tu-instancia/api/v1/lti/launch`
- **JWKS URL**: `https://tu-instancia/api/v1/lti/jwks`
- Servicios: activar Deep Linking.

En Andarama, la administración de la instancia registra la plataforma (panel Administración, pestaña LTI) con el Issuer de Moodle, el Client ID, la Auth URL (`/mod/lti/auth.php`), la Token URL (`/mod/lti/token.php`) y el JWKS (`/mod/lti/certs.php`). En una instalación propia lo hace la persona que administra Andarama; en andarama.com, escríbenos desde la [página de universidades](/universidades/) con los datos del campus y lo dejamos registrado.

La guía con los pasos exactos está en [docencia: LTI 1.3](https://docs.andarama.com/usuario/docencia/).

### Uso (cada docente)

1. En el curso, «Añadir una actividad», **Herramienta externa**, elegir Andarama.
2. Pulsar «Seleccionar contenido» y escoger el tour en el selector (Deep Linking). También se puede fijar a mano con el parámetro `custom.tour = slug`.
3. Guardar. La actividad aparece en el curso y abre el tour desde Andarama.

## Cuál elegir

- **Salida virtual, museo, visita al centro, sin nota**: incrustar. Cinco minutos.
- **Formación o asignatura con nota en Moodle o en cualquier LMS**: SCORM. Informa de la finalización y la puntuación.
- **Universidad o centro con Moodle propio que quiere probar la conexión en vivo**: LTI 1.3, en pruebas y disponible bajo petición.

En muchos centros conviven varias: el mismo tour incrustado en la página de bienvenida y como SCORM en la asignatura o en el curso de acogida de la empresa colaboradora.

## Qué se necesita en Andarama

- En **andarama.com**, la exportación SCORM está en el [plan Formación](/formacion/) (99 $ al mes o 990 $ al año, con 100 recorridos, marca blanca, dominio propio, equipo y factura en euros bajo pedido para instituciones), y LTI 1.3, en pruebas, se activa bajo petición. Incrustar un tour publicado funciona con cualquier plan.
- En una **instalación propia** (Docker, la cuenta de Cloudflare del centro o el ejecutable de escritorio) no hay planes: SCORM está disponible sin más, y LTI 1.3, en pruebas. Es la opción natural para una universidad con equipo técnico, y el programa es de código abierto; la [página de universidades](/universidades/) resume lo que eso implica (RGPD, SSO por OIDC, factura en euros bajo pedido o instancia propia).

## Errores frecuentes

- **El iframe desaparece al guardar la página.** El filtro HTML de Moodle lo ha quitado. Solución: permisos del rol o web component.
- **El SCORM se abre pero no manda la nota.** Comprueba que el tour tiene al menos un quiz y una puntuación mínima configurada; sin ella no hay `success_status` que reportar.
- **LTI: «invalid issuer» o error al lanzar.** Las URL de Moodle (issuer, auth, token, certs) no coinciden con las registradas en Andarama; suele ser una barra final de más o un `http` donde debería ser `https`.
- **En las gafas no entra en RV desde Moodle.** El iframe no tiene `allow="xr-spatial-tracking"`, o el campus se sirve por `http`.
