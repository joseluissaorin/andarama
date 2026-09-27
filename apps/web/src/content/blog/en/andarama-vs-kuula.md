---
title: "Andarama vs Kuula: what changes when the software is open source"
description: "Kuula is the photographers' 360 platform: free to start, $24 a month for Pro. Andarama is open source and hosted from $2. An honest comparison."
lang: en
slug: andarama-vs-kuula
cluster: competidores
translationOf: andarama-vs-kuula
fecha: 2026-09-27
autor: jose-luis-saorin
plantilla: vs
competidor: kuula
faq:
  - q: "How much does Kuula cost in 2026?"
    a: "Basic is free with up to 300 posts. Pro is $24 a month or $240 a year. Business is $48 a month or $432 a year. Checked on Kuula's pricing page on 27 September 2026."
  - q: "Can I download a Kuula tour and host it on my own site?"
    a: "You can embed it with a code, but we found no plan that lets you download the tour as a package to host outside Kuula."
  - q: "Is there a Kuula alternative with quizzes and SCORM?"
    a: "Yes. Andarama has graded quizzes with a passing score, a final report and a PDF certificate, escape rooms, and SCORM 1.2 and 2004 packages on the Training plan or when self-hosted."
  - q: "Does Andarama publish to Google Street View?"
    a: "Not yet. If Street View publishing is a must for you, Kuula is the better choice."
---

Kuula has been the easy answer to "what do I use for a 360 tour?" for years. Its free plan is genuinely useful, the editor makes sense in ten minutes, and a huge community of photographers publishes panoramas there. If you are looking for a Kuula alternative, it is usually for one of three reasons: the price once you have more than a couple of tours, the feeling that your tours live in someone else's house, or because you need something Kuula doesn't do (graded quizzes, SCORM, training). Full disclosure: Andarama is ours. We'll say where Kuula wins, too.

