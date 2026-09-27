---
title: "Library virtual tour: a practical guide for libraries and archives"
description: "A virtual tour for a library or archive: closed stacks, gigapixel documents, anchored PDFs, lobby kiosks and accessibility. Costs and steps."
lang: en
slug: library-virtual-tour
cluster: verticales
translationOf: recorrido-360-archivo-biblioteca
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "Why build a virtual tour of a library if people can just walk in?"
    a: "To show what nobody can visit (closed stacks, conservation vaults, special collections), to orient new patrons and students, and for teaching: a class on paleography or the history of the book can step into the archive without anything leaving its box."
  - q: "How do you show a document in detail?"
    a: "As a 2D gigapixel scene: the high-resolution scan is explored with map-style zoom, with annotations anchored right on the page. Complete PDFs are linked with a hotspot."
  - q: "Can the tour run on a screen in the lobby?"
    a: "Yes, in kiosk mode: it walks through the building on its own, anyone can take over, and it starts again after a minute of inactivity. The PWA package works offline."
  - q: "Is it accessible enough for a public library website?"
    a: "Andarama generates a text-only accessible version of every tour, requires alt text on scenes and hotspots, respects reduced-motion settings and uses no cookies. We don't claim formal WCAG conformance: that depends on the whole site and on the content you add, so test it with your own accessibility team."
---

A **library virtual tour** (or an archive tour) is at its best when it shows what people can't visit: the stacks, the conservation vault, the rare book room behind a locked door, and when it puts a document within reach of a class without the document ever leaving its box. You build it from 360 photos of the spaces, high-resolution scans presented as gigapixel scenes with annotations, linked PDFs, a floor plan for each level and a text-only accessible version. This guide covers the approach, the steps, the costs, and what makes an archive different from a museum when you put one together.

You can follow along with a [free 14-day trial of Andarama](https://app.andarama.com/register?plan=paseo), no credit card required. (Full disclosure: Andarama is ours.)

## What makes a library or archive different

Compared with a [virtual museum tour](/en/blog/virtual-museum-tour/), three things change:

- **The most important spaces are usually closed.** Stacks and conservation rooms don't take visitors; a 360 tour is the only way to show them without putting the collections at risk.
- **The star object is a document**, not something in a display case: a manuscript leaf, a map, an incunabulum, an architectural drawing. People need to read it up close, not just see it in the room.
- **The audience is mixed**: curious members of the public, researchers who want to know what's there before booking an appointment, students in a course, and new patrons who need to find the circulation desk.

## Structuring the tour

A structure that works in most cases:

| Section | Scenes | Content |
|---|---|---|
| **Welcome** | Lobby, circulation desk, reading room, catalog stations | Hours, how to get a library card, how to request an item; link hotspots to the website and the catalog |
| **Stacks** | Two or three stops per stack area, the conservation vault, the preservation lab | Text on what's kept and how (temperature, humidity), audio from the person in charge |
| **Treasures** | One gigapixel scene per highlighted document | Annotations on the page itself, a transcription in a text hotspot, the complete PDF linked |
| **Teaching** | The scenes above with a quiz | Questions on paleography, book history or archival practice, with a score |

In Andarama each section is an **area** with its own color and, if it has a floor plan, its own level: visitors see a floor selector on the minimap and a scene menu grouped by area. 2D gigapixel scenes (artworks, documents, facades with map-style pan and zoom) are their own scene type, alongside 360 panoramas and 360 video.

## Documents: gigapixel, PDF and comparison slider

This is the part that adds the most value, and the part most often done poorly:

- **Gigapixel scene**: you upload the scan at whatever resolution your digitization lab produced (archives usually already have huge files) and the browser cuts it into tiles, so it can be explored with continuous zoom. On top you anchor **text** hotspots with the transcription of a passage, **floating labels** to point out a watermark or a signature, and **image** hotspots with a detail under different light.
- **PDF**: the complete document, or its catalog record, opens in the built-in PDF viewer with pagination and zoom, without leaving the tour.
- **Comparison slider**: two images with a slider for before and after conservation treatment, or the same leaf under visible and ultraviolet light.
- **Audio**: a passage read aloud, or the archivist's explanation, anchored to the document.

A preservation argument worth making: a virtual tour **reduces handling** of originals. Every question answered by looking at the scan is one less time the document comes out of its box. Put that in your proposal.

## Photographing the spaces

Stacks tend to be narrow and lit by fluorescent tubes. A few tips:

- A mid-range 360 camera on a monopod (our [360 camera buying guide](/en/blog/best-360-camera-for-real-estate/) covers the models); in narrow aisles, one photo every 13 to 16 feet so navigation doesn't jump.
- Lights on and short exposures; HDR helps with the contrast between shelving and windows.
- Name the photos by stack and floor, then rename them by pattern in the importer, which also places each photo on the floor plan with one click.
- Don't photograph what shouldn't be seen: call numbers of restricted collections, personal data on boxes, screens that are on. A nadir patch with your logo covers the tripod; for anything else, retouch before uploading.

## Publishing: website, kiosk and LMS

- **Library website**: an embed code (web component or iframe) for any CMS, with our [WordPress plugin](/en/wordpress/) if that's what you run; sharing the link shows a social card with the starting view.
- **Lobby**: the same tour in **kiosk mode** on a screen, chaining several tours, with the controls open to anyone who touches them and a return to the start after a minute. For screens without a network connection, the **PWA** package works offline.
- **Learning management system**: for an academic library, the teaching scenes can go into Moodle, Canvas or another LMS as a SCORM 1.2 or 2004 package (Formación plan or self-hosted), so the quiz score lands in the gradebook. In Moodle there's also LTI 1.3: the tour opens from Andarama, always up to date, and the grade lands in the gradebook on its own. Details in our guide to a [360 tour in Moodle](/en/blog/360-tour-in-moodle/).
- **Deep links**: every document has its own address (`#s=incunabulum-12`), so the catalog record can link straight to its scene.

## Accessibility and privacy

Public institutions have accessibility obligations (in the U.S., the ADA Title II rule for state and local government websites and Section 508 for federal agencies), and this is where 360 content usually falls short. Andarama requires alt text on every scene and every hotspot (the validator asks for it when you publish), generates a **text-only accessible version** of the entire tour, keeps focus visible with 44 px touch targets, and respects `prefers-reduced-motion`. We don't claim formal WCAG conformance: that depends on your whole site and on the content you add (image contrast, audio transcripts), so review it with your accessibility team. Analytics use no cookies and don't store IP addresses, so there's no consent banner to add, which also makes life easier for patron privacy policies.

## Costs

Software is the smallest line item. Andarama is open source and installs free on your institution's own server (Docker or a Cloudflare account), or you can use the hosted version: from $2 a month for one tour, up to the Excursión plan ($500 a year for 500 tours, without our badge and on your own domain) or the Formación plan for training ($990 a year, with SCORM, white label and your own domain). The bulk of the cost is staff time: a day of photography, two or three days of building and writing, and whatever the digitization takes, which is often already done. Our page for [universities and institutions](/en/universities/) summarizes the options for academic libraries.

## A first tour in an afternoon

Three photos (lobby, reading room, one stack area), one scanned document as a gigapixel scene with two annotations, and a PDF. That's enough to show the project to your director and decide on the rest. [Start the free trial](https://app.andarama.com/register?plan=paseo) and build it this afternoon; if you'd rather not upload anything anywhere, the desktop app runs on your own computer with no account.
