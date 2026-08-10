---
title: Contribuir
---

ULL360 es código abierto bajo **EUPL-1.2** y las contribuciones son bienvenidas. La guía completa está en [CONTRIBUTING.md](https://github.com/joseluissaorin/ull360/blob/main/CONTRIBUTING.md).

## Resumen

```bash
git clone https://github.com/joseluissaorin/ull360 && cd ull360
pnpm install
pnpm build:packages
pnpm dev:node        # self-host en http://localhost:8788
pnpm dev:studio      # Studio con recarga en http://localhost:5173
pnpm test            # unitarios (Vitest)
pnpm test:e2e        # E2E (Playwright)
```

## Reglas de arquitectura

- Ningún módulo de dominio importa APIs de Cloudflare o Node directamente: todo pasa por `packages/adapters`.
- Cualquier cambio del formato `tour.json` requiere nueva versión del esquema + migrador en `packages/schema`.
- El visor no depende de frameworks de UI; la skin usa Web Components.
- Iconografía exclusivamente SVG (lucide); sin emojis en la interfaz.

## Traducciones

- Visor: `packages/viewer-ui/src/i18n/*.json` (es y en de serie; añade tu idioma copiando `es.json`).
- Studio: `apps/studio/src/i18n/*.json`.

## Seguridad

No abras issues públicos para vulnerabilidades: consulta [SECURITY.md](https://github.com/joseluissaorin/ull360/blob/main/SECURITY.md).
