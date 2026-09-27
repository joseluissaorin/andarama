---
title: "Cómo meter un recorrido 360 en Moodle (SCORM, iframe y LTI)"
description: "Cómo poner un tour 360 en Moodle: incrustado en una página, sin nota, o como paquete SCORM con nota. Y en qué punto está la integración LTI 1.3."
lang: es
slug: recorrido-360-moodle
cluster: docencia
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "¿Cuál es la diferencia entre SCORM y LTI para un recorrido 360?"
    a: "SCORM es un paquete que se sube a Moodle y vive allí: si cambias el tour, hay que volver a subirlo. LTI es una conexión: Moodle abre el tour que está en Andarama, siempre actualizado. En Andarama, LTI 1.3 está en pruebas y la nota todavía no vuelve sola; para nota, hoy, SCORM."
  - q: "¿Puedo poner un tour en Moodle sin nota, solo para verlo?"
    a: "Sí: el código de inserción del tour se pega en una página o una etiqueta de Moodle y aparece embebido, con pantalla completa y realidad virtual. No hay calificación, pero no hace falta configurar nada."
  - q: "¿La nota del quiz llega al libro de calificaciones?"
    a: "Con SCORM, sí: el paquete envía la puntuación y el estado de finalización a la actividad SCORM y, con la configuración habitual, al libro de calificaciones. Por LTI todavía no: está en pruebas."
  - q: "¿Qué plan de Andarama hace falta?"
    a: "En andarama.com, el paquete SCORM está en el plan Formación. En una instalación propia del centro o de la universidad no hay planes: todo está disponible. Incrustar un tour funciona con cualquier plan."
---

Hay dos maneras listas de meter un **recorrido 360 en Moodle**, y la elección depende de si necesitas nota o no: incrustar el tour en una página con un iframe o un web component (sin nota, cero configuración) o subirlo como **paquete SCORM** (con nota y finalización, pero congelado en el momento de exportar). Hay una tercera, la conexión por **LTI 1.3**, que en Andarama está en pruebas: el docente puede elegir el tour desde Moodle, pero la nota todavía no vuelve sola al libro de calificaciones. Esta guía explica las tres con Andarama, cómo se configuran y cuándo conviene cada una. Lo mismo vale, con pequeñas diferencias, para Canvas, Blackboard y Sakai.

## Las tres opciones, de un vistazo

| | Incrustar | SCORM | LTI 1.3 (en pruebas) |
|---|---|---|---|
| Nota en Moodle | No | Sí (actividad SCORM) | Todavía no |
| Se actualiza solo | Sí | No (hay que volver a subir) | Sí |
| Configuración | Ninguna | Ninguna | Una vez, por la administración |
| Quién lo hace | Cualquier docente | Cualquier docente | Docente, tras el alta de la herramienta |
| Realidad virtual | Sí | Sí, servido por HTTPS | Sí |
| Plan en andarama.com | Cualquiera | Formación | Piloto, bajo petición |

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

Es hoy el camino para tener nota en cualquier campus, y para quien quiere el paquete en su mano. Desde el editor de Andarama, **Exportar** ofrece SCORM 1.2 y SCORM 2004 (3.ª edición). El paquete lleva dentro el visor, el `tour.json`, las teselas y los medios, y reporta al campus:

- `completion_status` al visitar todas las escenas (o al completar el quiz).
- `score.raw`, `score.min` y `score.max`, y `success_status` según la puntuación mínima configurada en el tour.

En Moodle:

1. Añade una actividad **Paquete SCORM** al curso.
2. Sube el ZIP exportado.
3. En «Calificación», elige el método (por ejemplo, la puntuación más alta) y el intento que cuenta.
4. Guarda. El alumnado abre la actividad y el tour se muestra dentro del reproductor SCORM de Moodle; la nota del quiz aparece en el informe de la actividad y, con la configuración habitual, en el libro de calificaciones.

