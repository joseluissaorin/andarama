# Guia de contribucion

Gracias por tu interes en ULL360. Este proyecto es codigo abierto (EUPL-1.2) y las contribuciones son bienvenidas.

## Preparar el entorno

Requisitos: Node.js >= 20, pnpm >= 10 (y Docker si quieres probar el self-host).

```bash
git clone https://github.com/ull/ull360 && cd ull360
pnpm install
pnpm build:packages
pnpm dev            # API en http://localhost:8787 (wrangler dev)
pnpm dev:studio     # Studio en http://localhost:5173
```

## Flujo de trabajo

1. Abre un issue describiendo el cambio (o coge uno existente etiquetado `good first issue`).
2. Crea una rama desde `main`: `feat/...`, `fix/...`, `docs/...`.
3. Escribe tests para lo que cambies (`pnpm test`); los flujos criticos tienen E2E en Playwright.
4. `pnpm lint && pnpm typecheck && pnpm test` deben pasar antes del PR.
5. Abre el PR; la CI despliega una preview y ejecuta la bateria completa.

## Estructura

Consulta el [README](README.md) para el mapa del monorepo. Reglas de oro:

- Ningun modulo de dominio importa APIs de Cloudflare directamente: todo pasa por `packages/adapters`.
- El formato `tour.json` es el contrato central; cualquier cambio requiere version nueva + migrador en `packages/schema`.
- El visor (`packages/viewer`) no depende de ningun framework de UI; la skin (`packages/viewer-ui`) usa Web Components.
- Sin emojis en la interfaz: iconografia SVG (lucide) exclusivamente.

## Traducciones

Las cadenas del visor viven en `packages/viewer-ui/src/i18n/*.json` y las del Studio en `apps/studio/src/i18n/*.json`. Para contribuir un idioma nuevo, copia `es.json`, traducelo y anadelo al indice del idioma correspondiente.

## Codigo de conducta

Se aplica el [Contributor Covenant v2.1](https://www.contributor-covenant.org/es/version/2/1/code_of_conduct/). Se amable; se riguroso con el codigo, no con las personas.
