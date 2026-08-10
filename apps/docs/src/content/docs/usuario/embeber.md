---
title: Embeber un tour
description: Insertar un tour publicado en cualquier página HTML con el web component o un iframe.
---

Un tour publicado se puede insertar en cualquier página web, campus virtual o gestor de contenidos.

## Web component (recomendado)

Pega estas dos líneas en cualquier HTML:

```html
<script src="https://TU-INSTANCIA/embed.js"></script>
<ull360-tour slug="mi-tour" title="Mi tour virtual"></ull360-tour>
```

El componente crea el iframe por ti (con pantalla completa, giroscopio y WebXR permitidos) y ocupa el ancho disponible con proporción 16/9. Atributos:

| Atributo | Uso |
|---|---|
| `slug` | Slug del tour publicado en la instancia del script |
| `src` | URL completa del tour (alternativa a `slug`, para otra instancia o dominio propio) |
| `aspect` | Proporción, por ejemplo `4/3` o `21/9` (por defecto `16/9`) |
| `title` | Título accesible del iframe |

## Iframe clásico

```html
<iframe
  src="https://TU-INSTANCIA/t/mi-tour"
  style="width:100%;aspect-ratio:16/9;border:0;"
  allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking"
  allowfullscreen
  title="Mi tour virtual"></iframe>

El atributo `allow` es el que habilita la realidad virtual dentro del iframe:
sin `xr-spatial-tracking` el botón **Modo VR** aparece pero la sesión no
arranca, porque el documento incrustado no tiene permiso para pedirla. La
página que embebe debe servirse además por HTTPS. Véase la
[guía de realidad virtual](/docs/usuario/realidad-virtual/).
```

Ambos fragmentos aparecen listos para copiar en **Compartir** dentro del editor.

## API postMessage

El tour embebido acepta y emite mensajes para integraciones avanzadas:

```js
// Controlar el tour
iframe.contentWindow.postMessage({ ull360: "goTo", scene: "sala-2" }, "*");
iframe.contentWindow.postMessage({ ull360: "setView", view: { yaw: 1.2, pitch: 0 } }, "*");
iframe.contentWindow.postMessage({ ull360: "setLang", lang: "en" }, "*");
iframe.contentWindow.postMessage({ ull360: "getState" }, "*");

// Escuchar sus eventos
window.addEventListener("message", (e) => {
  if (e.data?.ull360 === "sceneChange") console.log("Escena:", e.data.scene);
  if (e.data?.ull360 === "viewChange") console.log("Vista:", e.data.view);
  if (e.data?.ull360 === "quizChange") console.log("Quiz:", e.data.state);
});
```

## Restricción de dominios

Si el tour se publica con visibilidad **Dominios**, solo podrá embeberse desde los dominios de la lista (se aplica con `frame-ancestors` y comprobación de `Referer`).
