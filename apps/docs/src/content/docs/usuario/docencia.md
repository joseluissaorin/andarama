---
title: "Docencia: quiz, LTI y SCORM"
---

## Quizzes y gamificacion

- Cada hotspot de **quiz** define pregunta, tipo (unica/multiple/V-F), opciones, feedback, puntos, intentos y **compuerta** (no permite avanzar hasta acertar).
- En Ajustes del tour: puntuacion minima para aprobar, aleatorizacion, informe final y **certificado de finalizacion** (PDF con el nombre del participante).
- **Busqueda del tesoro**: lista de objetivos a encontrar con progreso visible.
- **Variables de estado**: los hotspots de contador/estado permiten puertas que se abren, cambio dia/noche, rutas condicionadas, etc.
- Las narraciones pueden **bloquear la navegacion** hasta terminar (util en practicas guiadas).

## LTI 1.3 (Aula Virtual / Moodle)

ULL360 es una herramienta LTI 1.3 Advantage con **Deep Linking** (el docente elige el tour desde Moodle) y **Assignment and Grade Services** (la puntuacion del quiz vuelve al libro de calificaciones).

Configuracion (administrador de la instancia, panel Administracion, pestana LTI):

1. En Moodle: Administracion del sitio, Plugins, Herramientas externas, "configurar una herramienta manualmente":
   - URL de la herramienta e **Initiate login URL**: `https://tu-instancia/api/v1/lti/login`
   - **Redirection URI**: `https://tu-instancia/api/v1/lti/launch`
   - **JWKS URL**: `https://tu-instancia/api/v1/lti/jwks`
   - Servicios: activar IMS LTI Assignment and Grade Services y Deep Linking.
2. En ULL360: registra la plataforma con el Issuer de Moodle, Client ID, Auth URL (`/mod/lti/auth.php`), Token URL (`/mod/lti/token.php`) y JWKS (`/mod/lti/certs.php`).
3. El docente anade una actividad de herramienta externa y selecciona el tour via Deep Linking (o fija `custom.tour = slug`).

Cuando el alumnado completa el quiz dentro del tour lanzado desde Moodle, la puntuacion se envia automaticamente via AGS.

## SCORM

Para LMS sin LTI, exporta el tour como **paquete SCORM 1.2 o 2004 (3rd Ed.)**. El paquete reporta:

- `completion_status` al visitar todas las escenas (o completar el quiz).
- `score.raw/min/max` (y `success_status` segun la puntuacion minima configurada).
