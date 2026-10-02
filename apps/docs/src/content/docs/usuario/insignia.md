---
title: La insignia «Hecho con Andarama»
description: Cuándo aparece la insignia en un recorrido publicado, cuándo no y por qué a veces parece que va y viene.
---

La insignia es un enlace pequeño, «Hecho con Andarama», sobre los controles de
la esquina inferior derecha del visor. No tapa el panorama, sigue los colores
del recorrido y se ve también en pantalla completa.

## Cuándo sale

| Dónde se publica | ¿Insignia? |
|---|---|
| andarama.com con **Andar**, **Aula** o **Paseo** | Sí |
| andarama.com durante la **prueba gratuita** | Sí |
| andarama.com con **Excursión**, **Formación** o **De por vida** | No: incluyen marca blanca |
| **Paquete exportado** (ZIP, HTML único, SCORM) | Nunca |
| **Instalación propia** (escritorio, Docker, Cloudflare) | Nunca |

## Se decide al publicar

La insignia se fija **en el momento de publicar**, con el plan que tengas
entonces. Si cambias de plan, **vuelve a publicar** el recorrido para que
aparezca o desaparezca: los recorridos ya publicados conservan lo que se
decidió en su día.

Eso explica los casos en que parece que «a veces sale y a veces no»: dos
recorridos publicados en momentos distintos (por ejemplo, uno durante la prueba
y otro después de contratar un plan con marca blanca) pueden llevarla uno sí y
otro no hasta que se republiquen.

## ¿Se puede cambiar el texto?

Sí. En **Ajustes del tour › Componentes de interfaz**, el campo **Texto de la
insignia** sustituye «Hecho con Andarama» por lo que escribas (hasta 80
caracteres). El enlace no cambia: sigue llevando a andarama.com. Si lo dejas
vacío, sale el texto de serie, traducido al idioma del visitante. Como el
resto de ajustes, se aplica al **volver a publicar**. Más detalles en
[Logotipo, marca de agua y parche de nadir](/docs/usuario/marca/#el-texto-de-la-insignia).

Para que la insignia desaparezca del todo hace falta un plan con marca blanca
(Excursión, Formación o De por vida); en esos planes también se puede servir el
recorrido con [dominio propio](/docs/despliegue/dominios/).

Los detalles técnicos (cómo se guarda en la publicación y a dónde enlaza) están
en [Planes, Clerk y uso razonable](/docs/admin/planes/#la-insignia-hecho-con-andarama).
