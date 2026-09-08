---
title: Ejecutable de escritorio
description: Andarama en un solo fichero para macOS, Windows y Linux, sin Docker, sin Node y sin cuenta de nadie.
---

La manera más corta de tener Andarama en casa: un solo fichero que se ejecuta con doble clic. Dentro van el servidor, el Studio, el visor y esta documentación; fuera solo quedan tus datos, en una carpeta de tu usuario. Es el mismo programa que el self-host con Docker, sin nada que instalar.

## Descargar y arrancar

Los ejecutables se publican en las [releases de GitHub](https://github.com/joseluissaorin/andarama/releases), cada uno en un ZIP con su suma SHA-256 en `SHA256SUMS.txt`.

| Sistema | Fichero |
|---|---|
| macOS con chip Apple (M1 en adelante) | `andarama-macos-arm64` |
| macOS con Intel | `andarama-macos-x64` |
| Windows 10 u 11, 64 bits | `andarama-windows-x64.exe` |
| Linux x64 (Ubuntu, Debian, Fedora…) | `andarama-linux-x64` |
| Linux ARM64 (Raspberry Pi 4 o 5, servidores ARM) | `andarama-linux-arm64` |

Al arrancar, el programa:

1. Crea la carpeta `Andarama` en tu carpeta personal (`~/Andarama` en macOS y Linux, `C:\Users\tú\Andarama` en Windows) con la base de datos, los medios y una copia de seguridad automática antes de cada migración.
2. Escucha en `http://localhost:8788`.
3. Abre el Studio en tu navegador. La primera cuenta que se cree será la administradora de la instancia.

Para parar, cierra la ventana de terminal o pulsa Ctrl+C. Los datos se quedan en la carpeta.

### macOS

La primera vez, macOS puede decir que el programa no se puede abrir porque no lo ha verificado. Botón derecho sobre el fichero, «Abrir», y confirmar. Si el fichero viene de una descarga y no tiene permiso de ejecución, en el Terminal:

```bash
chmod +x andarama-macos-arm64
./andarama-macos-arm64
```

### Windows

SmartScreen puede pedir confirmación («Más información» → «Ejecutar de todas formas»). Se abre una ventana de consola con la dirección y el registro del servidor; hay que dejarla abierta mientras se use.

### Linux

```bash
chmod +x andarama-linux-x64
./andarama-linux-x64
```

## Ajustes por variables de entorno

Las mismas que el self-host, todas opcionales:

| Variable | Descripción |
|---|---|
| `DATA_DIR` | Carpeta de datos (por defecto `~/Andarama`) |
| `PORT` | Puerto (por defecto `8788`) |
| `PUBLIC_URL` | URL pública si se sirve detrás de un proxy con TLS |
| `APP_SECRET` | Secreto de instancia; si no se da, se genera una vez y se guarda en `secreto.txt` dentro de la carpeta de datos |
| `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` | Correo transaccional (sin él, los correos salen por consola) |
| `ANDA_NO_BROWSER=1` | No abrir el navegador al arrancar |

Ejemplo, con otro puerto y sin abrir el navegador:

```bash
PORT=9000 ANDA_NO_BROWSER=1 ./andarama-macos-arm64
```

## Qué cambia respecto al self-host con Docker

- El motor es [Bun](https://bun.sh) en vez de Node, y la base de datos es el SQLite integrado de Bun. El esquema, las migraciones y el fichero `andarama.db` son idénticos: una carpeta de datos del ejecutable se puede llevar a Docker y al revés.
- El troceado de panoramas en servidor (la CLI `anda-tile`, que necesita `sharp`) no viaja dentro del ejecutable. No hace falta: el Studio trocea en el navegador. Si algún trabajo llega a la cola del servidor, queda anotado con su motivo en el panel de administración.
- No hay Caddy ni TLS automático: es para el propio ordenador o para una red local. Para exponerlo a Internet, mejor Docker o Cloudflare.

## Compilarlo desde el código

Hace falta [Bun](https://bun.sh) 1.4 o posterior. Desde la raíz del repositorio:

```bash
pnpm install
pnpm build:desktop                      # los cinco sistemas
bun run apps/desktop/build.ts macos-arm64 windows-x64   # o solo algunos
```

Los ejecutables salen en `apps/desktop/dist/`. Bun compila para los demás sistemas desde cualquiera de ellos; en macOS, firmar con `codesign` y el fichero `apps/desktop/entitlements.plist` evita el aviso de Gatekeeper.
