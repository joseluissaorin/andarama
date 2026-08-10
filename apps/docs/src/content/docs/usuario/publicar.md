---
title: Publicar y compartir
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

Tras publicar obtienes: URL pública con **deep links** (`#s=escena&y=120&p=-5&f=70`), **código QR**, **código de embebido** responsive y metadatos Open Graph con imagen de la vista inicial.

### API postMessage del visor embebido

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
| Cuenta de X del sitio | `@ull` |
| Idioma declarado | `es_ES` |
| No indexar | Añade `robots noindex`, útil en tours internos |

Se traducen como cualquier otro texto del tour, así que la tarjeta sale en el
idioma con el que se abra el enlace. Los mismos metadatos viajan dentro del
paquete exportado, de modo que un tour subido a otro alojamiento se comparte
igual de bien.

## Exportar paquete estático

**Exportar** genera en tu navegador un ZIP autocontenido (index.html + visor + tour.json + tiles + medios) **sin ninguna dependencia externa**: funciona por FTP en cualquier hosting, con `python3 -m http.server`, en GitHub Pages o Cloudflare Pages sin configuración. No lleva backend, ni CDN, ni llamadas a la plataforma: una vez subido, el tour vive por su cuenta.

Eso sí, hay que **servirlo**, no abrirlo: el paquete estándar no funciona haciendo doble clic en `index.html` (`file://`), porque el navegador bloquea desde el sistema de ficheros tanto los módulos JavaScript como los panoramas. Para verlo en local, `python3 -m http.server` en la carpeta y abrir `http://localhost:8000`.

Opciones:

- **Idiomas incluidos** y **resolución máxima de tiles** (para reducir peso).
- **Incluir/excluir descargas** de PDF e imágenes.
- **Analítica**: endpoint propio configurable o desactivada.
- **Service worker offline**: PWA instalable, ideal para museos y kioscos sin red.
- **HTML único**: un solo `index.html` con el visor y los medios en base64, que sí se abre con doble clic. Solo admite escenas equirectangulares: los tiles multirresolución no se pueden incrustar porque el visor calcula sus URL nivel a nivel, así que con un tour teselado la opción aparece desactivada. Al abrirse por `file://` no hay WebXR (no es contexto seguro) y la VR queda en modo cardboard.
- **SCORM 1.2 / 2004**: paquete para LMS con reporte de finalización y puntuación.
- **Kiosko**: autopilot + reinicio por inactividad + bloqueo de salida.

El ZIP incluye además un `LEEME.md` con las instrucciones de subida y un
`.htaccess` con los tipos MIME (`.webp`, `.avif`, `.glb`, `.webmanifest`) y las
cabeceras de caché que necesitan los alojamientos compartidos con Apache. El
paquete funciona igual dentro de un subdirectorio (`https://midominio.es/tours/mi-tour/`):
todas las rutas son relativas.

### Realidad virtual en el paquete exportado

El paquete lleva el mismo motor que el tour publicado, así que el botón **Modo
VR** funciona también desde el ZIP, con una condición: **hay que servirlo por
HTTPS**. WebXR solo existe en contextos seguros; abriendo el `index.html` con
doble clic (`file://`) el tour se ve, pero el modo inmersivo cae al respaldo
cardboard. Cualquier alojamiento con certificado —incluidos GitHub Pages,
Cloudflare Pages o Netlify, gratuitos— sirve. Véase la
[guía de realidad virtual](/docs/usuario/realidad-virtual/).

También puedes automatizar la publicación desde CI con un token de API (`POST /api/v1/projects/{id}/publish`) y recibir webhooks de publicación.

## Modo quiosco

Para una pantalla en una sala, una feria o un vestíbulo: el tour se explica
solo y cualquiera puede tomar el mando.

- **Encadena todos los recorridos**, uno detrás de otro y vuelta a empezar. No
  se queda en el primero.
- **Antes de cambiar de escena mira hacia la puerta** por la que va a salir,
  de modo que se entienda de dónde a dónde se va.
- **Quien toca la pantalla se queda al mando**: aparece «Estás explorando por
  tu cuenta» y un botón para volver al recorrido. Si nadie toca nada durante
  un minuto, el quiosco vuelve al principio y sigue solo.
- **La lista de recorridos** está siempre abajo: se pulsa uno y empieza ese.

Se activa al exportar (**Exportar › Modo quiosco**) o añadiendo `?kiosk=1` a
la dirección del tour publicado.
