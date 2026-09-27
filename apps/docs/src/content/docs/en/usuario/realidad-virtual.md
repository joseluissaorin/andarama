---
title: Virtual reality (WebXR)
description: View Andarama tours on Meta Quest, Pico, Vive or Vision Pro headsets, using your hands as controllers.
---

Any Andarama tour works in a VR headset with nothing to install: open the
tour's URL in the headset browser and tap **VR mode**. No app, no store, no
separate version of the tour. It is the same `tour.json` that is already
published.

## What you need

| Requirement | Details |
| --- | --- |
| A WebXR headset | Meta Quest 2, 3, 3S and Pro (Meta Quest Browser), Pico 4, HTC Vive (Wolvic/Firefox Reality), Vision Pro (Safari), any SteamVR setup with Chrome or Edge |
| HTTPS | WebXR **only** works in secure contexts: `https://` or `localhost`. A tour served over `http://` or opened from `file://` falls back to cardboard mode |
| A user gesture | The immersive session has to be started by a tap: the viewer's **VR mode** button |
| iframe permissions | If the tour is embedded, the iframe needs `allow="xr-spatial-tracking"` |

If the browser does not expose WebXR (regular Android and iOS phones), the same
button switches to **cardboard mode**: split screen, gyroscope tracking and
gaze selection. It works with cardboard viewers and phone-based headsets
without WebXR.

## Hands

Andarama uses the WebXR hand tracking module. When hand tracking is on in the
headset, both hands appear inside the tour, drawn with their **25 joints** (the
hierarchy defined by the spec: wrist plus five fingers with metacarpal,
phalanges and tip). There is nothing to set up: if the headset reports hands,
you see hands; if not, you see controllers.

- **Point**: a thin ray comes out of each hand. When it crosses a hotspot, the
  ray shortens to meet it, turns Andarama purple and the hotspot grows a
  little.
- **Pinch**: touching thumb and index finger triggers whatever you are
  pointing at. The threshold has hysteresis (it closes below 22 mm and does
  not reopen until 32 mm), so there is no flicker and no double triggering.
- **Touch**: with a panel open, you can press it directly with your index
  fingertip, no ray needed, once your finger is within 45 mm of the surface.
- The left-hand palm pinch is reserved by the system for the headset menu, so
  Andarama does not use it.

Joints are read with `XRFrame.fillPoses` and `fillJointRadii`, which resolve
all 25 poses of a hand in a single call; if the browser does not implement
them, the viewer falls back to `getJointPose` one joint at a time.

## Controllers

With controllers (Touch, Pico, Index) the behavior is the same: a pointing ray
from the controller, and the trigger or select button to activate. A small
sphere is also drawn at the grip position as a spatial reference. Hands and
controllers coexist: you can put the controllers down mid-tour and carry on
with your hands, or the other way around.

## What you can do inside the headset

Every hotspot in the tour appears in VR, not just navigation. Each one is drawn
as a floating icon with its label, six meters from the visitor, and behaves
like this:

| Hotspot | In VR |
| --- | --- |
| Navigation | Jumps to the target scene with a fade; the panorama reloads without leaving the session |
| Text, tooltip | Immersive panel with formatted text, scrolled with the panel's arrows |
| Image | Panel with the image fitted, caption included |
| Gallery | Panel with previous/next and a counter |
| Video (file) | Plays in the panel with a progress bar and pause button |
| Audio | Panel with transport controls and the transcript, if there is one |
| Quiz | Tappable options, answer check and explanation; the score counts exactly as outside VR |
| Comparison | Divider you drag with a pinch |
| Link, state, polygon | Run their action directly (variable change, zone activation) |
| PDF, web, form, embedded video, 3D model | Show a card with the title and address, plus an **Open after VR** button: when the session ends, the viewer opens that content in a tab |

The last four are kept out of the headset on purpose: a PDF, a form with
Turnstile or a YouTube `iframe` cannot be composited into an immersive session
without degrading the experience and breaking the browser's isolation. Instead
of pretending they work, the viewer parks them and opens them when you exit.

Panels are drawn with Canvas 2D and uploaded as a texture: there is no DOM
inside the session and no external dependencies, so they work exactly the same
in a published tour and in an exported `.zip` package.

## In exported packages

VR travels inside the `.zip`. The standard package carries the same engine as
the published tour, so the **VR mode** button shows up and works, with one
condition: **it has to be served over HTTPS**.

The standard package needs a server, any server: it does not work by
double-clicking `index.html`, because the browser blocks modules and panoramas
loaded from `file://`. For a quick local test, `python3 -m http.server` in the
folder is enough; for real VR you need HTTPS. The **Single HTML file** option
does open with a double click, but then WebXR is not available (`file://` is
not a secure context) and the viewer goes into cardboard mode. See
[Export](/docs/en/usuario/exportar/).

The `LEEME.md` file that comes with every package is a reminder of this, and
the included `.htaccess` adds the MIME types and cache headers a typical shared
host needs.

## Cardboard mode in detail

