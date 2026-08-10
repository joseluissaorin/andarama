---
title: "Docencia: quiz, LTI y SCORM"
---

## Quizzes y gamificación

- Cada hotspot de **quiz** define pregunta, tipo (única/múltiple/V-F), opciones, feedback, puntos, intentos y **compuerta** (no permite avanzar hasta acertar).
- En Ajustes del tour: puntuación mínima para aprobar, aleatorización, informe final y **certificado de finalización** (PDF con el nombre del participante).
- **Búsqueda del tesoro**: lista de objetivos a encontrar con progreso visible.
- **Variables de estado**: los hotspots de contador/estado permiten puertas que se abren, cambio día/noche, rutas condicionadas, etc.
- Las narraciones pueden **bloquear la navegación** hasta terminar (útil en prácticas guiadas).

## LTI 1.3 (Aula Virtual / Moodle)

ULL360 es una herramienta LTI 1.3 Advantage con **Deep Linking** (el docente elige el tour desde Moodle) y **Assignment and Grade Services** (la puntuación del quiz vuelve al libro de calificaciones).

Configuración (administrador de la instancia, panel Administración, pestaña LTI):

1. En Moodle: Administración del sitio, Plugins, Herramientas externas, "configurar una herramienta manualmente":
   - URL de la herramienta e **Initiate login URL**: `https://tu-instancia/api/v1/lti/login`
   - **Redirection URI**: `https://tu-instancia/api/v1/lti/launch`
   - **JWKS URL**: `https://tu-instancia/api/v1/lti/jwks`
   - Servicios: activar IMS LTI Assignment and Grade Services y Deep Linking.
2. En ULL360: registra la plataforma con el Issuer de Moodle, Client ID, Auth URL (`/mod/lti/auth.php`), Token URL (`/mod/lti/token.php`) y JWKS (`/mod/lti/certs.php`).
3. El docente añade una actividad de herramienta externa y selecciona el tour vía Deep Linking (o fija `custom.tour = slug`).

Cuando el alumnado completa el quiz dentro del tour lanzado desde Moodle, la puntuación se envía automáticamente vía AGS.

## SCORM

Para LMS sin LTI, exporta el tour como **paquete SCORM 1.2 o 2004 (3rd Ed.)**. El paquete reporta:

- `completion_status` al visitar todas las escenas (o completar el quiz).
- `score.raw/min/max` (y `success_status` según la puntuación mínima configurada).
