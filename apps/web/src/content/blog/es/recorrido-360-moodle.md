---
title: "Cómo meter un recorrido 360 en Moodle (SCORM, iframe y LTI)"
description: "Cómo poner un tour 360 en Moodle: incrustado en una página, sin nota, o como paquete SCORM con nota. O por LTI 1.3, con la nota directa al libro de calificaciones."
lang: es
slug: recorrido-360-moodle
cluster: docencia
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "¿Cuál es la diferencia entre SCORM y LTI para un recorrido 360?"
    a: "SCORM es un paquete que se sube a Moodle y vive allí: si cambias el tour, hay que volver a subirlo. LTI es una conexión: Moodle abre el tour que está en Andarama, siempre actualizado. Los dos llevan la nota del quiz al libro de calificaciones."
  - q: "¿Puedo poner un tour en Moodle sin nota, solo para verlo?"
    a: "Sí: el código de inserción del tour se pega en una página o una etiqueta de Moodle y aparece embebido, con pantalla completa y realidad virtual. No hay calificación, pero no hace falta configurar nada."
  - q: "¿La nota del quiz llega al libro de calificaciones?"
    a: "Con SCORM, sí: el paquete envía la puntuación y el estado de finalización a la actividad SCORM y, con la configuración habitual, al libro de calificaciones. Con LTI 1.3, también: la nota se escribe sola en el libro de calificaciones de Moodle en cuanto el alumno termina el quiz."
  - q: "¿Qué plan de Andarama hace falta?"
    a: "En andarama.com, el paquete SCORM y la integración LTI 1.3 están en el plan Formación. En una instalación propia del centro o de la universidad no hay planes: todo está disponible. Incrustar un tour funciona con cualquier plan."
---

Hay tres maneras de meter un **recorrido 360 en Moodle**: incrustar el tour en una página con un iframe o un web component (sin nota, cero configuración), subirlo como **paquete SCORM** (con nota y finalización, pero congelado en el momento de exportar) o conectarlo por **LTI 1.3** (con nota y siempre actualizado, tras dar de alta la herramienta una sola vez). Esta guía explica las tres con Andarama, cómo se configuran y cuándo conviene cada una. Incrustar y SCORM valen, con pequeñas diferencias, para Canvas, Blackboard y Sakai; LTI 1.3 es un estándar que esas plataformas también admiten, pero los pasos de esta guía son los de Moodle, que es donde lo hemos comprobado.

## Las tres opciones, de un vistazo

| | Incrustar | SCORM | LTI 1.3 |
|---|---|---|---|
| Nota en Moodle | No | Sí (actividad SCORM) | Sí (libro de calificaciones) |
| Se actualiza solo | Sí | No (hay que volver a subir) | Sí |
| Configuración | Ninguna | Ninguna | Una vez, en Moodle y en Andarama |
| Quién lo hace | Cualquier docente | Cualquier docente | Docente, tras el alta de la herramienta |
| Realidad virtual | Sí | Sí, servido por HTTPS | Sí |
| Plan en andarama.com | Cualquiera | Formación | Formación |

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

Es el camino para tener nota en cualquier campus sin configurar nada, y para quien quiere el paquete en su mano. Desde el editor de Andarama, **Exportar** ofrece SCORM 1.2 y SCORM 2004 (3.ª edición). El paquete lleva dentro el visor, el `tour.json`, las teselas y los medios, y reporta al campus:

- `completion_status` al visitar todas las escenas (o al completar el quiz).
- `score.raw`, `score.min` y `score.max`, y `success_status` según la puntuación mínima configurada en el tour.

En Moodle:

1. Añade una actividad **Paquete SCORM** al curso.
2. Sube el ZIP exportado.
3. En «Calificación», elige el método (por ejemplo, la puntuación más alta) y el intento que cuenta.
4. Guarda. El alumnado abre la actividad y el tour se muestra dentro del reproductor SCORM de Moodle; la nota del quiz aparece en el informe de la actividad y, con la configuración habitual, en el libro de calificaciones.

