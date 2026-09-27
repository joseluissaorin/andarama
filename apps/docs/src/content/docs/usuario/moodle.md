---
title: "Insertar en Moodle: enlace, iframe, web component, SCORM y LTI 1.3"
description: Las cinco maneras de llevar un recorrido de Andarama a Moodle 4.x, cuál da nota y los pasos exactos de cada una.
---

Hay cinco maneras de llevar un recorrido a Moodle. La elección depende sobre
todo de una pregunta: ¿necesitas que la nota del quiz llegue al libro de
calificaciones?

| | Nota en Moodle | Se actualiza al republicar | Quién lo hace |
|---|---|---|---|
| **Enlace** | No | Sí | Cualquier docente |
| **Iframe** (código de embebido) | No | Sí | Cualquier docente |
| **Web component** | No | Sí | Quien pueda añadir un `<script>` |
| **Paquete SCORM** | **Sí** | No: hay que volver a subirlo | Cualquier docente |
| **LTI 1.3** | **Sí** | Sí | Administración, una vez; después, cada docente |

En resumen: **para verlo, iframe; para la nota, LTI 1.3** si tu Moodle lo
permite y tienes el plan Formación o una instalación propia; si no, **SCORM**.
El alumnado no necesita cuenta en Andarama en ninguno de los casos.

