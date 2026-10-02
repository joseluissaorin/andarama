---
title: Publish and share
description: Preview, publish with the right visibility, control the link preview card, export, and run a tour in kiosk mode.
---

## Preview before you publish

The **Preview** tab walks through the whole draft exactly as a visitor will see
it: same hotspots, same minimap, same VR mode, without publishing anything or
touching the live version. The top bar flags anything that would block
publishing.

It is also the easiest place to set arrival views. Preview knows which room
you came from, so when you walk into a room facing a wall, just turn toward
what you want people to see and click **Save as the arrival from…**. Tuning a
thirteen-room tour stops being form-filling and becomes a walk.

## Publish on the platform

**Publish** freezes an immutable version of the tour in storage and serves it
at `/t/{slug}`. The draft stays editable, and visitors do not see changes until
you publish again. You can unpublish, or **republish any earlier version**, from
the Versions tab.

Visibility options:

- **Public**: indexable, included in the sitemap.
- **Unlisted**: link only.
- **Password protected**.
- **Organization users only**: sign-in required.
- **Restricted to embed domains**: an allowlist of domains
  (`frame-ancestors` plus a `Referer` check).

You can also schedule a publish date and set an expiry date.

After publishing you get a public URL with **deep links**
(`#s=scene&y=120&p=-5&f=70&v=1`), a **QR code**, a responsive **embed code** and
Open Graph metadata with an image of the starting view.

### Links to a scene and to a view

While someone looks around the tour, the viewer keeps writing the scene and the
orientation into the address bar. That lets a reload keep the scene, but it
does **not** pin the view: after a reload, the scene opens with its default
view, the one you set in the editor with "Use current view".

The orientation in a link is only applied when it carries the `v=1` marker,
which is what the viewer's **Share** button adds. That way, sharing a link from
the viewer shows exactly what you are looking at, and an ordinary reload never
overrides the view you chose in the editor.

| The link carries… | It opens at… |
|---|---|
| Nothing | The start scene, with its default view |
| `#s=hall` | The `hall` scene, with its default view |
| `#s=hall&y=120&p=-5&f=70&v=1` | The `hall` scene, facing that orientation |

The embed code and the web component are covered in
[Embed a tour](/docs/en/usuario/embeber/), and the steps for your LMS in
[Add to Moodle](/docs/en/usuario/moodle/). Whether the tour shows the Made with
Andarama badge depends on the plan you publish with: see
[The badge](/docs/en/usuario/insignia/).

### The public gallery on andarama.com

On the hosted instance, a **public** tour can also get its own listing page in
the gallery, `andarama.com/explorar/{slug}/`, built so search engines find it
by the name of the place. When publishing, turn on **Show in the public gallery
on andarama.com** and fill in:

- **Listing title**, with the name of the place ("Chicago Cultural Center: 360
  virtual tour").
- **Description**: one paragraph of 300 to 600 characters, in a single
  language.
- **Place and country**, plus **coordinates** if you know them (if the tour
  already has a map, they fill in automatically).
- **Attributions**, if the photos are not yours.

The listing includes the embedded viewer, a full-screen button, the cover
captured at publish time as the social image, structured place data
(`TouristAttraction` or `Place`, with `geo`), and it goes into
`sitemap-tours.xml` with its cover. If you change the visibility to anything
other than public, the listing switches itself off; the text is kept in case
you turn it back on. The index, `andarama.com/explorar/`, can be filtered by
country.

### postMessage API for the embedded viewer

The full reference is in [Embed a tour](/docs/en/usuario/embeber/#postmessage-api).

```js
// control the viewer from the host page
iframe.contentWindow.postMessage({ andarama: "goTo", scene: "classroom" }, "*");
iframe.contentWindow.postMessage({ andarama: "setView", view: { yaw: 1.2 } }, "*");
iframe.contentWindow.postMessage({ andarama: "setLang", lang: "en" }, "*");
iframe.contentWindow.postMessage({ andarama: "getState" }, "*");
// listen for events
addEventListener("message", (e) => {
  if (e.data?.andarama === "sceneChange") console.log(e.data.scene);
});
```

## How the link looks when shared

**Tour settings › Sharing the link** controls the card that appears when
someone pastes the URL into WhatsApp, X, Teams, Slack or your LMS, with a live
preview:

| Field | Purpose |
| --- | --- |
| Card title | Falls back to the tour title if left empty |
| Card text | Two lines: networks truncate |
| Site name | Your organization ("City Museum") |
| Image | 1200 × 630 px. Without one, almost no network shows a large card |
| Image alt text | Accessibility for that image |
| Card type | Large or small image (X/Twitter) |
| Site X account | `@citymuseum` |
| Declared locale | `en_US` |
| No index | Adds `robots noindex`, handy for internal tours |

These fields are translated like any other tour text, so the card comes out in
the language the link is opened with. The same metadata travels inside the
exported package, so a tour uploaded to another host shares just as well.

## Export a static package

**Export** builds, in your browser, a package that runs with no Andarama behind
it: a ZIP for any web host, a single HTML file that opens with a double click,
a version that keeps working offline (PWA/kiosk), or a SCORM package for your
LMS. What each option does, when to use it and its limits are covered in
[Export: ZIP, single HTML, PWA and SCORM](/docs/en/usuario/exportar/).

You can also automate publishing from CI with an API token
(`POST /api/v1/projects/{id}/publish`) and receive publish webhooks.

## Kiosk mode

For a screen in a gallery, a trade show booth or a lobby: the tour explains
itself, and anyone can take over.

- **It chains every guided route**, one after another. It does not stop after
  the first.
- **Each stop is entered the way a visitor would**: through the step that
  links the two scenes, with that step's arrival view. It waits the number of
  seconds set for the stop and, **before changing scene, turns toward the
  door** it is about to go through, so viewers can follow where it is going.
- **When it finishes, it returns to the starting scene** and waits, showing
  "The tour has finished" with a **Watch it again** button. It only loops
  forever if a route has **Loop** turned on (in the canvas, Autopilot mode).
- **Whoever touches the screen takes control**: "You are exploring on your
  own" appears, with a button to go back to the tour. If nobody touches
  anything for a minute, the kiosk returns to the starting scene; with looping
  on, it also starts again by itself.
- **The list of routes** is always at the bottom: tap one to start it.

### How to set it up

There are three ways, and they all end up in the same place:

- **When publishing**, under **How the link opens**, choose **Kiosk mode**. The
  usual address (`/t/your-tour`) then starts in a loop, which is what you need
  when the lobby TV can only open one fixed URL. Republishing without changing
  anything keeps the mode; to undo it, choose **Normal tour**.
- **With the kiosk link**, always at hand in **Share** and on the final publish
  screen: it is the same address with `?kiosk=1`. Use it to put one screen in a
  loop without changing how the link opens for everyone else. It works both
  ways: `?kiosk=0` opens a kiosk-published tour as a normal tour, in case you
  want to share it with someone.
- **When exporting** (**Export › Kiosk mode**), if you want a package that runs
  with no Andarama behind it (and, with the service worker, offline). See
  [Export](/docs/en/usuario/exportar/).
