---
title: Medios y tiles
---

## Formatos admitidos

| Tipo | Formatos | Notas |
|---|---|---|
| Panorama 360 | JPEG, PNG, WebP, AVIF | Equirectangular 2:1; detección automática por metadatos XMP (GPano) o relación de aspecto |
| Imagen / plano | JPEG, PNG, WebP, GIF, AVIF, SVG | Los SVG se sanean en el servidor |
| Vídeo | MP4 (H.264/H.265), WebM (VP9/AV1) | Ver preajustes recomendados más abajo |
| Audio | MP3, AAC/M4A, OGG, WAV | WAV se transcodifica en self-host si hay ffmpeg |
| PDF | | Visor integrado con paginación y zoom |
| Modelo 3D | glTF/GLB (preferente), OBJ, STL | AR opcional en móviles |
| Subtítulos | WebVTT | Para vídeo 360 y hotspots de vídeo |

La validación comprueba el **tipo real** del fichero (magic bytes), no solo la extensión. Existe deduplicación automática por hash de contenido: subir dos veces el mismo fichero no consume cuota extra.

## Cómo funciona el troceado (tiles)

Al subir un panorama, **tu propio navegador** genera la pirámide de tiles (equirectangular a caras de cubo a niveles de zoom a tiles WebP de 512 px) usando la GPU en un proceso en segundo plano, y los sube directamente al almacenamiento con URLs prefirmadas. Puedes seguir editando mientras tanto; si cierras la pestaña, la subida pendiente se reanuda al volver (cola local persistente).

Si la imagen supera la capacidad del dispositivo (más de 16K de ancho en la mayoría), se genera una versión al límite del dispositivo y se encola un trabajo para que el **contenedor de procesado** genere la resolución completa (hasta 32K).

## Comprobar un panorama antes de usarlo

En la biblioteca, **pasar el ratón** sobre la miniatura de un panorama lo
muestra como *little planet*: en un vistazo se reconoce la sala, cosa que un
recorte rectangular no permite. Aparece sin espera porque se dibuja a partir
del preview equirect que el teselado ya guarda, sin pedir nada a la red.

**Doble clic** abre el panorama en un visor 360 completo, con arrastre, zoom y
proyecciones, para asegurarse de que es el correcto antes de convertirlo en
escena. No crea nada: es solo una comprobación.

## Llevar medios al tour

Los panoramas se pueden **arrastrar** desde la biblioteca hasta el editor:

- Sobre la **lista de escenas**, cada uno se convierte en una escena nueva.
- Sobre el **grafo**, además, el nodo nace donde lo has soltado.
- Se puede arrastrar uno, una **selección múltiple** o una **carpeta entera**.

El nombre del fichero se convierte en el título de la escena, sin extensión ni
guiones bajos.

## Carpetas

La biblioteca se filtra por carpeta. Con varias carpetas aparece el selector, y
la carpeta activa se puede arrastrar entera al editor.

## Utilidades de imagen

En las propiedades del medio puedes aplicar ediciones **no destructivas** que se hornean al regenerar los tiles: nivelado de horizonte (roll/pitch), rotación del punto cero (yaw), parche de nadir con logo y ajustes básicos de exposición y saturación.

## Vídeo: preajustes recomendados de ffmpeg

```bash
# 4K H.264 progresivo compatible universal
ffmpeg -i entrada.mp4 -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 160k salida-4k.mp4

# Renditions para selección automática
ffmpeg -i entrada.mp4 -vf scale=3840:1920 ... salida-4k.mp4
ffmpeg -i entrada.mp4 -vf scale=1920:960  ... salida-2k.mp4
```

En el despliegue Cloudflare puede activarse **Cloudflare Stream** (transcodificación y HLS adaptativo automáticos) configurando `STREAM_ACCOUNT_ID` y `STREAM_API_TOKEN`.
