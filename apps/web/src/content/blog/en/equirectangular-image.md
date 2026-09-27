---
title: "What is an equirectangular image (and how to view one properly)"
description: "An equirectangular image is a 360-degree sphere unwrapped into a 2:1 rectangle. What it is, how to spot one and how to view it without installing anything."
lang: en
slug: equirectangular-image
cluster: conceptos
translationOf: foto-equirectangular
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "Is every 360 photo equirectangular?"
    a: "Almost every photo that comes out of a consumer 360 camera is. The exceptions are cubemaps (six square faces), unstitched dual fisheye files and the cylindrical panoramas from your phone's Pano mode, which don't cover the full sphere."
  - q: "How can I tell if my image is equirectangular?"
    a: "Check the dimensions: the width must be exactly twice the height (for example 8192 x 4096). If the sky and the floor also look stretched and straight lines curve, it's equirectangular. Many cameras also write XMP GPano metadata into the file."
  - q: "Can I open it in my computer's regular photo viewer?"
    a: "Yes, but it will look flat and distorted. To look at it as if you were standing inside it you need a 360 viewer, like Andarama's free viewer, which runs in the browser without uploading the photo anywhere."
  - q: "What resolution should it be?"
    a: "For viewing on a screen, 4096 x 2048 already looks fine. For a virtual tour or a VR headset, the usual target is 8192 x 4096 (8K), which current mid-range cameras deliver."
---

An **equirectangular image** is a 360-degree photo unwrapped onto a rectangle whose width is exactly twice its height. It's the format almost every 360 camera saves to (Insta360, Ricoh Theta, GoPro Max, Kandao), and it's what viewers, social networks and virtual tour software expect. Open it in a normal photo viewer and it looks like a stretched world map; open it in a 360 viewer and it puts you in the middle of the scene and lets you look around.

## What "equirectangular" means

The name comes from cartography. To draw the Earth on paper you have to decide how to flatten a sphere, and the equirectangular projection is the simplest option there is: every degree of longitude takes up the same width, every degree of latitude the same height. Hence "equi-rectangular": a grid of equal rectangles.

Applied to a 360 photo, the rule is the same:

- The **360 degrees of rotation** (turning left and right until you've gone all the way around) are spread across the width.
- The **180 degrees from top to bottom** (from the zenith, straight above the camera, to the nadir, straight below it) are spread across the height.

That's why the aspect ratio is always **2:1**: 360 is twice 180. A photo that measures 5760 x 2880, 8192 x 4096 or 11968 x 5984 is equirectangular; a 4000 x 3000 photo can't be.

## Why it looks strange in a regular viewer

Across the middle of the image, along the horizon, the photo looks almost normal. But as you move up toward the sky or down toward the floor, each row of pixels represents a smaller and smaller circle on the real sphere, stretched to the same width as the equator. The result is familiar:

- The **sky and the floor** are stretched horizontally until they fill the whole top and bottom rows. A single point at the zenith becomes a line running edge to edge.
- **Straight lines** (the edge of a table, a cornice, a road) bend into waves.
- The **tripod** or the photographer's hand shows up warped at the bottom, because the nadir is exactly the spot the camera sees worst.

None of this is a flaw in the photo. It's the geometry of flattening a sphere, and it disappears as soon as a viewer wraps the image back onto a virtual sphere and puts you at its center.

## How to recognize an equirectangular image

Three quick checks:

1. **The dimensions.** Width equals twice the height. This is the definitive test.
2. **The metadata.** Cameras and many apps write XMP tags from the GPano schema (`ProjectionType = equirectangular`, `FullPanoWidthPixels` and so on). That's how Facebook or Google Photos recognize them automatically. Andarama reads them too: when you upload an image, it detects a panorama from that metadata or, if it's missing, from the 2:1 ratio.
3. **The look.** Stretched sky and floor, curved lines, and a seamless match between the left and right edges (they're the same point on the sphere).

## Formats that aren't equirectangular (and get confused with it)

| Format | What it is | How to tell |
|---|---|---|
| Cylindrical panorama | The Pano mode on an iPhone or Android phone: a horizontal sweep | Very wide and short (4:1 or more); doesn't cover sky or floor |
| Dual fisheye | What the two lenses of a 360 camera record before stitching | Two circles side by side on a black background |
| Cubemap | Six square faces of a cube | Six files, or a cross or strip of squares |
| Stereographic (little planet) | An artistic projection from the zenith | A disc with the ground in the middle |

They can all be converted into one another. For equirectangular to cubemap and back, there's Andarama's free [equirectangular to cubemap converter](/en/tools/equirectangular-to-cubemap/), and we explain when you actually need it in [what is a cubemap](/en/blog/what-is-a-cubemap/). For the planet effect, see our guide to [making a little planet photo](/en/blog/little-planet-photo/).

## How to view an equirectangular image without installing anything

The fastest way is the [online 360 photo viewer](/en/tools/360-photo-viewer/): pick the JPG or PNG file, it appears wrapped around the sphere, and you can drag to look around, scroll to zoom, go full screen and, if your browser supports WebXR, put on a headset. The photo is never uploaded to a server; the WebGL engine draws it on your own graphics card.

Other options, each with a catch:

- **Your phone**: Google Photos and the gallery app on many Android phones read the GPano metadata and offer the 360 view with the gyroscope. If the metadata is missing, the photo shows up flat.
- **Facebook**: upload an equirectangular photo with metadata and it's published as a navigable 360 photo.
- **Desktop software**: the cameras' own apps (Insta360 Studio, the Ricoh Theta app) open it in 360, but you have to install them.
- **A virtual tour**: if you want several photos linked together, with arrows to move from room to room and notes pinned in place, you're no longer talking about a viewer but a tour editor, and that's what the rest of Andarama is for.

We have a more detailed guide on [how to view 360 photos on a PC or Mac](/en/blog/view-360-photos-on-pc/).

## What resolution you need

An equirectangular image spreads its pixels across the whole sphere, so it looks much less sharp than a normal photo with the same megapixel count. A practical guide:

- **4096 x 2048** (8 MP): enough to view on a phone or share on social media.
- **5760 x 2880** (16 MP): typical output from consumer cameras a few years ago; fine on a screen.
- **8192 x 4096** (32 MP, "8K"): what the Insta360 X4 and X5 or the Ricoh Theta Z1 deliver after stitching. It's the comfortable minimum for VR headsets and for tours where visitors zoom in.
- **Beyond 8K**: you get there with hand-stitched bracketed shots or professional rigs. To serve those on the web they have to be cut into tiles; Andarama does this in the browser on upload, with tile pyramids up to 32K.

## The nadir: the detail that gives away a sloppy photo

Right below the camera sits the tripod, the monopod or the hand of whoever took the shot. In an equirectangular image that single point is the entire bottom row, and in a 360 viewer it becomes a circle under the visitor's feet. You can cover it with a logo (a "nadir patch"), retouch it in an image editor, or shoot on a thin monopod that the camera removes during stitching. Andarama includes a nadir patch with your logo among its image tools, along with horizon leveling and setting the starting view, and all of it is applied without touching the original file.

## From format to tour

Understanding equirectangular images is mostly useful for what comes next: choosing a camera, deciding on resolution, preparing the photos and, if needed, converting them. From there, a viewer shows you one photo; a tour editor lets you link twenty, add text, audio or quiz questions, and publish them with a link or inside your own website. If that's where you're headed, the [getting started guide](https://docs.andarama.com/en/usuario/primeros-pasos/) walks you through a first tour in about fifteen minutes, and you can [start a 14-day free trial](https://app.andarama.com/register?plan=paseo) with no credit card.