Dos cosas que hay que saber. La primera: el paquete es una **foto fija** del tour. Si corriges una pregunta, hay que exportar y subir de nuevo. La segunda: la realidad virtual dentro del paquete exige que Moodle sirva por HTTPS (lo normal hoy); si no, el botón de gafas cae al modo cartón. Una tercera: el paquete SCORM no se puede combinar con la exportación «HTML único». Todo está descrito en [publicar y exportar](https://docs.andarama.com/usuario/publicar/).

## Opción 3: LTI 1.3 Advantage (en pruebas)

Es la integración que más se nos pide, y conviene ser claros: en Andarama está **en pruebas**. Está diseñada como **herramienta LTI 1.3** con dos servicios:

- **Deep Linking**: el docente, desde Moodle, pulsa «añadir herramienta externa» y elige el tour en un selector, sin copiar direcciones.
- **Assignment and Grade Services (AGS)**: el envío de la puntuación del quiz al libro de calificaciones. Esta es la parte que todavía no funciona sola: hoy la nota no vuelve a Moodle por LTI.

La ventaja de fondo es que el tour no se copia a ningún sitio: Moodle lo abre desde Andarama, así que cualquier cambio se ve al momento. Si necesitas nota ya, usa SCORM.

### Configuración (una sola vez, la administración)

En Moodle, Administración del sitio, Plugins, Herramientas externas, «configurar una herramienta manualmente»:

- URL de la herramienta e **Initiate login URL**: `https://tu-instancia/api/v1/lti/login`
- **Redirection URI**: `https://tu-instancia/api/v1/lti/launch`
- **JWKS URL**: `https://tu-instancia/api/v1/lti/jwks`
- Servicios: activar Deep Linking.

En Andarama, la administración de la instancia registra la plataforma (panel Administración, pestaña LTI) con el Issuer de Moodle, el Client ID, la Auth URL (`/mod/lti/auth.php`), la Token URL (`/mod/lti/token.php`) y el JWKS (`/mod/lti/certs.php`). En una instalación propia lo hace la persona que administra Andarama; en andarama.com, si queréis participar en las pruebas, escribidnos desde la [página de universidades](/universidades/) con los datos del campus.

La guía con los pasos exactos está en [docencia: LTI 1.3](https://docs.andarama.com/usuario/docencia/).

### Uso (cada docente)

1. En el curso, «Añadir una actividad», **Herramienta externa**, elegir Andarama.
2. Pulsar «Seleccionar contenido» y escoger el tour en el selector (Deep Linking). También se puede fijar a mano con el parámetro `custom.tour = slug`.
3. Guardar. La actividad aparece en el curso y abre el tour.

Mientras la integración esté en pruebas, no cuentes con que la nota del quiz llegue a Moodle por esta vía.

## Cuál elegir

- **Salida virtual, museo, visita al centro, sin nota**: incrustar. Cinco minutos.
- **Formación con nota en un campus que no tiene LTI, o que exige que el material esté en el propio Moodle** (auditorías, empresas): SCORM.
- **Universidad o centro con Moodle propio y varios docentes**: SCORM para lo que se evalúa, incrustado para lo demás; y, si os interesa, un piloto de LTI sin depender de él para las notas.

En muchos centros conviven las dos: el mismo tour incrustado en la página de bienvenida y como SCORM en la asignatura o en el curso de acogida de la empresa colaboradora.

## Qué se necesita en Andarama

- En **andarama.com**, la exportación SCORM está en el [plan Formación](/formacion/) (99 $ al mes o 990 $ al año, con 100 recorridos, 200 GB, marca blanca y dominio propio). Incrustar un tour publicado funciona con cualquier plan.
- En una **instalación propia** (Docker, la cuenta de Cloudflare del centro o el ejecutable de escritorio) no hay planes: SCORM está disponible sin más, y también la integración LTI en pruebas. Es la opción natural para una universidad con equipo técnico, y el programa es de código abierto (EUPL-1.2).

## Errores frecuentes

- **El iframe desaparece al guardar la página.** El filtro HTML de Moodle lo ha quitado. Solución: permisos del rol o web component.
- **El SCORM se abre pero no manda la nota.** Comprueba que el tour tiene al menos un quiz y una puntuación mínima configurada; sin ella no hay `success_status` que reportar.
- **LTI: «invalid issuer» o error al lanzar.** Las URL de Moodle (issuer, auth, token, certs) no coinciden con las registradas en Andarama; suele ser una barra final de más o un `http` donde debería ser `https`.
- **En las gafas no entra en RV desde Moodle.** El iframe no tiene `allow="xr-spatial-tracking"`, o el campus se sirve por `http`.
