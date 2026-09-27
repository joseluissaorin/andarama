---
title: "How to view 360 photos on a PC or Mac without installing anything"
description: "How to view 360 photos on a PC or Mac without installing anything: an online 360 viewer in your browser, with fullscreen and VR. Plus desktop options."
lang: en
slug: view-360-photos-on-pc
cluster: herramientas
translationOf: ver-fotos-360-en-el-ordenador
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "Do I need software to view 360 photos on my PC?"
    a: "No. An online 360 viewer like Andarama's runs in Chrome, Firefox, Safari or Edge, on Windows, macOS and Linux, with nothing to install and without uploading the photo to any server."
  - q: "Why does my 360 photo look stretched in the Windows Photos app or in Preview?"
    a: "Because those apps show the file as it is stored, in equirectangular projection: a sphere flattened into a 2:1 rectangle. Only a 360 viewer wraps it back onto the sphere."
  - q: "Can I view 360 photos in a VR headset from my computer?"
    a: "If you have a PC VR headset running SteamVR and you use Chrome or Edge, the headset button in Andarama's viewer starts a WebXR session. You can also open the same page in the browser of a Meta Quest, Pico or Apple Vision Pro."
  - q: "How do I share a 360 photo with a link?"
    a: "A local viewer can't create links, because the photo never leaves your computer. To share it with a link you have to upload it somewhere; with Andarama you publish it on its own or as part of a tour and embed it on any website."
---

To view a 360 photo on your computer you don't need to install anything: just open it in an **online 360 viewer** that wraps it onto a sphere inside your browser. Andarama's [free online 360 photo viewer](/en/tools/360-photo-viewer/) does exactly that with equirectangular JPG and PNG files, in any modern browser, without uploading the image to a server, and with fullscreen and VR buttons. This guide explains why the photo looks wrong in your usual photo app, how to use the web viewer and what other options you have on Windows, macOS and Linux.

## Why your built-in photo viewer doesn't work

A 360 photo is stored in equirectangular projection: 360 degrees of rotation across the width and 180 degrees from top to bottom across the height, in a rectangle with a 2:1 ratio. The Windows Photos app, Preview on a Mac or any ordinary image program shows it exactly like that, so it looks stretched, with a warped sky and floor and curved straight lines. The photo isn't broken: it just needs a viewer that puts it back on the sphere. If you want to understand the format properly, we have an article on [what an equirectangular image is](/en/blog/equirectangular-image/).

## Option 1: an online 360 viewer (nothing to install)

It's the shortest route and the one we recommend for everyday use:

1. Open the online 360 viewer in your browser.
2. Click "Choose a 360 photo" or drag the file onto the dotted area. It accepts the JPG and PNG files produced by Insta360 cameras, Ricoh Theta, GoPro Max, phone panorama apps and stitching software.
3. Drag with the mouse to look around, use the scroll wheel to zoom in and out, or use the arrow keys.
4. The fullscreen button fills your monitor. The headset button starts a VR session if your browser supports WebXR.

The important part: **the photo is never uploaded**. Your browser decodes it and the WebGL engine draws it on your graphics card. That makes it safe for private photos, client material or panoramas that aren't ready to publish. And since there's no upload, there's no waiting: an 8K photo opens in a couple of seconds.

The viewer runs the same engine Andarama uses in its tours, so what you see is exactly what a visitor to a tour would see.

### Limits

The only limit is browser memory. Photos at 8192 × 4096 open without trouble on any computer; above 16K wide, the viewer automatically scales the image down so your graphics card can handle it. It also doesn't save anything: when you close the tab, the photo is gone from the viewer, which is what you'd expect from a local tool.

## Option 2: desktop software

If you prefer an installed program, each camera maker has its own, and there are general-purpose players:

| Program | Systems | What it's for |
|---|---|---|
| Insta360 Studio | Windows, macOS | Opening, stitching and exporting Insta360 photos and videos |
| Ricoh Theta desktop app | Windows, macOS | Viewing and converting Theta photos |
| GoPro Player | Windows, macOS | Viewing and exporting GoPro Max footage |
| Video players (VLC, for example) | Windows, macOS, Linux | Play 360 video with navigation; awkward for photos |

The upside: they work straight from the camera's memory card and stitch raw files. The downside: you have to install them, they're heavy, and on Linux official support is thin. To simply **look at** an already stitched photo, the web viewer is faster.

## Option 3: on your phone

Google Photos and the gallery app on many Android phones recognize the photo's XMP GPano metadata and offer a 360 view with the gyroscope. On iPhone, the Photos app doesn't wrap it: it shows up flat. The same viewer page works in your phone's browser and lets you look around by moving the phone. We cover the iPhone side in detail in [how to take a 360 photo with an iPhone](/en/blog/360-photo-iphone/).

## Viewing 360 photos in a headset

There are two routes, and both go through the same button in the viewer:

- **Standalone headsets** (Meta Quest 2, 3, 3S and Pro; Pico 4; Apple Vision Pro with Safari): open the viewer's address in the headset's browser, choose the photo and press the headset button. The photo wraps around the whole room.
- **PC VR headsets** (SteamVR with Chrome or Edge): the same page, from your computer.

WebXR only works in secure contexts, meaning pages served over HTTPS; the viewer meets that requirement. On a phone without WebXR, the viewer doesn't offer the immersive session, but it does let you look around with the gyroscope. Andarama's [VR guide](https://docs.andarama.com/en/usuario/realidad-virtual/) lists which headsets and browsers work.

## Photos that don't look right: common causes

- **There's a black band at the top or bottom.** The photo doesn't cover the full 180 degrees vertically (it's a partial panorama). The viewer opens it anyway, but that band will remain. Real 360 cameras don't have this problem; phone panorama apps do.
- **The image is cut in half or has a jump.** The file isn't equirectangular, or half of it is missing. Check that the width is exactly twice the height.
- **It looks blurry.** Not enough resolution: below 4096 × 2048, any 360 photo looks soft when wrapped, because the pixels are spread across the whole sphere.
- **The horizon is tilted.** The camera wasn't level. Stitching software has a leveling tool (roll/pitch), and so does Andarama's media library, which applies the correction without touching the original.

## When you want more than just looking

A viewer opens a photo and that's it. As soon as you want to **share it with a link**, embed it on a website, connect several photos with arrows or pin a caption on a painting, you need to publish it somewhere. That's the job of a tour editor:

- You upload your photos, and your own browser slices them into tiles so they load fast.
- You connect the scenes in a graph (each arrow is a link between two rooms).
- You publish and get an address, a QR code and the code to embed it on your website or in WordPress.

In Andarama this takes about fifteen minutes following the [getting started guide](https://docs.andarama.com/en/usuario/primeros-pasos/), and the [free 14-day trial](https://app.andarama.com/register?plan=paseo) needs no credit card. Plans start at $2 a month for a single tour. If you'd rather not depend on anyone, the software is open source and there's a desktop app that opens with a double click and keeps everything on your own computer.

## In short

- To **view** a 360 photo on your computer: the online 360 viewer, nothing to install and nothing uploaded.
- To **stitch** raw footage from the camera: the manufacturer's software.
- To **share** or **connect** several photos: a tour editor like Andarama.
