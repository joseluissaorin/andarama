---
title: Publicar y compartir
description: Previsualizar, publicar con la visibilidad adecuada, controlar la tarjeta del enlace, exportar y poner el recorrido en modo quiosco.
---

## Previsualizar antes de publicar

La pestaña **Previsualizar** recorre el borrador entero tal como lo verá el
visitante: los mismos hotspots, el mismo minimapa, el mismo modo VR, sin
publicar nada ni tocar lo ya publicado. La barra superior avisa de lo que
impediría publicar.

Es además donde se ajustan las llegadas sin esfuerzo: como la previsualización
sabe de dónde vienes, cuando entras en una sala mirando a una pared basta girar
hasta lo que quieres que se vea y pulsar **«Guardar como llegada desde…»**.
Ajustar un recorrido de trece salas deja de ser rellenar formularios y pasa a
ser un paseo.

## Publicar en la plataforma

**Publicar** congela una versión inmutable del tour en el almacenamiento y la sirve en `/t/{slug}`. El borrador sigue siendo editable; los visitantes no ven los cambios hasta la siguiente publicación. Puedes despublicar o **republicar cualquier versión anterior** desde la pestaña Versiones.

Opciones de visibilidad (§protección de acceso):

- **Público**: indexable, aparece en el sitemap.
- **No listado**: solo con enlace.
- **Protegido por contraseña**.
- **Solo usuarios de la organización**: requiere iniciar sesión.
- **Restringido a dominios de embebido**: allowlist de dominios (frame-ancestors + Referer).

Además: fecha de publicación programada y fecha de expiración.

Tras publicar obtienes: URL pública con **deep links** (`#s=escena&y=120&p=-5&f=70&v=1`), **código QR**, **código de embebido** responsive y metadatos Open Graph con imagen de la vista inicial.

### Enlaces a una escena y a una vista

Mientras alguien mira el recorrido, el visor va escribiendo en la dirección la
escena y la orientación. Eso sirve para recargar sin perder la escena, pero
**no** para fijar la vista: al recargar, se entra con la vista por defecto de la
escena, la que se ajustó en el editor con «Usar vista actual».

La orientación de un enlace solo se aplica cuando lleva el marcador `v=1`, y
ese marcador lo pone el botón **Compartir** del visor. Así, quien comparte un
enlace desde el visor enseña justo lo que está mirando, y una recarga
cualquiera no pisa la vista que decidiste en el editor.

| El enlace lleva… | Se abre en… |
|---|---|
| Nada | La escena inicial, con su vista por defecto |
| `#s=aula` | La escena `aula`, con su vista por defecto |
| `#s=aula&y=120&p=-5&f=70&v=1` | La escena `aula`, mirando a esa orientación |

El código de embebido y el web component se explican en [Embeber un tour](/docs/usuario/embeber/), y los pasos para el aula virtual en [Insertar en Moodle](/docs/usuario/moodle/). El diálogo **Compartir** del editor enlaza también esa guía de Moodle. Si el recorrido lleva o no la insignia «Hecho con Andarama» depende del plan con el que se publica: véase [La insignia](/docs/usuario/insignia/).

### La galería pública de andarama.com

En la instancia alojada, un tour **público** puede pedir además una página propia en la galería, `andarama.com/explorar/{slug}/`, pensada para que los buscadores la encuentren por el nombre del lugar. Al publicar, activa **«Mostrar en la galería pública de andarama.com»** y rellena:

- **Título de la ficha**, con el nombre del lugar («Catedral de La Laguna: recorrido virtual 360»).
- **Descripción**: un párrafo de entre 300 y 600 caracteres, en un solo idioma.
- **Lugar y país**, y las **coordenadas** si las sabes (si el tour ya tiene mapa, se rellenan solas).
- **Atribuciones**, si las fotografías no son tuyas.

La ficha lleva el visor embebido, el botón de pantalla completa, la portada capturada al publicar como imagen social, datos estructurados de lugar (`TouristAttraction` o `Place`, con `geo`) y entra en el `sitemap-tours.xml` con su portada. Si cambias la visibilidad a algo que no sea público, la ficha se apaga sola; los textos se conservan por si la vuelves a encender. El índice, `andarama.com/explorar/`, se filtra por país.

Cada ficha la revisa una persona antes de que aparezca: hasta que se aprueba, el diálogo de publicar dice «Ficha en revisión» y la página no se lista ni se indexa (el recorrido, en cambio, ya está publicado en su enlace). Si cambias los textos de la ficha, vuelve a revisión; republicar solo el contenido no la toca.

### API postMessage del visor embebido

