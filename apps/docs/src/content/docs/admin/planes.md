---
title: Planes, cuentas con Clerk y uso razonable
description: Cómo funciona la instancia alojada de andarama.com, qué compra cada plan y por qué el plan gratuito es instalárselo en casa.
---

Andarama es de código abierto bajo EUPL-1.2. **El plan gratuito es montárselo en casa**: quien despliega la aplicación en su servidor o en su cuenta de Cloudflare no tiene cuotas de plan, no paga nada y usa exactamente el mismo programa. Esta página explica la otra opción: dejar que la instancia de referencia, [andarama.com](https://andarama.com), lo cuide por ti.

## Los planes de andarama.com

| Plan | Precio | Recorridos | Medios |
|---|---|---|---|
| **Andar** | 2 $ al mes | 1 | 5 GB |
| **Paseo** | 20 $ al mes | hasta 100 | 50 GB |
| **Excursión** | 500 $ al año | hasta 500 | 100 GB |
| **De por vida** | 1000 $, una sola vez | hasta 1000 | 200 GB |

Todos los planes son de **proyectos limitados** y están sujetos a una **política de uso razonable**: los límites están pensados para una persona o un equipo pequeño. Si el uso deja de parecerse a eso (revendedores, automatizaciones que crean y borran recorridos en bucle, bibliotecas de medios que no son de nadie), hablamos antes de cortar nada.

La pasarela cobra en dólares estadounidenses porque Clerk Billing todavía no admite otras monedas; el banco aplica el cambio. Los impuestos dependen del país de quien compra.

## Cómo se aplica la cuota

- La cuota de una organización la fija **el plan de quien responde de ella** (la persona que la creó). Los colaboradores invitados no necesitan plan propio para editar.
- Al cambiar de plan, el token de sesión trae el plan nuevo y la cuota se actualiza en la siguiente petición. La página **Plan** del Studio fuerza ese refresco al volver de la pasarela.
- Sin plan de pago no se puede crear ningún recorrido; lo demás (mirar, editar lo compartido, exportar) sigue funcionando.
- El administrador de la instancia no se cobra a sí mismo: su cuota es la que fija en la organización, como en el self-host.
- Un plan se puede **conceder a mano** desde el panel de administración (`PATCH /api/v1/admin/users/:id` con `planOverride`): sirve para cortesías, transferencias bancarias o el plan vitalicio si alguien lo paga por otra vía. Lo concedido a mano manda sobre lo que diga Clerk.

## Qué hace Clerk y qué no

Con Clerk delante, la instancia cierra sus cuentas propias: registro, contraseña, verificación en dos pasos, passkeys y correos de acceso los lleva Clerk; el SSO OIDC propio y el TOTP dejan de ofrecerse. Los datos (usuarios, organizaciones, recorridos, medios) siguen viviendo en la base de datos de Andarama: Clerk solo aporta la llave y el cobro. La primera vez que alguien entra con Clerk se le crea su cuenta local y su organización; si ya existía una cuenta con ese correo, se enlaza.

Los tokens personales de API (`andarama_...`) siguen funcionando igual en los dos modos.

## Activarlo en una instancia propia

No hace falta para el self-host, pero cualquiera puede repetir el montaje:

1. Crea una aplicación en [Clerk](https://dashboard.clerk.com) y activa **Billing para usuarios** (`clerk enable billing --for users` con la CLI de Clerk). Conecta una cuenta de Stripe.
2. Define los planes con los slugs `andar`, `paseo`, `excursion` y `vitalicio` (este último como pago único, `is_recurring: false`). Los slugs son lo que el servidor lee del claim `pla` del token; los precios y los textos son libres.
3. Define las variables de entorno:

| Variable | Descripción |
|---|---|
| `CLERK_PUBLISHABLE_KEY` | Clave publicable; el Studio la recibe de `/api/v1/config` |
| `CLERK_SECRET_KEY` | Clave secreta; verifica los tokens y consulta el perfil al dar de alta |
| `CLERK_JWT_KEY` | Opcional. Clave pública PEM para verificar sin red |
| `CLERK_AUTHORIZED_PARTIES` | Opcional. Orígenes admitidos separados por comas; por defecto, la URL pública y su subdominio `app.` |

4. Aplica la migración `0007_clerk_billing` (el arranque en Node y `pnpm deploy:cloudflare` lo hacen solos).

Con las dos primeras variables definidas la instancia pasa a modo Clerk; sin ellas, sigue con sus cuentas propias.
