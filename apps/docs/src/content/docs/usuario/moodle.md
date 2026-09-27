---
title: "Insertar en Moodle: enlace, iframe, web component, SCORM y LTI (en pruebas)"
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
| **LTI 1.3** (en pruebas) | Todavía no | Sí | Administración, una vez; después, cada docente |

En resumen: **para verlo, iframe; para la nota, SCORM.** El alumnado no
necesita cuenta en Andarama en ninguno de los casos.

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

Es hoy el camino para que la nota del quiz llegue a Moodle.

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

## 5. LTI 1.3 (en pruebas)

:::caution[En pruebas]
La configuración LTI 1.3 existe y Moodle puede lanzar el recorrido, pero la
integración está **en pruebas**: la nota del quiz **todavía no vuelve** al libro
de calificaciones por esta vía. Si necesitas la nota, usa SCORM.
:::

Andarama está diseñada como herramienta LTI 1.3 Advantage con **Deep Linking**
(el docente elige el recorrido desde Moodle) y **Assignment and Grade
Services** (la devolución de la nota, que es la parte pendiente). La ventaja de
fondo es que el recorrido no se copia: Moodle lo abre desde Andarama y cualquier
cambio publicado se ve al momento.

**En Moodle** (administración del sitio, una vez): **Administración del sitio ›
Plugins › Módulos de actividad › Herramienta externa › Gestionar
herramientas › configurar una herramienta manualmente**:

- URL de la herramienta e **Initiate login URL**: `https://tu-instancia/api/v1/lti/login`
- **Redirection URI(s)** y, si Moodle la pide, **Content Selection URL**: `https://tu-instancia/api/v1/lti/launch`
- **Public keyset URL** (JWKS): `https://tu-instancia/api/v1/lti/jwks`
- Servicios: activar IMS LTI Assignment and Grade Services y Deep Linking.

**En Andarama** (administración de la instancia, panel **Administración ›
Plataformas LTI (Moodle)**): registra la plataforma con el Issuer de Moodle
(la dirección del sitio), el Client ID que te dio Moodle, la Auth URL
(`/mod/lti/auth.php`), la Token URL (`/mod/lti/token.php`) y el JWKS
(`/mod/lti/certs.php`).

**Cada docente**: en el curso, **Añadir una actividad o un recurso ›
Herramienta externa**, elige Andarama, pulsa **Seleccionar contenido** y escoge
el recorrido (o fija `tour=slug` en los parámetros personalizados).

En una instalación propia lo configura quien administra Andarama. En
andarama.com, LTI está ligado al plan Formación y se prueba con centros piloto:
escríbenos si os interesa participar.
