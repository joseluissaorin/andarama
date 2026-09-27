---
title: "Marzipano: what it is, what it does well and what it lacks"
description: "Marzipano is Google's open-source library for 360 viewers. What it does well, what you have to code yourself, and what Andarama adds on top of it."
lang: en
slug: marzipano
cluster: competidores
translationOf: marzipano
fecha: 2026-09-27
autor: jose-luis-saorin
plantilla: vs
competidor: marzipano
faq:
  - q: "Is Marzipano free?"
    a: "Yes. It's an open-source library under the Apache 2.0 license, with no plans, no accounts and no limits. There's no company selling support; what you get is the code and its documentation."
  - q: "Can I build a tour with Marzipano without coding?"
    a: "With Marzipano Tool, a web app, you upload panoramas and download a static tour with basic navigation. For rich hotspots, multiple languages, quizzes, floor plans or VR you have to write code on top of the library."
  - q: "How is Andarama related to Marzipano?"
    a: "Andarama's 360 engine is built on Marzipano, with our own layers on top (tiling, projections, WebXR, hotspots, spatial audio). Andarama adds the editor, publishing and teaching tools; the exported viewer is still a static file."
  - q: "Does Marzipano support virtual reality?"
    a: "It has no WebXR mode. Its repository has split-screen examples for cardboard viewers, but not an immersive session with hands or controllers. Andarama adds that in its own layer."
---

**Marzipano** is an open-source JavaScript library, released by Google under the Apache 2.0 license, for building 360 photo viewers in the browser. It's fast and lightweight, it handles equirectangular and cube-face panoramas with multiresolution tiling, and it's free with no strings attached. What it isn't: an editor. Anything beyond linking panoramas together means writing code. There's no WebXR virtual reality, no analytics, no quizzes, no SCORM, and no company behind it offering support: its own website says it is not an official Google product, and the [repository](https://github.com/google/marzipano) has been archived since October 2023 (checked on 27 September 2026), so it no longer gets updates. Andarama uses Marzipano as the base of its engine and builds the editor and everything else on top, so the honest comparison is "Marzipano with an editor." That's also why there are cases where plain Marzipano is the better choice.

Full disclosure: Andarama is ours. If you want to see what an editor on top of Marzipano feels like, you can [try Andarama free for 14 days](https://app.andarama.com/register?plan=paseo), no credit card required.

One more caveat before we go on: the Marzipano entry in the comparison table is marked `verificado: false` (unverified). Since there are no plans or prices, there's no pricing page to check, but we noted its capabilities from memory and from the public documentation, not from a recent review. If something has changed, we'd appreciate a heads-up.

## What Marzipano does well

- **It renders panoramas** in WebGL with excellent performance, including cube-face panoramas split into zoom levels (multiresolution). That's what lets you view photos tens of thousands of pixels wide without loading them all at once.
- **A clean API**: scenes, views, geometries, tile sources, and hotspots as HTML elements anchored to a direction. With a bit of JavaScript you can build a custom viewer in an afternoon.
- **No dependencies, no server**: one JS file plus your images. It runs from any static host.
- **Apache 2.0 license**: you can use it in commercial products without having to publish your own code.
- **Marzipano Tool**: a web app for uploading panoramas, placing links between them and downloading a static tour. For a basic tour you don't need to write anything.

Bottom line: if you're a developer and want a 360 viewer inside your own application, Marzipano is one of the best options out there, and it's free.

## What it lacks

This isn't a knock on Marzipano. It's a library, and libraries don't come with editors. But this is what you miss when you try to use it as a product.

| Need | Marzipano | How you solve it |
|---|---|---|
| Visual scene and hotspot editor | No (the Tool only does basic navigation) | Write code, or use a product built on top |
| Text, image, video, audio, PDF and quiz hotspots | Anchoring only; you code the content | Same |
| WebXR virtual reality | No | Same |
| Floor plan, map, compass | No | Same |
| Multiple languages | No | Same |
| Publishing, links, QR codes, social cards | No | Your own server and your own code |
| Analytics | No | Add your own |
| Teaching (graded quizzes, SCORM, LTI) | No | A teaching product |
| Support | Community only; no company behind it | Hire someone who knows the library |

There's also a practical detail: Marzipano releases are few and far between. It works, and it will keep working, because it's static code that doesn't depend on any service. Just don't expect new features.

## Marzipano Tool, up close

The Tool is what most people land on when they search for a "Marzipano tutorial." Here's how it works: you open the web app, drag in your equirectangular photos, create links between them by clicking on the panorama, set the starting view and download a ZIP with the tour: HTML, JS, tiles and data. Upload it to any server and it runs.

What you get: navigation between scenes, info hotspots with a line of text, a scene list, fullscreen, gyroscope support and autorotation. What you don't get: editing the tour later (you either redo it or edit the JSON by hand), content beyond one text per hotspot, languages, floor plans, virtual reality, or any way of knowing who has viewed it.

For a single, simple, free tour that you upload over FTP, it's a good solution. For a project you'll maintain over time, it runs out of road quickly.

## Andarama: Marzipano with an editor (and what's underneath)

Andarama's 360 engine is built **on Marzipano**, with our own layers on top: tiling in the browser, projections (little planet, fisheye, Panini), WebXR with hand tracking and controllers, seventeen hotspot types that also render inside the headset, spatial audio, 360 video and a compass. On top of that sit the graph editor, floor plans, translations, publishing with links and QR codes, cookie-free analytics, graded quizzes with a PDF certificate, escape rooms built with gates and variables, and SCORM 1.2 and 2004 packages. LTI 1.3 exists too, but it's still in testing: for now the grade doesn't flow back to your LMS on its own.

What we kept from Marzipano's spirit is the part that matters: **the exported tour is a static file**. A ZIP with the HTML, the viewer and the tiles that you can upload to any host and that runs with no Andarama behind it, just like a Marzipano Tool tour. The `tour.json` format is documented, and the whole program is open source (EUPL-1.2), so anyone who wants to see how Marzipano is used under the hood can read the code.

The price: free if you self-host (desktop app, Docker or your own Cloudflare account), or hosted from $2 a month. The full breakdown is on our [pricing page](/en/pricing/).

## When to choose plain Marzipano

Be honest with yourself about what you need:

- **You have a dev team and want a viewer inside your own app**, with your own interface and your own data. Go with Marzipano. Andarama would be overkill.
- **You want a permissive license** (Apache) for a closed-source product. Go with Marzipano. Andarama is EUPL, a copyleft license: modifications you distribute have to be shared.
- **One basic tour, free, uploaded over FTP, never touched again.** Marzipano Tool does the job.

## When to choose Andarama

- **You don't want to code** and you'll need to edit the tour more than once.
- **Rich content**: text, zoomable images, video projected onto walls, audio, PDFs, before-and-after sliders, multiple languages.
- **Real virtual reality**, in a headset, with nothing to install.
- **Teaching and training**: graded quizzes, escape rooms, scavenger hunts, SCORM packages for your LMS.
- **Publishing and data**: links, QR codes, embeds, a custom domain, cookie-free analytics.
- **Keeping it yours**: static export and open source, like Marzipano, but with an editor.

If you're weighing other tools too, we've compared Andarama with [Kuula](/en/blog/andarama-vs-kuula/) and [3DVista](/en/blog/andarama-vs-3dvista/), and rounded up the main [Matterport alternatives](/en/blog/matterport-alternatives/). And if you're coming from Marzipano and want to feel the difference an editor makes, [start a free trial](https://app.andarama.com/register?plan=paseo): your first tour takes about fifteen minutes, and the desktop app doesn't need an account at all.