Si quieres la explicación larga, con los errores frecuentes y cuándo conviene
cada una, está en el artículo
[Cómo meter un recorrido 360 en Moodle](https://andarama.com/blog/recorrido-360-moodle/).

## 1. Enlace

Lo más sencillo: en el curso, **Añadir una actividad o un recurso › URL**, y
pega la dirección pública del recorrido (`https://…/t/tu-slug`). Marca que se
abra en una ventana nueva: así hay pantalla completa y realidad virtual sin
restricciones.

## 2. Iframe (código de embebido)

Los dos códigos, el iframe y el web component, sirven para meter el recorrido
dentro de otra web. El **código de embebido** (iframe) es la opción universal:
se pega en cualquier sitio que admita HTML, incluidos Moodle, WordPress o
Google Sites.

1. En el editor de Andarama, pulsa **Compartir** y copia el **Código de embebido**.
2. En Moodle, edita una **Página** o una **Etiqueta** (en Moodle 4.1 y
   posteriores se llama **Área de texto y medios**).
3. En el editor de texto, abre el **código fuente**: en TinyMCE (Moodle 4.1 y
   posteriores) es el botón `<>` o **Ver › Código fuente**; en Atto (Moodle
   4.0), el botón **HTML**.
4. Pega el código y guarda.

Si al guardar el recorrido desaparece, el filtro HTML de Moodle ha quitado el
iframe. Hay que pedir a la administración del sitio que permita contenido de
confianza para el rol docente, o que lo pegue alguien con ese permiso.

El código ya lleva `allow="fullscreen; gyroscope; accelerometer;
xr-spatial-tracking"`: no lo recortes, o la realidad virtual y el giroscopio
dejarán de funcionar dentro del marco. Más detalles en
[Embeber un tour](/docs/usuario/embeber/).

## 3. Web component

Hace lo mismo que el iframe con una etiqueta más corta, `<anda-tour>`, que
ajusta sola la proporción:

```html
<script src="https://TU-INSTANCIA/embed.js"></script>
<anda-tour slug="mi-tour" title="Mi tour virtual"></anda-tour>
```

Úsalo solo si controlas el HTML de la página y puedes añadir un `<script>`. En
Moodle casi nunca es el caso: el editor quita los scripts salvo en temas o
bloques que administra el sitio. Para el aula virtual, el iframe es más seguro.

## 4. Paquete SCORM (con nota)

Es el camino para que la nota llegue a Moodle sin configurar nada en el sitio,
o a cualquier otro LMS: el paquete se sube como una actividad más.

En Andarama:

1. En **Ajustes del tour › Cuestionarios**, fija la **Puntuación mínima (%)**.
   Sin ella, el paquete manda la puntuación pero no si se ha aprobado.
2. Pulsa **Exportar**, elige **Paquete SCORM** y la versión: **2004** en
   cualquier Moodle actual (1.2 solo para plataformas antiguas).
3. Deja **HTML único** desactivado: con él, el paquete no comunica nada al
   aula virtual.
4. Genera el ZIP.

En Moodle 4.x:

1. En el curso, activa la edición y pulsa **Añadir una actividad o un recurso ›
   Paquete SCORM**.
2. Pon un nombre y sube el ZIP en **Paquete**.
3. En **Calificación**, elige el método (por ejemplo, **Calificación más alta**)
   y en **Gestión de intentos**, cuántos se permiten y cuál cuenta.
4. En **Apariencia**, si quieres realidad virtual o pantalla completa sin
   estrecheces, muestra el paquete en una **Ventana nueva**.
5. Guarda.

El aula virtual registra si el alumno ha completado el recorrido (todas las
escenas vistas o todas las preguntas respondidas) y su puntuación, con
`success_status` según la nota mínima. Con la configuración habitual aparece en
el libro de calificaciones.

El paquete es una foto fija: si corriges algo, exporta y sube el ZIP otra vez.
En andarama.com, el paquete SCORM es del **plan Formación**; en una instalación
propia está siempre disponible. Todo sobre las opciones de exportación en
[Exportar](/docs/usuario/exportar/).

## 5. LTI 1.3

Con LTI, Moodle no guarda una copia del recorrido: lo abre desde Andarama. El
docente lo elige desde el propio curso con **Deep Linking**, el alumnado entra
sin cuenta de Andarama y la nota del quiz vuelve sola al **libro de
calificaciones** por **Assignment and Grade Services** (AGS). Si corriges el
recorrido y lo vuelves a publicar, el curso ve la versión nueva al momento.

Estos pasos se han comprobado de punta a punta con **Moodle 4.5 LTS**: alta de
la herramienta, alta de la plataforma, selección del recorrido, lanzamiento
como alumno, respuesta del quiz y nota en el libro. Los nombres de los campos
de Moodle son los de la interfaz en inglés, que es la que usa la prueba; en
español cambian las palabras, pero no el orden ni el sitio.

Hace falta que Andarama se sirva por **HTTPS** con una dirección pública fija
(en una instalación propia, `PUBLIC_URL`), y que el recorrido esté publicado
como **público** o **no listado**: las visibilidades por contraseña, por
organización o por dominios no están pensadas para abrirse dentro de Moodle.

### Paso 1. Moodle: registrar Andarama como herramienta externa (una vez)

Lo hace la administración del sitio Moodle.

1. Ve a **Site administration › Plugins › Activity modules › External tool ›
   Manage tools** y pulsa **configure a tool manually**.
2. En **Tool settings**, rellena (cambia `https://tu-instancia` por la
   dirección de tu Andarama, por ejemplo `https://andarama.com`):

   | Campo de Moodle | Valor |
   |---|---|
   | **Tool name** | Andarama (o el nombre que quieras ver en el curso) |
   | **Tool URL** | `https://tu-instancia/api/v1/lti/launch` |
   | **LTI version** | LTI 1.3 |
   | **Public key type** | Keyset URL |
   | **Public keyset** | `https://tu-instancia/api/v1/lti/jwks` |
   | **Initiate login URL** | `https://tu-instancia/api/v1/lti/login` |
   | **Redirection URI(s)** | `https://tu-instancia/api/v1/lti/launch` |
   | **Tool configuration usage** | Show in activity chooser and as a preconfigured tool |
   | **Supports Deep Linking (Content-Item Message)** | marcado |
   | **Content Selection URL** | `https://tu-instancia/api/v1/lti/launch` |

3. Pulsa **Expand all** para abrir el resto de secciones y, en **Services**,
   pon **IMS LTI Assignment and Grade Services** en **Use this service for
   grade sync and column management**. Sin este servicio, el recorrido se abre
   pero la nota no vuelve.
4. En **Privacy**, pon **Share launcher's name with tool** en **Always** (el
   nombre del alumno aparece en los resultados de Andarama) y **Accept grades
   from the tool** en **Always**.
5. Guarda. La herramienta aparece como una tarjeta en **Manage tools**. Pulsa
   el icono de **View configuration details** de esa tarjeta: Moodle muestra
   una ventana con seis datos que necesitarás en el paso 2, **Platform ID**,
   **Client ID**, **Deployment ID**, **Public keyset URL**, **Access token
   URL** y **Authentication request URL**.

### Paso 2. Andarama: dar de alta la plataforma Moodle (una vez)

