---
title: "Equirectangular to cubemap: what it is and when you need it"
description: "A cubemap stores a 360 panorama as six square faces. When to convert equirectangular to cubemap (3D engines, skyboxes) and how to do it for free."
lang: en
slug: what-is-a-cubemap
cluster: herramientas
translationOf: que-es-un-cubemap
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "What face size should I pick when converting?"
    a: "The width of the equirectangular image divided by four. An 8192 px wide panorama gives 2048 px faces; a 4096 px one gives 1024 px faces. Going bigger only adds file size, not detail."
  - q: "What are the six faces called?"
    a: "It depends on the software. Marzipano and krpano use f, b, l, r, u, d (front, back, left, right, up, down); Unity and Three.js use px, nx, py, ny, pz, nz. Andarama's converter offers both conventions."
  - q: "Can I go back from a cubemap to equirectangular?"
    a: "Yes. The same tool stitches six faces into a single 2:1 panorama, which is handy for recovering a skybox, a Blender render exported as a cube, or a photo from a camera that exports faces."
  - q: "Does it work for 360 video?"
    a: "No, images only. To convert video between projections you need desktop software such as FFmpeg with its v360 filter."
---

A **cubemap** is a way of storing a 360-degree panorama as **six square images**, one for each face of an imaginary cube surrounding the camera: front, back, left, right, up and down. It's the format 3D engines, video game skyboxes, reflection maps and many 360 viewers expect, while cameras deliver their photos in equirectangular projection. Converting from one to the other is a simple bit of geometry that Andarama's [equirectangular to cubemap converter](/en/tools/equirectangular-to-cubemap/) does right in your browser, in both directions, without uploading anything.

## Two ways to flatten the same sphere

Equirectangular images and cubemaps contain exactly the same information: everything visible around a single point. What changes is how that information is laid out in pixels.

- **Equirectangular** unwraps the sphere into a single 2:1 rectangle. It's convenient to store, edit and share, but it heavily distorts the poles: the row of pixels at the zenith, which in reality is a single point, spans the entire width. We cover this in depth in [what is an equirectangular image](/en/blog/equirectangular-image/).
- A **cubemap** projects the sphere onto six planes. Each face is a normal photo with a 90-degree field of view and rectilinear perspective, with no stretching at the poles. The trade-off is six files instead of one, and seams between faces that have to be handled carefully.

For a graphics engine, the second option is much better: each face is an ordinary texture the GPU can sample directly, without correcting any distortion. That's why cubemaps are the standard in real-time 3D.

## When you need to convert to a cubemap

| Use case | Why a cubemap |
|---|---|
| Skybox in Unity, Unreal or Godot | Engines ask for six textures or a native cubemap |
| Environments in Three.js or Babylon.js | `CubeTextureLoader` and its equivalents load the six faces |
| Reflection and lighting maps (HDRI) | Sampling by direction is direct and distortion-free |
| Tiled 360 viewers (Marzipano, krpano) | They slice each face into zoom levels; square tiles are more efficient |
| Grabbing a 90-degree view without distortion | One face is a normal rectilinear photo, ready to use |

The last one is often overlooked and is really practical: if you need a "normal photo" of whatever was directly in front of the 360 camera, the front face of the cubemap is exactly that.

## When you don't need it

- **To look at the photo** in a web viewer, on social media or on your phone. They all expect the equirectangular file with its metadata. For that, see [how to view 360 photos on a PC or Mac](/en/blog/view-360-photos-on-pc/).
- **To edit it** in a photo editor: a 2:1 rectangle is easier to work with than six squares with seams.
- **To upload it to a tour editor.** Andarama, for example, takes the equirectangular image and generates the cube tile pyramid its viewer uses by itself, in the browser (equirectangular to cube faces to zoom levels to 512 px WebP tiles). There's nothing to convert by hand.

## How to convert equirectangular to cubemap online

1. Open the converter and choose your panorama (a 2:1 JPG or PNG).
2. Pick the **face size**. The rule is the panorama's width divided by four: 8192 wide gives 2048 px faces; 4096 gives 1024 px faces. A bigger size doesn't add detail, just weight.
3. Pick the **naming convention**: `f, b, l, r, u, d` (Marzipano and krpano) or `px, nx, py, ny, pz, nz` (Unity, Three.js).
4. Download the six faces individually or as a ZIP.

Everything is computed on a Canvas inside your browser: for each pixel of each face, the tool traces the direction from the center of the cube, turns it into longitude and latitude, and reads the matching point in the equirectangular image. It's the same geometry Andarama's tiler uses to prepare tours. No image ever leaves your computer.

## And from cubemap back to equirectangular

The reverse trip lives on the same page: select the six faces, set their order, and the tool stitches them into a single 2:1 panorama ready for any viewer, for social media, or for uploading to a tour. Typical cases:

- A **skybox** from a video game or an asset library that you want to see as a panorama.
- A **Blender render** or output from another 3D program exported as a cube.
- A **camera** or stitching program that delivers faces (some professional cameras do).

## Axis conventions cause more headaches than you'd think

Here's the usual trap: not every program names the faces the same way or orients them the same way. Marzipano and krpano use front, back, left, right, up and down; Unity and Three.js use signed axes (+X, -X, +Y, -Y, +Z, -Z), and some engines expect the top face rotated 90 or 180 degrees compared to others. If the sky shows up sideways or the floor has crossed seams, the conversion isn't wrong: the destination just uses a different convention. The converter offers the two most common conventions; for anything else, rotating the top and bottom faces usually does the trick.

## Resolution and file size

Six 2048 px faces saved as PNG weigh quite a bit more than the 8192 x 4096 equirectangular they came from, because PNG compresses losslessly. For a production skybox, convert the faces to JPG or WebP afterward, or go straight for the face size your engine will actually display: for a scene viewed on a phone, 1024 px faces are plenty.

For 360 video, conversion between projections can't be done in the browser with this tool; you'll need FFmpeg and its `v360` filter, which converts between equirectangular, cubemap and other projections frame by frame.

## If what you want is a tour

Converting to a cubemap makes sense when you're going to build something in 3D. If what you want is to link several 360 photos into a tour that opens from a link, with arrows between rooms, text and quiz questions, you can skip the conversion: upload the equirectangular files to Andarama and the cube tiling happens on its own. The [getting started guide](https://docs.andarama.com/en/usuario/primeros-pasos/) covers the whole process in about fifteen minutes, you can [try it free for 14 days](https://app.andarama.com/register?plan=paseo) without a credit card, and since the software is open source (EUPL-1.2), you can also install it on your own computer or server for free.
