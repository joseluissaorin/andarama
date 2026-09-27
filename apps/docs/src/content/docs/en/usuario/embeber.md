---
title: Embed a tour
description: Put a published tour on any HTML page with an iframe or the web component, and control it with postMessage.
---

A published tour can be embedded in any website, LMS or content management
system.

## Iframe or web component?

Both put the tour inside another page and show exactly the same thing.

- The **embed code** (an iframe) is the universal option: it works anywhere
  that accepts HTML, including Moodle, Canvas, WordPress and Google Sites.
- The **web component** does the same with a shorter tag, `<anda-tour>`, that
  sizes itself to the right aspect ratio. Only use it if you control the page's
  HTML and can add a `<script>`: many LMS editors and content management
  systems strip scripts when you save.

For Moodle, with step-by-step instructions and the SCORM option for grades, see
[Add to Moodle](/docs/en/usuario/moodle/).

## Web component

Paste these two lines into any HTML:

```html
<script src="https://YOUR-INSTANCE/embed.js"></script>
<anda-tour slug="my-tour" title="My virtual tour"></anda-tour>
```

The component creates the iframe for you (with full screen, gyroscope and
WebXR allowed) and fills the available width at a 16:9 ratio. Attributes:

| Attribute | Use |
|---|---|
| `slug` | Slug of the tour published on the script's instance |
| `src` | Full URL of the tour (instead of `slug`, for another instance or a custom domain) |
| `aspect` | Aspect ratio, such as `4/3` or `21/9` (default `16/9`) |
| `title` | Accessible title for the iframe |

## Classic iframe

```html
<iframe
  src="https://YOUR-INSTANCE/t/my-tour"
  style="width:100%;aspect-ratio:16/9;border:0;"
  allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking"
  allowfullscreen
  title="My virtual tour"></iframe>
```

The `allow` attribute is what enables virtual reality inside the iframe.
Without `xr-spatial-tracking`, the **VR mode** button shows up but the session
never starts, because the embedded document has no permission to request it.
The host page must also be served over HTTPS. See the
[virtual reality guide](/docs/en/usuario/realidad-virtual/).

Both snippets are ready to copy under **Share** in the editor.

## postMessage API

The embedded tour accepts and emits messages for advanced integrations:

```js
// Control the tour
iframe.contentWindow.postMessage({ andarama: "goTo", scene: "room-2" }, "*");
iframe.contentWindow.postMessage({ andarama: "setView", view: { yaw: 1.2, pitch: 0 } }, "*");
iframe.contentWindow.postMessage({ andarama: "setLang", lang: "en" }, "*");
iframe.contentWindow.postMessage({ andarama: "getState" }, "*");

// Listen for its events
window.addEventListener("message", (e) => {
  if (e.data?.andarama === "sceneChange") console.log("Scene:", e.data.scene);
  if (e.data?.andarama === "viewChange") console.log("View:", e.data.view);
  if (e.data?.andarama === "quizChange") console.log("Quiz:", e.data.state);
});
```

## Domain restriction

If the tour is published with the **Restricted to embed domains** visibility,
it can only be embedded from the domains on the list (enforced with
`frame-ancestors` and a `Referer` check).

## Driving the viewer once it is loaded

The tour page exposes the instance as `window.Andarama.instance`, so an
integrator can act on the viewer without mounting it again:

```js
const { viewer } = window.Andarama.instance;
viewer.setView({ yaw: 1.2, pitch: 0 });
await viewer.goTo("room-2");
viewer.vrState();   // { active, mode, hands, openHotspotId, hotspots }
```

From outside an iframe, use `postMessage` (above); `window.Andarama` is only
available inside the viewer's own document.
