---
title: "Tutorial: tu primer tour"
---

Este tutorial crea un tour de tres escenas con navegación, un panel informativo, un quiz y publicación. Tiempo estimado: 15 minutos. Los medios de ejemplo (tres panoramas CC BY 4.0) están en el repositorio (`examples/`).

## 1. Proyecto y escenas

1. **Nuevo tour**: "Campus de Guajara".
2. **Añadir escena**: "Entrada del campus"; en "Elegir panorama" sube `entrada-campus.jpg`. El navegador generará los tiles (verás la barra de progreso).
3. Repite con "Pasillo central" y "Aula Magna".
4. En cada escena rellena el **texto alternativo** (el aviso de validación de la esquina inferior te lo recordará).

## 2. Navegación

1. Con "Entrada del campus" seleccionada, pulsa **Navegación** en el panel derecho y haz clic sobre la puerta del pasillo en el panorama.
2. En el panel del hotspot: destino "Pasillo central", orientación de entrada "Mirar hacia atrás", etiqueta "Ir al pasillo".
3. Crea los enlaces de vuelta y hacia el Aula Magna. Comprueba en la pestaña **Grafo** que no queda ninguna escena huérfana.

## 3. Contenido

1. En la entrada, añade un hotspot de **Texto** con Markdown de bienvenida.
2. En el Aula Magna, añade un **Quiz**: "¿En qué campus estamos?" con tres opciones y feedback.
3. Fija la **vista inicial** de cada escena con "Usar vista actual".

## 4. Idiomas

En **Traducciones**, añade `en` y traduce título, etiquetas y textos (o exporta el CSV, tradúcelo y vuélvelo a importar). El selector de idioma aparecerá automáticamente en el visor.

## 5. Publicar

**Publicar** con visibilidad "Público". Abre la URL, prueba la navegación, el menú de escenas, el modo accesible y el deep link (gira la vista y copia la URL: al abrirla se restaura exactamente).

## 6. Exportar

**Exportar** con "Service worker offline" activado y sirve el ZIP descomprimido con `python -m http.server`: el tour funciona idéntico sin la plataforma.
