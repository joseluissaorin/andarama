---
title: "Virtual museum tour: how to make one and what it costs"
description: "What a 360 virtual museum tour needs: photography, pinned labels, audio guide, languages, kiosk mode and accessibility. Costs by line item and software."
lang: en
slug: virtual-museum-tour
cluster: verticales
translationOf: visita-virtual-museo
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "How much does a virtual museum tour cost?"
    a: "It depends mostly on the photography. With your own camera and staff, software can cost nothing (Andarama self-hosted) or a few hundred dollars a year hosted; with a professional photographer for twenty galleries, their day rate is the bulk of the budget. Matterport adds yearly fees per space."
  - q: "Do we need a 3D model like Matterport's?"
    a: "Not for a tour people walk through, read and listen to. Well-shot 360 photos with text, audio and high-resolution artworks do the job better at a fraction of the cost. 3D makes sense for measurements or architectural documentation."
  - q: "Can we run it on a screen inside the museum?"
    a: "Yes. Kiosk mode tours the museum on its own, lets any visitor take over, and starts again after a minute of inactivity. The PWA package also works offline."
  - q: "Will the tour still work ten years from now?"
    a: "With Andarama, yes: the tour exports as a static package that runs on any web server without the platform behind it, the tour.json format is documented, and the software is open source."
---

A **virtual museum tour** is built from 360 photos of the galleries, text and audio pinned next to each work, a floor plan so visitors know where they are, versions in your visitors' languages, and a way to publish it on the museum's website and on a screen in the lobby. Photography drives almost the entire cost: software can run from zero (open source, installed on your own server) to a few hundred dollars a year hosted, while Matterport, the option most people mention first, charges yearly fees per space and doesn't let you take the tour with you. This guide walks through the line items, timelines and decisions, with honest numbers.

If you'd rather learn by doing, you can [start a free 14-day trial](https://app.andarama.com/register?plan=paseo) (no credit card) and build two galleries while you read.

## What a virtual museum tour should include

Before talking money, it helps to know what you're buying. A tour that works, meaning people stay longer than two minutes, has:

- **A clear route**: gallery by gallery, with arrows where the doorways are and a floor plan showing the visitor's position.
- **Pinned content**: the label next to the painting, not in a separate menu. Short text, a high-resolution image with zoom, the audio guide track.
- **Artworks up close**: for a canvas, a manuscript or an altarpiece, a 2D gigapixel scene with map-style zoom is worth more than the 360 photo of the room.
- **Languages**: at least the ones your regular visitors speak (English and Spanish are a common pair in the US), with a switcher in the viewer.
- **Accessibility**: a text version a screen reader can navigate, visible focus, and no animations for people who prefer reduced motion.
- **Two outlets**: the museum website (embedded) and, if the budget allows, a lobby screen in kiosk mode.
- **Data**: how many people visit, which galleries they see and how long they stay, without cookies or consent banners.

Andarama covers all of this out of the box: panorama, 360 video and 2D gigapixel scenes; seventeen hotspot types; translations per scene and per hotspot; an accessible text version; kiosk mode; cookie-free analytics. Publishing options are described in the [publishing documentation](https://docs.andarama.com/en/usuario/publicar/).

## How it's done, step by step

1. **Photography.** One 360 photo per viewpoint: one or two for a small gallery, three or four for a large one. With a mid-range 8K camera on a monopod, an experienced photographer can shoot twenty to forty panoramas in a day, with controlled lighting and no visitors.
2. **Artworks.** Pieces that deserve zoom are photographed separately at high resolution and added as gigapixel scenes.
3. **Assembly.** Upload the photos (the 360 camera importer creates all the scenes at once and places them on the floor plan), connect the galleries in the tour graph, and set the arrival direction for each one.
4. **Content.** Labels as text hotspots, the audio guide as audio hotspots (or scene narration), documents as PDFs, and the before-and-after slider for a restoration.
5. **Languages.** In Translations, add languages and translate the text, or export a CSV for your translation vendor and import it back.
6. **Publishing.** A public link, embed code for the museum website, a social card showing the first gallery and, if you like, a custom domain (`tour.yourmuseum.org`).
7. **In-gallery screen.** The same tour in kiosk mode. For screens without a network connection, the PWA package works offline.

A small museum (eight galleries, forty highlighted works, two languages) takes one person one to two weeks, photography included.

## What it costs, line by line

These figures are ballpark numbers for the US in 2026 and vary a lot by city and vendor; they're meant to show where the money goes.

| Line item | In-house | With professionals |
|---|---|---|
| 360 photography | A mid-range camera (a few hundred dollars, reusable) and a staff day | A specialized photographer's day rate, negotiated per day or per panorama |
| High-resolution artwork photography | The museum's own camera | A cultural heritage photographer |
| Text, audio, translation | Museum staff | Voice talent and a translation vendor, per word or per minute |
| Software (editing and publishing) | $0 installed on the museum's server | Hosted: from $2 a month (one tour) up to $500 a year (Excursión: no badge, custom domain) |
| Kiosk screen | A TV plus a mini PC or tablet with a browser | Installation and support |
| Maintenance | Update text and photos when exhibitions change | Support contract |

The item nobody budgets for, and the most expensive one: **staff time** to write labels, record audio and review translations. Software is the smallest line. The full plan list is on the [pricing page](/en/pricing/).

For comparison, Matterport, which many museums look at first, bills yearly by the number of active spaces, and the tour only works hosted in its cloud; the numbers we could gather are in [how much Matterport costs](/en/blog/matterport-pricing/), with notes on what we couldn't verify. For a tour people read and listen to, you don't need the 3D model.

## Choosing software: the questions that matter

- **Can you take the tour with you?** A museum outlasts any vendor. With Andarama, the tour exports as a static ZIP that runs on any server, the `tour.json` format is documented, and the software is open source (EUPL-1.2). If the vendor disappears, your tour doesn't.
- **Where does the data live?** Andarama's analytics don't use cookies or store IP addresses; installed on the museum's own server, nothing leaves it. That suits public institutions that would rather not show a consent banner (and European partners working under GDPR).
- **Can it be embedded on the museum site?** With a web component or an iframe, and with the [WordPress plugin](/en/wordpress/) if your site runs on WordPress.
- **Does it work on a lobby screen?** Kiosk mode, plus an offline PWA.
- **What about headsets?** The same link opens VR mode on Meta Quest, Pico or Vision Pro, with nothing to install; useful for a VR corner or for bringing the museum to a school.
- **Who maintains it?** The Cloudflare install fits in the free tier and the Docker install is a single file; for teams that don't want to maintain anything, there's the hosted plan. Our [page for museums](/en/museums/) sums up the options, including self-hosting with support.

## Two common mistakes

**Shooting with visitors around and on an ordinary day's lighting.** A virtual tour is seen for years; it deserves a closed morning, lights on and clean display cases.

**Dumping the entire website into the tour.** Virtual visitors read less than in-person ones. Three-line labels, a thirty-second audio clip, a link to the full record for those who want more. Andarama offers seventeen types of content; you don't need all of them in every gallery.

## Where to start

With two galleries and ten works you can test the whole workflow in an afternoon: the [getting started guide](https://docs.andarama.com/en/usuario/primeros-pasos/) explains the steps. If your museum belongs to a university, a city or a county and prefers its own instance, the same software installs on your servers for free; universities in particular will find the details in our [virtual campus tour guide](/en/blog/virtual-campus-tour/), and archives and special collections in the [library virtual tour guide](/en/blog/library-virtual-tour/). When you're ready, [open a free trial](https://app.andarama.com/register?plan=paseo) and shoot your first gallery.
