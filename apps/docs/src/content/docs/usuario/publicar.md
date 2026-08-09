---
title: Publicar y exportar
---

## Publicar en la plataforma

**Publicar** congela una version inmutable del tour en el almacenamiento y la sirve en `/t/{slug}`. El borrador sigue siendo editable; los visitantes no ven los cambios hasta la siguiente publicacion. Puedes despublicar o **republicar cualquier version anterior** desde la pestana Versiones.

Opciones de visibilidad (§proteccion de acceso):

- **Publico**: indexable, aparece en el sitemap.
- **No listado**: solo con enlace.
- **Protegido por contrasena**.
- **Solo usuarios de la organizacion**: requiere iniciar sesion.
- **Restringido a dominios de embebido**: allowlist de dominios (frame-ancestors + Referer).

Ademas: fecha de publicacion programada y fecha de expiracion.

Tras publicar obtienes: URL publica con **deep links** (`#s=escena&y=120&p=-5&f=70`), **codigo QR**, **codigo de embebido** responsive y metadatos Open Graph con imagen de la vista inicial.

### API postMessage del visor embebido

```js
// controlar el visor desde la pagina que lo embebe
iframe.contentWindow.postMessage({ ull360: "goTo", scene: "aula" }, "*");
iframe.contentWindow.postMessage({ ull360: "setView", view: { yaw: 1.2 } }, "*");
iframe.contentWindow.postMessage({ ull360: "setLang", lang: "en" }, "*");
iframe.contentWindow.postMessage({ ull360: "getState" }, "*");
// escuchar eventos
addEventListener("message", (e) => {
  if (e.data?.ull360 === "sceneChange") console.log(e.data.scene);
});
```

## Exportar paquete estatico

**Exportar** genera en tu navegador un ZIP autocontenido (index.html + visor + tour.json + tiles + medios) **sin ninguna dependencia externa**: funciona por FTP en cualquier hosting, con `python -m http.server`, en GitHub Pages o Cloudflare Pages sin configuracion.

Opciones:

- **Idiomas incluidos** y **resolucion maxima de tiles** (para reducir peso).
- **Incluir/excluir descargas** de PDF e imagenes.
- **Analitica**: endpoint propio configurable o desactivada.
- **Service worker offline**: PWA instalable, ideal para museos y kioscos sin red.
- **HTML unico**: todo inline en base64 para tours pequenos (funciona abriendo el fichero directamente).
- **SCORM 1.2 / 2004**: paquete para LMS con reporte de finalizacion y puntuacion.
- **Kiosko**: autopilot + reinicio por inactividad + bloqueo de salida.

Tambien puedes automatizar la publicacion desde CI con un token de API (`POST /api/v1/projects/{id}/publish`) y recibir webhooks de publicacion.
