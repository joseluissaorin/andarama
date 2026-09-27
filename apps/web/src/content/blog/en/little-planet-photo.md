---
title: "How to make a little planet photo from a 360 image"
description: "A little planet is the stereographic projection of a 360 photo. How to make one for free in your browser, and which photos give the best results."
lang: en
slug: little-planet-photo
cluster: herramientas
translationOf: little-planet
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "What is a little planet or tiny planet?"
    a: "It's a 360 photo projected onto a flat plane from the zenith (a stereographic projection). The ground ends up in the middle of a disc, buildings grow outward and the sky wraps around the edge, like a miniature planet."
  - q: "Do I need a 360 camera to make a little planet?"
    a: "You need a complete equirectangular photo, which is what a 360 camera produces. With a phone panorama that doesn't cover the sky and the ground, the center and the edge of the planet will come out empty or repeated."
  - q: "Can I put the sky in the middle (the tunnel effect)?"
    a: "Andarama's tool currently makes the classic planet, with the ground in the center. The tunnel version, with the sky in the center, is on our to-do list."
  - q: "What resolution can I download?"
    a: "Anywhere from 512 to 4096 pixels square, as a PNG with no watermark. From an 8K photo, a 4096 px planet comes out sharp."
---

A **little planet** (also called a *tiny planet*) is what you get when a 360 photo is projected onto a flat plane from the very top of the sphere: the ground gathers in the middle of a disc, buildings and trees grow outward like spokes, and the sky wraps around the edge. You don't need Photoshop or any software to make one: Andarama's free [little planet maker](/en/tools/little-planet-maker/) computes it in your browser from any equirectangular photo and downloads it as a PNG. This guide explains how it works, which photos give the best results, and which settings make the difference.

## What exactly is a little planet?

A 360 photo is stored as an equirectangular projection: a 2:1 rectangle with the sphere flattened out (we explain it in [what an equirectangular image is](/en/blog/equirectangular-image/)). A little planet is another way of flattening the same sphere: the **stereographic projection**, the one mapmakers have long used to draw the poles.

Picture the sphere resting on a flat surface at its nadir (the point directly below the camera), and project every point from the zenith (the point directly above the camera) down onto that surface. That gives you:

- The **nadir** in the center of the disc.
- The **horizon** as a circle about halfway out.
- The **zenith** pushed out to infinity, so the sky fills the whole outer edge and fades away.

The result is a round image where everything around the camera fits in one frame. It's the most photogenic way to sum up a 360 photo in a single square image, which is why it works so well on Instagram, as a cover image and as a thumbnail. Andarama uses it for exactly that: when you hover over a panorama in the media library, it shows it as a little planet, because you recognize the room at a glance far better than from a rectangular crop.

## How to make one in three steps

1. Open the little planet maker and choose an equirectangular photo (a 2:1 JPG or PNG). Any photo from an Insta360, Ricoh Theta, GoPro Max or stitching software will do.
2. Adjust the **rotation** to decide which part of the scene ends up at the top, and the **aperture** to bring the horizon closer or push it away. The planet updates instantly.
3. Pick the **output size** (512 to 4096 pixels square) and the **background** (transparent, white, black or paper), then click "Download the planet as PNG."

Your photo never leaves your computer: the math runs pixel by pixel in your browser, using the same routine as Andarama's media library. The PNG is yours, with no watermark.

## What rotation and aperture do

Both controls change the result a lot, so they're worth understanding:

| Control | What it changes | When to use it |
|---|---|---|
| Rotation | Spins the sphere around its vertical axis before projecting | To put the main building at the top, or line a street up vertically |
| Aperture | The distance of the projection point; it's like zooming the horizon in or out | Small aperture: a compact planet with lots of sky. Large aperture: the ground fills almost the whole disc |
| Size | The pixel dimensions of the final PNG | 2048 for social media, 4096 for printing or cropping |
| Background | What fills the corners outside the disc | Transparent, to drop it onto another design |

A practical tip: start with the aperture at its minimum and raise it little by little. There's a point, different for every photo, where the horizon forms a clean circle and tall objects stick out from the planet without touching the edge; that's usually the one.

## Which photos make the best planets

Not every 360 photo works equally well. The ones that turn out best have a few things in common:

- **A clean nadir.** The center of the disc is the ground right under the camera. If there's a tripod, a hand or an odd shadow there, it's the first thing anyone sees. A thin monopod that the camera erases during stitching, or a nadir patch (a fix Andarama applies in the media library), solves the problem.
- **An open horizon and an interesting sky.** Town squares, courtyards, beaches, summits, rooftops. A sky with clouds gives the edge some texture; a flat white sky blends into the background.
- **Tall elements spread all around.** Trees, streetlights, towers: they become the planet's spokes and give it structure. A narrow street, on the other hand, produces two walls closing in.
- **A level photo.** The projection exaggerates any tilt: if the horizon is crooked in the equirectangular image, the planet's circle will come out oval. Fix it first with the leveling in your stitching software.

Interiors work too, with a different feel: the floor becomes a disc of hardwood or tile and the walls and ceiling open up around it. It's a great way to present a museum gallery or a classroom in a thumbnail.

## Effects you can create

- **Classic planet**: ground in the middle, sky outside. That's what the tool does.
- **Tunnel** (or *inverted planet*): the sky in the middle and the ground around it. You get it by projecting from the nadir instead of the zenith. The tool doesn't do this yet; it's on the list.
- **Framed planet**: rotating the sphere before projecting so that the top of the planet is a specific street or facade. That's what the rotation control is for.

## What it's used for

Beyond simply looking good, the little planet has some very practical uses:

- **Tour thumbnails**: a cover image that shows the whole room. In Andarama, the social card for a published tour uses the real view of the starting scene, and the library shows planets when you hover.
- **Social media**: a square image, ready for Instagram, with nothing cropped out.
- **Teaching**: to explain what a projection is, a little planet next to its equirectangular original is worth more than any definition. Pair it with our explainer on [what a cubemap is](/en/blog/what-is-a-cubemap/) for a full lesson on how a sphere gets flattened.
- **Printing**: at 4096 px you can print a 12-inch square at good quality.

## And inside the tour

Andarama's viewer can also **switch projections live**: besides the normal view, it offers little planet, fisheye and Panini on any scene of a tour. In other words, you don't have to prepare a PNG for a visitor to see the planet: they can switch to that view, spin it and switch back. If you just want to look at your 360 photos on a computer first, we cover the options in [how to view 360 photos on a PC](/en/blog/view-360-photos-on-pc/), and our guide to [360 photos on the iPhone](/en/blog/360-photo-iphone/) explains what a phone can and can't capture.

If you'd like to show your photos like this inside a tour, with text and links between scenes, you can [try Andarama free for 14 days](https://app.andarama.com/register?plan=paseo) with no credit card; your first tour takes about fifteen minutes. (Andarama is ours, as is the little planet maker, which stays free with no account.)
