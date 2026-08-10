---
title: Publicar y exportar
---

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
iframe.contentWindow.postMessage({ ull360: "goTo", scene: "aula" }, "*");
iframe.contentWindow.postMessage({ ull360: "setView", view: { yaw: 1.2 } }, "*");
iframe.contentWindow.postMessage({ ull360: "setLang", lang: "en" }, "*");
iframe.contentWindow.postMessage({ ull360: "getState" }, "*");
// escuchar eventos
addEventListener("message", (e) => {
  if (e.data?.ull360 === "sceneChange") console.log(e.data.scene);
});
```

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