A cardboard viewer is held **in landscape**: if the phone is in portrait, a
prompt asks you to rotate it, and the viewer tries to lock the orientation
where the browser allows it (Safari does not).

- Orientation is computed from the device quaternion, compensating for the
  screen angle, so the scene keeps the horizon level as you turn the phone and
  follows the tilt of your head.
- The **physical button** on cardboard viewers taps the screen: a tap instantly
  triggers whatever is in focus, without waiting for the dwell time.
- On iOS you have to accept the motion and orientation permission; without it,
  tracking never arrives and the scene stays still.

## Closing a panel

Every open panel has a close button (an X) in its top right corner, reachable
with any of the three ways of pointing:

- **Hands**: aim the ray and pinch, or touch the X with your index fingertip.
- **Controllers**: aim and pull the trigger.
- **No controllers or hands** (cardboard or gyroscope): look at the X and hold
  your gaze until the ring fills.

Panels always open in front of where your head is facing, so the X sits about
twenty degrees to the right: a short turn, not a contortion.

## What can be triggered inside: set per tour

Under **Tour settings › Headsets and cardboard**:

- **Hotspots available in VR**: all of them, navigation only, or pick them one
  by one. In detailed mode you switch them on and off by family (Content,
  Audiovisual, Learning) or type by type. Navigation can never be turned off:
  without it the tour would be a still photo.
- **Gaze dwell time**: how many seconds you have to hold your gaze on a marker
  for it to trigger by itself. The default is 2.5 s.

An open house tour might want visitors to just walk around in the headset and
read the content later on screen; a lab walkthrough might want the exact
opposite. Same scene, different settings.

## No controller: the gaze reticle

With the phone's gyroscope or in cardboard mode you cannot tap anything: you
look at the screen, you do not touch it. As soon as either mode is active, a
**dot appears in the center** with a **ring that draws itself** while you hold
your gaze on a marker; when it completes, the marker is triggered.

In the flat viewer the reticle has two behaviors, and the second is what makes
it genuinely usable:

- **While looking at the panorama**, the reticle stays in the center: turning
  the phone moves the scene, so centering a marker is aiming at it.
- **With a panel open**, the panel is fixed on the screen, and a fixed reticle
  would never reach its X. So the reticle becomes a **cursor your head drags**
  across the screen: about ten degrees to the right and fifteen up is enough
  to reach the close button.

Holding your gaze on something already triggered does not repeat it: you have
to look away and come back. The ring also resets if you change targets or if
your head moves more than about six degrees, so a shaky hand does not ruin it.

It works with all seventeen hotspot types, not just navigation, and the
duration is the tour's gaze dwell time setting.

## When embedding a tour

The code generated by the Studio already includes the permissions you need:

```html
<iframe
  src="https://andarama.com/t/my-tour"
  style="width:100%;aspect-ratio:16/9;border:0"
  allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking"
  allowfullscreen
  title="My tour"
></iframe>
```

Without `xr-spatial-tracking` the VR button appears but the session never
starts: the embedded document has no permission to request it. See
[Embed a tour](/docs/en/usuario/embeber/).

## Performance

Inside the session, the panorama is rendered as a single-texture
equirectangular sphere (2048 px on a side for multiresolution tours), not as a
tile mosaic: in a headset a stable texture beats progressive loading, which is
much more noticeable in stereo. Tours with 360 video upload the current frame
to the texture on every pass.

Tips for a comfortable tour in a headset:

- Fewer than 25 hotspots per scene; with more, the scene is hard to read at six
  meters.
- Short labels: the icon reserves the width of its label, and a long title
  turns into a huge sign.
- 360 video at 4096 × 2048 at most if the tour will be viewed on a Quest 2.

## Accessibility

- VR mode is never required: all content is available in the flat viewer and
  in the text-only **accessible version**.
- There is no free movement through the scene, only teleporting between
  scenes: the navigation style least likely to cause motion sickness.
- Pinch selection does not require holding a pose: it triggers on close, not
  on hold.
- Gaze selection requires no pressing at all: no controller, no buttons, no
  touching the screen. The dwell time can be set per tour.

## Troubleshooting

**The VR button does nothing.** Check that the address starts with `https://`.
An exported tour opened with a double click cannot work: upload it to a web
host.

**It goes into split screen instead of the headset.** The browser has no WebXR
or the session was rejected: that is the cardboard fallback.

**I see the controllers but not my hands.** Hand tracking is turned off in the
headset settings. Andarama requests `hand-tracking` as an optional feature so
the session starts anyway.

**It will not enter VR inside an iframe.** `allow="xr-spatial-tracking"` is
missing.

**The ray does not reach a hotspot.** Hotspots are placed by yaw and pitch at a
fixed distance; if two are very close together, move them apart in the editor.

## Motion permission on iPhone and iPad

Safari only allows reading the gyroscope if the page is served over **HTTPS**
and the permission is requested during a tap, so the prompt appears when you
tap **VR mode**. If you say no, or the prompt never shows up, cardboard mode
shows an **Allow motion** button to ask again. If it still does not appear,
turn it on under **Settings › Safari › Motion & Orientation Access** and open
the tour again.
