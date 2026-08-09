---
title: Medios y tiles
---

## Formatos admitidos

| Tipo | Formatos | Notas |
|---|---|---|
| Panorama 360 | JPEG, PNG, WebP, AVIF | Equirectangular 2:1; deteccion automatica por metadatos XMP (GPano) o relacion de aspecto |
| Imagen / plano | JPEG, PNG, WebP, GIF, AVIF, SVG | Los SVG se sanean en el servidor |
| Video | MP4 (H.264/H.265), WebM (VP9/AV1) | Ver preajustes recomendados mas abajo |
| Audio | MP3, AAC/M4A, OGG, WAV | WAV se transcodifica en self-host si hay ffmpeg |
| PDF | | Visor integrado con paginacion y zoom |
| Modelo 3D | glTF/GLB (preferente), OBJ, STL | AR opcional en moviles |
| Subtitulos | WebVTT | Para video 360 y hotspots de video |

La validacion comprueba el **tipo real** del fichero (magic bytes), no solo la extension. Existe deduplicacion automatica por hash de contenido: subir dos veces el mismo fichero no consume cuota extra.

## Como funciona el troceado (tiles)

Al subir un panorama, **tu propio navegador** genera la piramide de tiles (equirectangular a caras de cubo a niveles de zoom a tiles WebP de 512 px) usando la GPU en un proceso en segundo plano, y los sube directamente al almacenamiento con URLs prefirmadas. Puedes seguir editando mientras tanto; si cierras la pestana, la subida pendiente se reanuda al volver (cola local persistente).

Si la imagen supera la capacidad del dispositivo (mas de 16K de ancho en la mayoria), se genera una version al limite del dispositivo y se encola un trabajo para que el **contenedor de procesado** genere la resolucion completa (hasta 32K).

## Utilidades de imagen

En las propiedades del medio puedes aplicar ediciones **no destructivas** que se hornean al regenerar los tiles: nivelado de horizonte (roll/pitch), rotacion del punto cero (yaw), parche de nadir con logo y ajustes basicos de exposicion y saturacion.

## Video: preajustes recomendados de ffmpeg

```bash
# 4K H.264 progresivo compatible universal
ffmpeg -i entrada.mp4 -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 160k salida-4k.mp4

# Renditions para seleccion automatica
ffmpeg -i entrada.mp4 -vf scale=3840:1920 ... salida-4k.mp4
ffmpeg -i entrada.mp4 -vf scale=1920:960  ... salida-2k.mp4
```

En el despliegue Cloudflare puede activarse **Cloudflare Stream** (transcodificacion y HLS adaptativo automaticos) configurando `STREAM_ACCOUNT_ID` y `STREAM_API_TOKEN`.