Dos cosas que hay que saber. La primera: el paquete es una **foto fija** del tour. Si corriges una pregunta, hay que exportar y subir de nuevo. La segunda: la realidad virtual dentro del paquete exige que Moodle sirva por HTTPS (lo normal hoy); si no, el botón de gafas cae al modo cartón. Una tercera: el paquete SCORM no se puede combinar con la exportación «HTML único». Todo está descrito en [publicar y exportar](https://docs.andarama.com/usuario/publicar/).

## Opción 3: LTI 1.3

Es la integración más cómoda cuando el campus la tiene dada de alta. Andarama funciona como **herramienta LTI 1.3 Advantage** con dos servicios:

- **Deep Linking**: el docente, desde Moodle, pulsa «Seleccionar contenido» y elige el tour en un selector, sin copiar direcciones.
- **Assignment and Grade Services (AGS)**: la puntuación del quiz llega sola al libro de calificaciones de Moodle.

El tour no se copia a ningún sitio: Moodle lo abre desde Andarama, así que al volver a publicarlo el curso ve la versión nueva al momento, sin subir nada. El alumnado lo abre dentro de Moodle y no necesita cuenta en Andarama. Lo hemos probado de punta a punta con Moodle 4.5 LTS.

### En Moodle (una sola vez, la administración del sitio)

En **Administración del sitio › Plugins › Módulos de actividad › Herramienta externa › Gestionar herramientas**, «configurar una herramienta manualmente», con versión **LTI 1.3**:

- **Initiate login URL**: `https://tu-instancia/api/v1/lti/login`
- **Tool URL**, **Redirection URI(s)** y **Content Selection URL**: `https://tu-instancia/api/v1/lti/launch`
- **Public key type**: «Keyset URL», con `https://tu-instancia/api/v1/lti/jwks`
- Marcar **Supports Deep Linking (Content-Item Message)**.
- En Servicios, **IMS LTI Assignment and Grade Services**: «Use this service for grade sync and column management».
- En Privacidad, **Accept grades from the tool**: «Always».

Al guardar, Moodle muestra en los detalles de la herramienta el **Platform ID**, el **Client ID**, el **Deployment ID** y sus tres direcciones (autenticación, token y claves públicas).

### En Andarama (una sola vez, la administración de la organización)

En Studio, **Ajustes de la organización › LTI: Moodle y otros LMS**, se registra la plataforma con esos datos: Platform ID, Client ID, Deployment ID y las tres URL de Moodle (`/mod/lti/auth.php`, `/mod/lti/token.php` y `/mod/lti/certs.php`). Lo hace quien administra la organización, sin depender de la administración de la instancia; en una instalación propia también puede hacerlo quien la opera.

### Cada docente

1. En el curso, «Añadir una actividad o un recurso», **Herramienta externa**, elegir Andarama.
2. Pulsar **Seleccionar contenido** y escoger un tour publicado en el selector. El nombre de la actividad se rellena con el título del tour.
3. Guardar. El alumnado abre la actividad dentro de Moodle, responde al quiz y la nota aparece en el libro de calificaciones.

La guía con cada campo está en [Moodle: LTI 1.3](https://docs.andarama.com/usuario/moodle/#5-lti-13).

## Cuál elegir

- **Salida virtual, museo, visita al centro, sin nota**: incrustar. Cinco minutos.
- **Con nota, en un centro con plan Formación o instalación propia, sin volver a subir nada cada vez que cambia el tour**: LTI 1.3.
- **Con nota, en cualquier otro caso** (el campus no da de alta herramientas externas, o exige que el material esté en el propio Moodle, como en auditorías y empresas): SCORM.

En muchos centros conviven varias: el mismo tour incrustado en la página de bienvenida y como SCORM en la asignatura o en el curso de acogida de la empresa colaboradora.

## Qué se necesita en Andarama

- En **andarama.com**, la exportación SCORM y la integración LTI 1.3 están en el [plan Formación](/formacion/) (99 $ al mes o 990 $ al año, con 100 recorridos, 200 GB, marca blanca y dominio propio). Incrustar un tour publicado funciona con cualquier plan.
- En una **instalación propia** (Docker, la cuenta de Cloudflare del centro o el ejecutable de escritorio) no hay planes: SCORM y LTI 1.3 están disponibles sin más. Es la opción natural para una universidad con equipo técnico, y el programa es de código abierto (EUPL-1.2).

## Errores frecuentes

- **El iframe desaparece al guardar la página.** El filtro HTML de Moodle lo ha quitado. Solución: permisos del rol o web component.
- **El SCORM se abre pero no manda la nota.** Comprueba que el tour tiene al menos un quiz y una puntuación mínima configurada; sin ella no hay `success_status` que reportar.
- **LTI: «invalid issuer» o error al lanzar.** El Platform ID, el Deployment ID o las URL de Moodle (auth, token, certs) no coinciden con los registrados en Andarama; suele ser una barra final de más o un `http` donde debería ser `https`.
- **LTI: el tour se abre pero la nota no llega.** En la herramienta de Moodle falta activar Assignment and Grade Services o poner «Accept grades from the tool» en «Always».
- **En las gafas no entra en RV desde Moodle.** El iframe no tiene `allow="xr-spatial-tracking"`, o el campus se sirve por `http`.
