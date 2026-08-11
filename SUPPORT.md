# Dónde preguntar

Andarama lo mantiene una persona con la ayuda de quien pasa por aquí. Para que tu pregunta llegue al sitio correcto:

| Lo que traes | Dónde va |
|---|---|
| «No entiendo cómo se hace X» | [Documentación](https://docs.andarama.com) primero; si no está o no se entiende, abre una [pregunta](https://github.com/joseluissaorin/andarama/discussions) en Discussions. |
| «Esto no funciona como debería» | [Informe de error](https://github.com/joseluissaorin/andarama/issues/new?template=error.yml), con pasos para reproducirlo. |
| «Falta esto otro» | [Propuesta](https://github.com/joseluissaorin/andarama/issues/new?template=propuesta.yml). |
| «La documentación dice algo incorrecto» | [Aviso de documentación](https://github.com/joseluissaorin/andarama/issues/new?template=documentacion.yml) o directamente un PR. |
| «He encontrado un fallo de seguridad» | **No abras un issue**: [SECURITY.md](SECURITY.md). |
| «Quiero usar Andarama en mi institución y necesito ayuda» | Escribe a jl@joseluissaorin.com. |

## Antes de abrir nada

Comprueba la versión con la que trabajas (`git rev-parse --short HEAD` o la que sirva tu instancia) y si el problema sigue en `main`. Si puedes, incluye:

- Navegador y sistema, y si el problema es del **Studio**, del **visor** o de la **API**.
- Los pasos exactos, en orden, para que le pase a otra persona.
- Un `tour.json` mínimo que lo reproduzca (se descarga desde Exportar) o el enlace a un tour público donde se vea.
- Lo que dice la consola del navegador, si dice algo.

Un informe con eso dentro se arregla en horas; uno que dice «no va» se queda esperando.

## Tiempos

Esto no es un producto con soporte contratado: no hay compromiso de respuesta. En la práctica los errores reproducibles se miran pronto, las propuestas dependen de si encajan con hacia dónde va el proyecto, y los avisos de seguridad tienen prioridad sobre todo lo demás.