Lo hace el **administrador de la organización** en Andarama, en **Ajustes de la
organización › LTI: Moodle y otros LMS**. En andarama.com hace falta un plan
que incluya LTI (Formación); en una instalación propia está siempre
disponible, y el operador de la instancia también puede dar de alta
plataformas desde **Administración › LTI**.

En el formulario de la sección, copia los datos de la ventana de Moodle:

| Campo de Andarama | Dato de Moodle | Ejemplo |
|---|---|---|
| **Issuer** | Platform ID | `https://moodle.tu-centro.es` |
| **Client ID** | Client ID | `Kx3p9…` |
| **Deployment ID** | Deployment ID | `3` |
| **Auth URL** | Authentication request URL | `https://moodle.tu-centro.es/mod/lti/auth.php` |
| **Token URL** | Access token URL | `https://moodle.tu-centro.es/mod/lti/token.php` |
| **JWKS URL** | Public keyset URL | `https://moodle.tu-centro.es/mod/lti/certs.php` |

Pulsa **Crear**. La plataforma aparece en la lista con su Client ID. Encima
del formulario están las direcciones de la herramienta que se usaron en el
paso 1, por si hay que comprobarlas.

Cada plataforma pertenece a una organización: el selector solo ofrece los
recorridos publicados de esa organización y se rechazan los lanzamientos con
otro `deployment_id`.

### Paso 3. Moodle: el docente añade el recorrido al curso

1. En el curso, activa **Edit mode** y, en la sección que quieras, pulsa **Add
   an activity or resource**. Elige **Andarama** (el nombre del paso 1) en el
   selector de actividades.
2. En el formulario de la actividad, pulsa **Select content**. Se abre una
   ventana con la lista **«Elige el recorrido que quieres incrustar en el
   curso»**: son los recorridos publicados de tu organización.
3. Pulsa el recorrido. La ventana se cierra y Moodle rellena la actividad: el
   **Activity name** ya trae el título del recorrido (puedes cambiarlo) y se
   crea su columna en el libro de calificaciones, sobre 100.
4. Pulsa **Save and display**. El recorrido se ve dentro de la página de la
   actividad.

La lista de recorridos caduca a los quince minutos: si tardas más en elegir,
vuelve a pulsar **Select content**.

### Paso 4. El alumnado: abrir el recorrido y responder

El alumno entra en la actividad desde el curso, como en cualquier otra. El
recorrido se abre dentro de Moodle, sin pedir cuenta ni contraseña de
Andarama. Al contestar la última pregunta aparece el **Informe del
cuestionario** con la puntuación y, si el tour tiene nota mínima, si ha
aprobado. En ese momento Andarama envía la nota a Moodle.

### Paso 5. Comprobar la nota

En el curso, **Grades** (el **informe del calificador**) muestra la nota del
alumno en la columna de la actividad, escalada a 100: dos preguntas acertadas
de dos son un **100.00**. El alumno la ve en su **informe de usuario**. En
Andarama, el resultado aparece también en los resultados del quiz del
recorrido, con el nombre del alumno y marcado como lanzamiento LTI.

### Si algo falla

Los errores del lanzamiento se muestran dentro de la propia actividad, en una
página de Andarama que explica qué ha pasado:

- **«Plataforma LTI no registrada»**: falta el paso 2, o el Issuer o el Client
  ID no coinciden con los de Moodle.
- **«El deployment_id no corresponde a este registro LTI»**: el Deployment ID
  del paso 2 no es el de la herramienta. Cópialo de nuevo de **View
  configuration details**.
- **«La plataforma envió un mensaje que no se ha podido validar»**: Andarama
  no ha podido leer las claves de Moodle (revisa la **JWKS URL**), o la hora
  del servidor de Moodle va desfasada.
- **La nota no llega**: comprueba que el servicio **IMS LTI Assignment and
  Grade Services** esté activado (paso 1.3) y que la actividad se creó con
  **Select content**; una actividad sin columna de calificación no recibe
  nota.
- **El selector está vacío**: la organización no tiene recorridos publicados, o
  la plataforma se registró sin organización (en ese caso, el operador de la
  instancia puede asignarla desde **Administración › LTI**).

En una instalación propia, el entorno completo de la prueba (Moodle 4.5 en
Docker y la prueba automática) está en el repositorio, en
`tooling/lti-moodle/`, por si quieres repetirla antes de ponerla en marcha con
tu Moodle.