> **Hosted Andarama starts at $2 a month for one tour, or $20 a month for ten.** [Start your free 14-day trial, no credit card](https://app.andarama.com/register?plan=paseo).

## What each one is

**Kuula** is a cloud service: you upload photos, build the tour in its editor and publish it on kuula.co or embed it on your site. Nothing to install, and no version you can run on your own server.

**Andarama** is open-source software (EUPL-1.2 license) that does the same job, and you can use it two ways: install it yourself (desktop app, Docker or your own Cloudflare account) for free with no subscription, or let us host it at andarama.com. It's the same app either way; there is no stripped-down edition.

## Prices, as of today

Kuula, checked on [its pricing page](https://kuula.co/page/pricing) on 27 September 2026:

- **Basic**: free. Up to 300 posts and 100 uploads a month, with Kuula branding and no tour editor.
- **Pro**: $24 a month, or $20 a month billed yearly ($240). Tour editor, your logo instead of Kuula's, audio and custom hotspot icons, up to 100,000 posts.
- **Business**: $48 a month, or $36 a month billed yearly ($432). Custom domain, multiple logos, password-protected tours, unlimited posts.

Andarama (full details on our [pricing page](/en/pricing/)):

- **Self-hosted**: $0. The whole program on your computer or server, no tour limit.
- **Andar**: $2 a month for 1 tour and 5 GB.
- **Aula** (classroom): $42 a year for 5 tours and 10 GB. Students play quizzes and escape rooms without an account.
- **Paseo**: $20 a month or $200 a year for 10 tours and 50 GB.
- **Excursión**: $500 a year for 500 tours and 100 GB, no badge, custom domain.
- **Formación** (training): $99 a month or $990 a year for 100 tours, SCORM packages, white label and custom domain.
- **Lifetime**: $1,000 once, 1,000 tours and 200 GB.

The honest read: if you publish lots of tours and just want a nice viewer with your logo, Kuula Pro at $240 a year and Andarama Paseo at $200 a year cost about the same. The difference shows at the edges. A single tour costs $2 a month on Andarama and $20 on Kuula. Hundreds of tours with your own brand cost $500 a year on Andarama against $432 on Kuula Business, but Kuula doesn't offer graded quizzes or SCORM at any price. And self-hosted, Andarama costs nothing.

## What happens to your tours when you stop paying

This is where we think the comparison stops being about price. On Kuula we found no plan that lets you download a tour as a package and host it elsewhere; its Export Editor tunes the share link and embed code, it doesn't generate files. The tour exists as long as Kuula exists and your account is active.

On Andarama, export is part of the product on every plan: a static ZIP with the HTML, the viewer and the tiles that you can upload to any web host; a single HTML file you can open from a USB stick; and an offline PWA for kiosks and classrooms without Wi-Fi. The `tour.json` format is documented and versioned. We say it often and we'll say it here: your tours keep working even if Andarama disappears. The details are in the [publishing docs](https://docs.andarama.com/en/usuario/publicar/).

## Editor and viewer

Kuula wins on simplicity. Its editor is linear and comfortable, and for a photographer who wants to upload twenty panoramas and link them, it's hard to beat.

Andarama's editor is bigger because it does more: a graph draws the map of the tour and every arrow is a hotspot; the direction you face when you enter a room depends on the path you took; there is version history, team comments, presence when several people edit, and side-by-side translations. Seventeen hotspot types (text, image, gallery, video projected on a wall, spatial audio, PDF, 3D model, form, before/after slider, quiz, polygon, treasure and more) against Kuula's basics. It takes a bit longer to learn, and it goes a lot further.

Both viewers are good. Andarama adds projections (little planet, fisheye, Panini), a compass with true north, floor plans with a radar, 360 video with timed hotspots, and spatial audio that turns with your head.

## Virtual reality

Both have a VR mode. Kuula supports headsets and cardboard viewers. Andarama does real WebXR: hand tracking with pinch gestures, controllers with a pointer ray, and panels (text, gallery, video, quiz, slider) drawn inside the session, so a tour with questions can be completed without taking the headset off. Exported tours keep VR. See the [VR docs](https://docs.andarama.com/en/usuario/realidad-virtual/).

## Teaching and training

Here there is no real contest, and we say it without bragging: Kuula isn't built for the classroom. Andarama ships graded quizzes with a passing score, attempts, a final report and a PDF certificate; scavenger hunts and escape rooms built with gates and state variables; live guided tours in which the class follows the teacher in their own browsers; and SCORM 1.2 and 2004 packages to send scores to Canvas, Moodle or Blackboard (Training plan or self-hosted). LTI 1.3 is in testing. Students never need an account, which matters when your district asks about FERPA and COPPA. Our [classroom page](/en/classroom/) and [digital escape room guide](/en/blog/digital-escape-room/) show what that looks like.

## Street View and community

Kuula publishes directly to Google Street View, and its photographer community is a real way to get your panoramas seen. Andarama doesn't publish to Street View (yet) and has no social network around it. If that's what you're after, Kuula remains the better choice.

## Data and privacy

Andarama's visitor analytics use no cookies and store no IP addresses: visits, scenes and hotspots in aggregate, and that's it. Self-hosted, the data stays on your server. Kuula's Business plan advertises detailed analytics through Google Analytics; we couldn't confirm how its visitor analytics work on the other plans, so the table leaves that field blank.

## So, which one?

- **Kuula**, if you're a photographer who wants to publish fast, cares about Street View and the community, and doesn't mind your tours living on its cloud.
- **Andarama**, if you want the software (and your tours) in your hands, pay for a single tour, teach or run training, need SCORM, or simply prefer software that is open source and auditable. If you're weighing other options too, see our list of [Matterport alternatives](/en/blog/matterport-alternatives/).

Both can be tried for free: Kuula with its Basic plan, Andarama with fourteen days and no card, or by installing it, which never expires.

> **Try Andarama for 14 days, free and without a card.** One complete tour with VR and export included; then from $20 a month for 10 tours. [Create your account](https://app.andarama.com/register?plan=paseo).
