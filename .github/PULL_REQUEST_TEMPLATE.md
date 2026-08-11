## Qué cambia

<!-- El cambio y el porqué, en dos líneas. Enlaza el issue si existe: «Cierra #12». -->

## Cómo se ha probado

<!-- Cuenta también lo que miraste en el navegador, no solo lo que pasó en verde. -->

- [ ] `pnpm lint` y `pnpm typecheck`
- [ ] `pnpm test` (unitarias)
- [ ] `pnpm --filter @andarama/studio build && pnpm test:e2e` (el Studio se recompila antes: las E2E sirven `dist-root`)
- [ ] Verificado en un navegador de verdad, si toca el visor o el Studio

## Lista de control

- [ ] Prosa en español, con tildes y eñes, y la raya bien usada
- [ ] Sin emojis en la interfaz: iconos SVG
- [ ] Cadenas nuevas en los diccionarios `es` y `en`
- [ ] Si cambia `tour.json`: versión nueva del esquema y migrador en `packages/schema`
- [ ] Documentación actualizada en `apps/docs` si el cambio la afecta
- [ ] Acepto publicar esta contribución bajo la EUPL-1.2
