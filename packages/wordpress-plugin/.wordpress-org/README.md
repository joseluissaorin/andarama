# Assets del directorio de wordpress.org

Estos ficheros van a la carpeta `assets/` del repositorio SVN del plugin (`https://plugins.svn.wordpress.org/andarama-360/assets/`), no dentro del plugin. Los nombres son los que exige wordpress.org.

## Icono

| Fichero | Medida | Uso |
|---|---|---|
| `icon.svg` | cualquiera (vectorial) | Preferente; wordpress.org lo usa si existe. |
| `icon-256x256.png` | 256 × 256 px | Pantallas retina. |
| `icon-128x128.png` | 128 × 128 px | Listados. |

`icon-256.svg` es el logo de Andarama (`apps/studio/public/logo-andarama.svg`) con el `viewBox` original y tamaño declarado de 256 px. Para SVN cópialo como `icon.svg`. Los PNG se generan con:

```bash
rsvg-convert -w 256 -h 256 icon-256.svg -o icon-256x256.png
rsvg-convert -w 128 -h 128 icon-256.svg -o icon-128x128.png
```

## Banner

| Fichero | Medida | Uso |
|---|---|---|
| `banner-1544x500.png` | 1544 × 500 px | Retina (obligatorio si se quiere nitidez). |
| `banner-772x250.png` | 772 × 250 px | Estándar. |

Se admite `.jpg` en vez de `.png`. `banner.svg` es la fuente; los PNG se generan con:

```bash
rsvg-convert -w 1544 -h 500 banner.svg -o banner-1544x500.png
rsvg-convert -w 772 -h 250 banner.svg -o banner-772x250.png
```

Colores de marca: amarillo `#ffd900`, naranja `#ff8a00`, tinta `#33260f`, papel `#f7f2e7`.

## Capturas de pantalla

Nombres `screenshot-1.png`, `screenshot-2.png`… en el orden de la sección `== Screenshots ==` del `readme.txt` (la leyenda de cada una sale de ahí). Medida recomendada: 1280 × 800 px (o 2560 × 1600 para retina); PNG o JPG; sin límite fijo, pero con el mismo ancho todas.

Pendientes de hacer (con wp-env y un tour real):

1. `screenshot-1.png`: el bloque «Andarama 360 Tour» con la vista previa en el editor.
2. `screenshot-2.png`: panel lateral del bloque (URL, proporción, alto, título accesible).
3. `screenshot-3.png`: un tour embebido en una entrada, con los controles de VR y pantalla completa visibles.
4. `screenshot-4.png`: Ajustes → Andarama.
5. `screenshot-5.png`: el editor de Andarama (app.andarama.com) con un tour abierto.

## Subida

```bash
svn co https://plugins.svn.wordpress.org/andarama-360 svn-andarama-360
cp icon.svg icon-*.png banner-*.png screenshot-*.png svn-andarama-360/assets/
cd svn-andarama-360 && svn add --force assets && svn ci -m "Assets del directorio"
```

Los cambios en `assets/` se publican al momento, sin nueva versión del plugin.
