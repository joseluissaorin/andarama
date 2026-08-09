---
title: "Tutorial: tu primer tour"
---

Este tutorial crea un tour de tres escenas con navegacion, un panel informativo, un quiz y publicacion. Tiempo estimado: 15 minutos. Los medios de ejemplo (tres panoramas CC BY 4.0) estan en el repositorio (`examples/`).

## 1. Proyecto y escenas

1. **Nuevo tour**: "Campus de Guajara".
2. **Anadir escena**: "Entrada del campus"; en "Elegir panorama" sube `entrada-campus.jpg`. El navegador generara los tiles (veras la barra de progreso).
3. Repite con "Pasillo central" y "Aula Magna".
4. En cada escena rellena el **texto alternativo** (el aviso de validacion de la esquina inferior te lo recordara).

## 2. Navegacion

1. Con "Entrada del campus" seleccionada, pulsa **Navegacion** en el panel derecho y haz clic sobre la puerta del pasillo en el panorama.
2. En el panel del hotspot: destino "Pasillo central", orientacion de entrada "Mirar hacia atras", etiqueta "Ir al pasillo".
3. Crea los enlaces de vuelta y hacia el Aula Magna. Comprueba en la pestana **Grafo** que no queda ninguna escena huerfana.

## 3. Contenido

1. En la entrada, anade un hotspot de **Texto** con Markdown de bienvenida.
2. En el Aula Magna, anade un **Quiz**: "En que campus estamos?" con tres opciones y feedback.
3. Fija la **vista inicial** de cada escena con "Usar vista actual".

## 4. Idiomas

En **Traducciones**, anade `en` y traduce titulo, etiquetas y textos (o exporta el CSV, traducelo y vuelvelo a importar). El selector de idioma aparecera automaticamente en el visor.

## 5. Publicar

**Publicar** con visibilidad "Publico". Abre la URL, prueba la navegacion, el menu de escenas, el modo accesible y el deep link (gira la vista y copia la URL: al abrirla se restaura exactamente).

## 6. Exportar

**Exportar** con "Service worker offline" activado y sirve el ZIP descomprimido con `python -m http.server`: el tour funciona identico sin la plataforma.
