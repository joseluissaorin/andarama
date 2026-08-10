# Guía de contribución

Gracias por tu interés en Andarama. Este proyecto es código abierto (EUPL-1.2) y las contribuciones son bienvenidas.

## Preparar el entorno

Requisitos: Node.js >= 20, pnpm >= 10 (y Docker si quieres probar el self-host).

```bash
git clone https://github.com/joseluissaorin/andarama && cd andarama
pnpm install
pnpm build:packages
pnpm dev            # API en http://localhost:8787 (wrangler dev)
pnpm dev:studio     # Studio en http://localhost:5173
```

## Flujo de trabajo

1. Abre un issue describiendo el cambio (o coge uno existente etiquetado `good first issue`).
2. Crea una rama desde `main`: `feat/...`, `fix/...`, `docs/...`.
3. Escribe tests para lo que cambies (`pnpm test`); los flujos críticos tienen E2E en Playwright.
4. `pnpm lint && pnpm typecheck && pnpm test` deben pasar antes del PR.
5. Abre el PR; la CI despliega una preview y ejecuta la batería completa.

## Estructura

Consulta el [README](README.md) para el mapa del monorepo. Reglas de oro:

- Ningún módulo de dominio importa APIs de Cloudflare directamente: todo pasa por `packages/adapters`.
- El formato `tour.json` es el contrato central; cualquier cambio requiere versión nueva + migrador en `packages/schema`.
- El visor (`packages/viewer`) no depende de ningún framework de UI; la skin (`packages/viewer-ui`) usa Web Components.
- Sin emojis en la interfaz: iconografía SVG (lucide) exclusivamente.

## Traducciones

Las cadenas del visor viven en `packages/viewer-ui/src/i18n/*.json` y las del Studio en `apps/studio/src/i18n/*.json`. Para contribuir un idioma nuevo, copia `es.json`, tradúcelo y añádelo al índice del idioma correspondiente.

## Código de conducta

Se aplica el [Contributor Covenant v2.1](https://www.contributor-covenant.org/es/version/2/1/code_of_conduct/). Sé amable; sé riguroso con el código, no con las personas.
