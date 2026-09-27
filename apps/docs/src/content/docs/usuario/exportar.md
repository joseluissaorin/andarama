---
title: "Exportar: ZIP, HTML único, PWA y SCORM"
description: Qué hace cada opción del diálogo Exportar, cuándo usarla y qué límites tiene.
---

**Exportar** genera en tu navegador un paquete del recorrido que funciona por
su cuenta, sin Andarama detrás: un ZIP que se sube a cualquier alojamiento, un
solo fichero HTML que se abre con doble clic, una versión que sigue funcionando
sin conexión o un paquete SCORM para el aula virtual. La exportación está en
todos los planes de andarama.com y, por supuesto, en cualquier instalación
propia.

Se abre con el botón **Exportar** del editor. Todo el trabajo lo hace tu
navegador: con muchas escenas teseladas puede tardar varios minutos, porque
descarga cada tesela del recorrido.

## El paquete estándar (ZIP)

El ZIP lleva `index.html`, el visor, el `tour.json`, las teselas y los medios,
**sin ninguna dependencia externa**: funciona por FTP en cualquier hosting, con
`python3 -m http.server`, en GitHub Pages o en Cloudflare Pages sin
configuración. No lleva backend, ni CDN, ni llamadas a la plataforma: una vez
subido, el recorrido vive por su cuenta.

Eso sí, hay que **servirlo**, no abrirlo: el paquete estándar no funciona
haciendo doble clic en `index.html` (`file://`), porque el navegador bloquea
desde el sistema de ficheros tanto los módulos JavaScript como los panoramas.
Para verlo en local, `python3 -m http.server` en la carpeta y abrir
`http://localhost:8000`.

El ZIP incluye además un `LEEME.md` con las instrucciones de subida y un
`.htaccess` con los tipos MIME (`.webp`, `.avif`, `.glb`, `.webmanifest`) y las
cabeceras de caché que necesitan los alojamientos compartidos con Apache. Funciona
igual dentro de un subdirectorio (`https://midominio.es/tours/mi-tour/`): todas
las rutas son relativas.

Los paquetes exportados nunca llevan la
[insignia «Hecho con Andarama»](/docs/usuario/insignia/).

## Las opciones, una a una

### Idiomas incluidos y resolución máxima de tiles

Elige qué traducciones del recorrido viajan en el paquete y hasta qué
resolución se incluyen las teselas. Bajar la resolución es la forma más eficaz
de que el paquete pese menos.

### Incluir descargas (PDF, imágenes)

Si está activado, los hotspots de imagen y de PDF muestran un botón para que el
visitante descargue el archivo. Si lo desactivas, el botón desaparece.

:::note
Solo oculta el botón: las imágenes y los PDF siguen dentro del paquete (hacen
falta para verlos), así que el ZIP no pesa menos, y alguien con conocimientos
técnicos puede sacarlos de él.
:::

### Endpoint de analítica propio (opcional)

Si tu centro tiene un servidor que recoge estadísticas, pega aquí su dirección
y el recorrido le enviará las visitas (escenas vistas, hotspots abiertos,
tiempos) en formato JSON, en lotes `{"events": [...]}`. Si lo dejas vacío, el
recorrido exportado no envía ningún dato a nadie. La mayoría de docentes
debería dejarlo vacío.

### Service worker offline (PWA / kiosco)

Añade al paquete lo necesario para que el recorrido funcione sin conexión una
vez abierto por primera vez y se pueda instalar como aplicación. Es útil en un
museo, una feria o un aula sin wifi: se abre una vez con red y después sigue
funcionando aunque se corte. Como todo service worker, necesita que el paquete
se sirva por HTTPS (o desde `localhost`). No tiene efecto si eliges HTML único.

### HTML único (tours pequeños)

Genera un solo archivo `index.html` con el visor y todas las fotos dentro, que
se abre con doble clic sin servidor. Sirve para mandarlo por correo, dejarlo en
una memoria USB o subirlo a un aula virtual que solo admite ficheros sueltos.

- **No hay un límite fijo de escenas**, pero el archivo pesa aproximadamente
  un tercio más que la suma de sus fotos y vídeos, y el navegador lo carga
  entero en memoria. Como orientación, funciona bien **por debajo de unos
  100 MB**, que suelen ser entre 10 y 15 panoramas normales sin vídeo. La cifra
  es una recomendación: el diálogo no avisa al superarla.
- **No está disponible si alguna escena está teselada** (fotos muy grandes):
  el visor calcula las direcciones de las teselas nivel a nivel y no se pueden
  incrustar. Con un recorrido teselado la opción aparece desactivada; usa el
  paquete estándar.
- Al abrirse por `file://` no hay WebXR (no es un contexto seguro) y el modo VR
  entra en modo cartón.

### Paquete SCORM

Genera un ZIP que se sube a Moodle (u otra aula virtual) como actividad SCORM.
El aula virtual registra si el alumno ha completado el recorrido (todas las
escenas vistas o todas las preguntas respondidas) y su nota en los quiz,
comparada con la **Puntuación mínima** de **Ajustes del tour ›
Cuestionarios**. Elige **SCORM 1.2** si tu plataforma es antigua y **2004
(3.ª edición)** en los demás casos.

El paquete reporta:

- `completion_status` al visitar todas las escenas o responder todas las preguntas.
- `score.raw`, `score.min` y `score.max`, y `success_status` según la
  puntuación mínima.

:::caution[Dos condiciones]
- En andarama.com, el paquete SCORM es del **plan Formación**; en los demás
  planes el selector aparece desactivado. En una instalación propia está
  siempre disponible.
- **No lo combines con HTML único.** Con las dos opciones a la vez, el
  adaptador SCORM se empaqueta pero no llega a cargarse y el aula virtual no
  recibe ni la finalización ni la nota. Exporta el SCORM con el paquete
  estándar.
:::

El paquete es una foto fija: si corriges una pregunta, hay que exportar y
subirlo otra vez. Los pasos en Moodle están en
[Insertar en Moodle](/docs/usuario/moodle/).

### Modo kiosco (autopilot + reinicio por inactividad)

El paquete arranca encadenando los recorridos guiados y vuelve a la escena
inicial cuando nadie lo toca. El comportamiento completo del quiosco está en
[Publicar y compartir](/docs/usuario/publicar/#modo-quiosco).

## Realidad virtual en el paquete exportado

El paquete lleva el mismo motor que el tour publicado, así que el botón **Modo
VR** funciona también desde el ZIP, con una condición: **hay que servirlo por
HTTPS**. WebXR solo existe en contextos seguros; abriendo el `index.html` con
doble clic (`file://`) el tour se ve, pero el modo inmersivo cae al respaldo
cartón. Cualquier alojamiento con certificado sirve, incluidos GitHub Pages,
Cloudflare Pages o Netlify, gratuitos. Véase la
[guía de realidad virtual](/docs/usuario/realidad-virtual/).

## Qué opción elegir

| Quiero… | Opción |
|---|---|
| Subirlo a la web del centro o a un hosting | Paquete estándar |
| Mandarlo por correo o abrirlo sin servidor | HTML único (si no hay escenas teseladas y pesa menos de unos 100 MB) |
| Una pantalla de museo o feria sin wifi | Paquete estándar con service worker y modo kiosco |
| La nota en el libro de calificaciones de Moodle | Paquete SCORM, sin HTML único |
| Saber cuántas visitas tiene fuera de Andarama | Endpoint de analítica propio |
