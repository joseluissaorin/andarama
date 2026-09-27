---
title: Getting started
description: Create an account, build and publish your first 360 tour, install the Studio as an app and find your way around the viewer.
---

## Create an account

Open `/studio/` on your instance and click **Create account**. The first person
to sign up automatically becomes the instance administrator. Depending on how
the instance is set up, sign-up can be open, invite-only or limited to
institutional email domains. If the instance has institutional single sign-on
(OIDC), use **Sign in with institutional SSO**.

On [app.andarama.com](https://app.andarama.com), accounts are handled by Clerk
(email code, password or passkey), and creating tours requires a plan or the
free 14-day trial, no credit card needed. The
[desktop app](/docs/en/despliegue/escritorio/) and any self-hosted install have
no plans and no plan quotas.

Every account belongs to one or more **organizations**. Roles are set per
organization:

| Role | Can |
|---|---|
| Administrator | Everything: members, quotas, all projects |
| Editor | Create, edit and publish their own projects and shared ones |
| Collaborator | Edit shared projects (but not publish) |
| Reader | View drafts |

To invite people and split up the work, see
[Working as a team](/docs/en/usuario/equipo/).

## Build your first tour

1. In **Projects**, click **New tour** and give it a title (you can also pick a
   folder or a template).
2. Upload equirectangular panoramas (2:1) in the **Media library**, or straight
   from the editor.
3. Add scenes by picking a panorama for each one.
4. Place hotspots by clicking on the panorama.
5. Click **Publish**. You get a public URL (`/t/your-slug`), a QR code and an
   embed code. See [Publish and share](/docs/en/usuario/publicar/).

## Install the Studio as an app

The Studio is an installable web app. In Chrome, Edge and on Android you will
see **Install the app** in the sidebar (or the install icon in the address
bar). On iPad and iPhone, add it from Safari: **Share → Add to Home Screen**.

Once installed, it opens in its own window without the browser chrome and
starts instantly even on a flaky connection. Your data is never served from a
local copy: only the app shell is cached, never API responses, so you will
never look at a two-hour-old version of a tour thinking it is current. When a
new version is available, the sidebar tells you, and it only updates when you
click, never in the middle of an edit.

## Languages

The Studio speaks 32 languages, the same as the mobile apps: Arabic, Chinese
(Simplified and Traditional), Croatian, Czech, Danish, Dutch, English,
Filipino, Finnish, French, German, Greek, Hebrew, Hungarian, Indonesian,
Italian, Japanese, Korean, Malay, Norwegian, Polish, Portuguese, Romanian,
Russian, Slovak, Spanish, Swedish, Thai, Turkish, Ukrainian and Vietnamese.

It starts in your browser's language, or English if yours is not on the list.
You can switch from the sidebar selector or under **Account › Preferences**,
where each language is listed by its own name. The choice is saved to your
account, so it follows you to any device. In Arabic and Hebrew the interface
runs right to left.

The viewer speaks the same languages: its buttons, notices and help text follow
the tour's language (the tour's default, or whichever the visitor picks in the
language menu). If there is no interface translation for the tour's language,
the viewer falls back to the visitor's browser language. Dictionaries are only
downloaded when needed, so no language adds weight to the initial load.

The tour's own text (titles, descriptions, hotspots) is a separate thing: you
translate it in the editor's **Translations** view, into whichever languages
you choose for each tour.

## Studio keyboard shortcuts

- `Ctrl/Cmd + K`: command palette
- `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z`: undo / redo
- `Ctrl/Cmd + S`: save now (autosave keeps running anyway)

## Viewer controls

Mouse (drag, scroll wheel, double click), touch (one finger, pinch), keyboard
(arrow keys, `+`/`-`, `Tab` through hotspots, `Enter`, `Esc`), the gyroscope on
phones, and **VR mode** with a headset: on a Meta Quest, Pico, Vive or Vision
Pro, just open the tour's URL in the headset browser and tap **VR mode**. Your
hands show up inside the tour and trigger hotspots with a pinch (see the
[virtual reality guide](/docs/en/usuario/realidad-virtual/)).

## On a phone

The button dock can be **collapsed** with the double arrow. On small screens it
starts collapsed to keep the scene clear, and your choice is remembered. You
can also show or hide the **scene thumbnails** from the viewer itself,
regardless of how the tour is configured.
