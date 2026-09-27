# Andarama 360 Virtual Tours (plugin de WordPress)

Plugin que embebe recorridos virtuales 360 de [Andarama](https://andarama.com) (de andarama.com o de cualquier instancia propia) en un sitio WordPress. Es un canal de distribución: el directorio de wordpress.org es un buscador y «virtual tour» tiene pocos resultados serios.

- Slug y text domain: `andarama-360`.
- Licencia del plugin: GPL-2.0-or-later (la que exige wordpress.org). El servidor Andarama sigue siendo EUPL-1.2.
- Sin dependencias ni build: PHP 7.4+, WordPress 6.0+, un JS y dos CSS vanilla.

## Qué hace

| Vía | Cómo |
|---|---|
| Bloque «Andarama 360 Tour» | Categoría *Insertar*; campo de URL, proporción, alto y título accesible; vista previa en el editor. |
| Pegar la URL | Una URL `https://andarama.com/t/mi-tour` en un párrafo vacío se convierte en el visor (manejador registrado con `wp_embed_register_handler`). |
| Shortcode | `[andarama url="https://andarama.com/t/mi-tour" height="480" ratio="16/9" title="…" badge="yes"]`. Sirve en el editor clásico, widgets, Elementor, Divi, etc. |
| Ajustes → Andarama | Lista de instancias permitidas (andarama.com por defecto), alto y proporción por defecto, insignia «Crea el tuyo en Andarama». |

El iframe se pinta siempre con `allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking"`, `allowfullscreen`, `loading="lazy"` y título accesible. Solo se embeben URLs cuyo host esté en la lista de instancias permitidas y cuya ruta sea `/t/{slug}`.

## Estructura

```
andarama-360/
├── andarama-360.php            Cabecera del plugin y carga de clases
├── uninstall.php               Borra la opción al desinstalar
├── includes/
│   ├── class-andarama-360-settings.php   Ajustes (Settings API)
│   ├── class-andarama-360-embed.php      Shortcode, manejador de embed, HTML del iframe
│   └── class-andarama-360-block.php      Registro del bloque
├── block/
│   ├── block.json              Metadatos del bloque
│   ├── block.js                Editor, con wp.element.createElement (sin JSX)
│   └── editor.css
├── assets/andarama-360.css     Estilos del front
├── languages/                  .pot, es_ES.po/.mo y JSON para el JS
└── readme.txt                  Ficha de wordpress.org
```

## Probarlo en local con wp-env

Hace falta Docker (Docker Desktop, Colima u OrbStack) y Node 20+. El fichero `.wp-env.json` está en la carpeta padre (`packages/wordpress-plugin/`) y monta este plugin ya activado sobre PHP 7.4, la versión mínima que declaramos.

```bash
cd packages/wordpress-plugin
npx @wordpress/env start          # http://localhost:8888  (admin / password)
```

Comprobaciones rápidas desde la terminal:

```bash
# Entrada con shortcode y comprobación del iframe en el HTML servido
ID=$(npx wp-env run cli wp post create --post_status=publish --post_title="Tour" \
  --post_content='[andarama url="https://andarama.com/t/mi-tour" ratio="4/3"]' --porcelain)
curl -s "http://localhost:8888/?p=$ID" | grep -o '<iframe[^>]*>'

# Entrada con la URL pegada a pelo (manejador de embed)
ID=$(npx wp-env run cli wp post create --post_status=publish --post_title="Pegada" \
  --post_content='https://andarama.com/t/mi-tour' --porcelain)
curl -s "http://localhost:8888/?p=$ID" | grep -c 'andarama-360__frame'

# Entrada con el bloque
ID=$(npx wp-env run cli wp post create --post_status=publish --post_title="Bloque" \
  --post_content='<!-- wp:andarama-360/tour {"url":"https://andarama.com/t/mi-tour","ratio":"1/1"} /-->' --porcelain)
curl -s "http://localhost:8888/?p=$ID" | grep -o '<figure[^>]*>'
```

Para probar el bloque en el editor entra en http://localhost:8888/wp-admin/ (usuario `admin`, contraseña `password`), crea una entrada y añade «Andarama 360 Tour» o pega la URL de un tour en un párrafo.

```bash
npx @wordpress/env stop            # parar
npx @wordpress/env destroy         # borrar los contenedores y la base de datos
```

## Traducciones

Los textos del código van en inglés (es lo que espera wordpress.org); el español está en `languages/andarama-360-es_ES.po`. Para regenerar tras cambiar cadenas (requiere WP-CLI y gettext):

```bash
cd packages/wordpress-plugin/andarama-360
wp i18n make-pot . languages/andarama-360.pot --slug=andarama-360 --exclude=README.md
# actualizar el .po a mano o con msgmerge:
msgmerge --update languages/andarama-360-es_ES.po languages/andarama-360.pot
msgfmt -o languages/andarama-360-es_ES.mo languages/andarama-360-es_ES.po
wp i18n make-json languages --no-purge     # JSON para las cadenas del JS del editor
```

Una vez el plugin esté en wordpress.org, las traducciones pasan a gestionarse en translate.wordpress.org (GlotPress) y los ficheros de `languages/` quedan como respaldo.

## Publicar en wordpress.org

1. **Cuenta y solicitud.** Con una cuenta de wordpress.org, enviar el plugin en https://wordpress.org/plugins/developers/add/ como ZIP (`cd packages/wordpress-plugin && zip -r andarama-360.zip andarama-360 -x '*/README.md' '*/.distignore'`). El equipo de revisión responde por correo, normalmente en unos días; la primera revisión suele pedir cambios (prefijos, escapado, sanitización). Este plugin ya sigue las normas: todo prefijado con `andarama_360_`, `esc_*` en toda salida, saneado de todas las entradas, nonce en ajustes vía Settings API, `manage_options` para la página.
2. **SVN.** Aprobado el plugin, dan acceso a `https://plugins.svn.wordpress.org/andarama-360/`:
   ```bash
   svn co https://plugins.svn.wordpress.org/andarama-360 svn-andarama-360
   cd svn-andarama-360
   rsync -a --delete --exclude README.md --exclude .distignore ../andarama-360/ trunk/
   cp ../.wordpress-org/*.png ../.wordpress-org/*.svg assets/     # icono, banner, capturas
   svn add --force trunk assets
   svn cp trunk tags/1.0.0
   svn ci -m "Version 1.0.0" --username USUARIO
   ```
   El `Stable tag` del `readme.txt` debe coincidir con la carpeta de `tags/`. Cada versión nueva: actualizar versión en la cabecera y en `readme.txt` (Stable tag y Changelog), subir a `trunk/`, crear el `tags/x.y.z`.
3. **Assets del directorio.** Icono, banner y capturas van en la carpeta `assets/` del SVN (no dentro del plugin). Medidas y nombres en `../.wordpress-org/README.md`.
4. **Página del plugin.** https://wordpress.org/plugins/andarama-360/ se genera a partir de `readme.txt`. Se puede comprobar el formato antes en https://wordpress.org/plugins/developers/readme-validator/.

## Hooks para integradores

- `andarama_360_settings` (filtro): altera los ajustes en tiempo de ejecución.
- `andarama_360_host_allowed` (filtro, `bool $allowed, string $host`): afina qué hosts se aceptan.
- `andarama_360_embed_html` (filtro, `string $html, string $url, array $args`): HTML final del tour.
- `andarama_360_badge_url` (filtro): destino de la insignia.