La referencia completa está en [Embeber un tour](/docs/usuario/embeber/#api-postmessage).

```js
// controlar el visor desde la página que lo embebe
iframe.contentWindow.postMessage({ andarama: "goTo", scene: "aula" }, "*");
iframe.contentWindow.postMessage({ andarama: "setView", view: { yaw: 1.2 } }, "*");
iframe.contentWindow.postMessage({ andarama: "setLang", lang: "en" }, "*");
iframe.contentWindow.postMessage({ andarama: "getState" }, "*");
// escuchar eventos
addEventListener("message", (e) => {
  if (e.data?.andarama === "sceneChange") console.log(e.data.scene);
});
```

## Cómo se ve el enlace al compartirlo

En **Ajustes del tour › Compartir el enlace** se controla la tarjeta que
aparece al pegar la dirección en WhatsApp, X, Teams, Slack o el aula virtual,
con una vista previa de cómo quedará:

| Campo | Para qué |
| --- | --- |
| Título de la tarjeta | Si se deja vacío, el título del tour |
| Texto de la tarjeta | Dos líneas: las redes recortan |
| Nombre del sitio | La organización («Museo de la Ciudad») |
| Imagen | 1200 × 630 px. Sin ella, casi ninguna red muestra tarjeta grande |
| Texto alternativo | Accesibilidad de esa imagen |
| Tipo de tarjeta | Imagen grande o pequeña (X/Twitter) |
| Cuenta de X del sitio | `@museodelaciudad` |
| Idioma declarado | `es_ES` |
| No indexar | Añade `robots noindex`, útil en tours internos |

Se traducen como cualquier otro texto del tour, así que la tarjeta sale en el
idioma con el que se abra el enlace. Los mismos metadatos viajan dentro del
paquete exportado, de modo que un tour subido a otro alojamiento se comparte
igual de bien.

## Exportar paquete estático

**Exportar** genera en tu navegador un paquete que funciona sin Andarama detrás:
un ZIP para cualquier alojamiento, un HTML único que se abre con doble clic, una
versión que sigue funcionando sin conexión (PWA/kiosco) o un paquete SCORM para
el aula virtual. Qué hace cada opción, cuándo usarla y sus límites están en
[Exportar: ZIP, HTML único, PWA y SCORM](/docs/usuario/exportar/).

También puedes automatizar la publicación desde CI con un token de API (`POST /api/v1/projects/{id}/publish`) y recibir webhooks de publicación.

## Modo quiosco

Para una pantalla en una sala, una feria o un vestíbulo: el tour se explica
solo y cualquiera puede tomar el mando.

- **Encadena todos los recorridos**, uno detrás de otro. No se queda en el
  primero.
- **En cada parada se entra como entraría un visitante**: por el paso que une
  las dos escenas y con la orientación de llegada de ese paso. Se espera los
  segundos indicados en la parada y, **antes de cambiar de escena, mira hacia
  la puerta** por la que va a salir, de modo que se entienda de dónde a dónde
  se va.
- **Al terminar vuelve a la escena inicial** y espera: aparece «El recorrido ha
  terminado» con el botón **Verlo otra vez**. Solo se repite sin parar si algún
  recorrido tiene marcado **Repetir en bucle** (en el grafo, modo Autopilot).
- **Quien toca la pantalla se queda al mando**: aparece «Estás explorando por
  tu cuenta» y un botón para volver al recorrido. Si nadie toca nada durante
  un minuto, el quiosco vuelve a la escena inicial; con el bucle puesto,
  además arranca de nuevo solo.
- **La lista de recorridos** está siempre abajo: se pulsa uno y empieza ese.

### Cómo se consigue

Hay tres caminos, y los tres llevan al mismo sitio:

- **Al publicar**, en **Cómo se abre el enlace**, eligiendo «Modo quiosco». La
  dirección de siempre (`/t/tu-tour`) arranca ya en bucle, que es lo que hace
  falta cuando el televisor de la entrada solo sabe abrir una URL fija. Volver
  a publicar sin tocar nada conserva el modo; para deshacerlo se elige
  «Recorrido normal».
- **Con el enlace de quiosco**, que está siempre a mano en **Compartir** y en
  la pantalla final de publicar: es la misma dirección con `?kiosk=1`. Sirve
  para poner una pantalla en bucle sin cambiar cómo abre el enlace todo el
  mundo. Funciona en los dos sentidos: `?kiosk=0` saca el recorrido suelto de
  un tour publicado en quiosco, por si quieres compartirlo con alguien.
- **Al exportar** (**Exportar › Modo quiosco**), si lo que quieres es un
  paquete que funcione sin Andarama detrás (y, con el service worker, sin
  conexión). Véase [Exportar](/docs/usuario/exportar/).
